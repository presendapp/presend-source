// POST /api/qr-scan
//
// Reads a QR code from an uploaded image (JPEG or PNG), and if the
// decoded content is a URL, checks it against URLhaus for malware/
// phishing indicators -- decode + reputation check in one call.
//
// QR code phishing ("quishing") is one of the fastest-growing phishing
// vectors: it bypasses traditional text-based email/link filters since
// the malicious URL is hidden inside an image. Very few free tools
// combine QR decoding with a reputation check in a single step.

import decodeJpeg from '../../vendor/jpeg-decoder.js';
import { decodePng } from '../../vendor/png-decoder.js';
import * as JsQRNS from '../../vendor/jsqr.js';
import { checkReputation } from '../_shared/url-reputation-check.js';

const jsQR = JsQRNS.default || JsQRNS;

async function checkRateLimit(env, clientIP, bucket, isTest = false) {
  if (!env.PRESEND_ANALYTICS) return true;
  try {
    const now = Math.floor(Date.now() / 60000);
    const rateKey = `rate:${bucket}:${clientIP}:${now}`;
    let count = await env.PRESEND_ANALYTICS.get(rateKey);
    count = count ? parseInt(count) : 0;
    if (count >= 20) return false;
    // Écriture échantillonnée (1 sur 5) pour économiser le quota KV --
    // légèrement moins précis en rafale, mais protège toujours contre un abus soutenu.
    if (Math.random() < 1 / 5) {
      await env.PRESEND_ANALYTICS.put(rateKey, (count + 5).toString(), { expirationTtl: 120 });
    }
  } catch (e) {
    // KV en panne ou quota dépassé -- ne doit jamais faire planter la requête.
    return true;
  }

  try {
    if (!isTest && Math.random() < 0.1) {
      const today = new Date().toISOString().split('T')[0];
      const visitKey = `api-visits:${bucket}:${today}`;
      const visits = await env.PRESEND_ANALYTICS.get(visitKey);
      await env.PRESEND_ANALYTICS.put(visitKey, ((visits ? parseInt(visits) : 0) + 10).toString());
    }
  } catch (e) { /* tracking best-effort */ }

  return true;
}

function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...extra,
  };
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;

async function decodeImage(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const type = (file.type || '').toLowerCase();

  if (type.includes('png') || (buf[0] === 0x89 && buf[1] === 0x50)) {
    return await decodePng(buf);
  }
  if (type.includes('jpeg') || type.includes('jpg') || (buf[0] === 0xff && buf[1] === 0xd8)) {
    return decodeJpeg(buf, { useTArray: true });
  }
  throw new Error('Unsupported format. Only JPEG and PNG are supported.');
}

function looksLikeUrl(text) {
  try {
    const u = new URL(text);
    return ['http:', 'https:'].includes(u.protocol);
  } catch (e) {
    return false;
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestGet() {
  return new Response(JSON.stringify({
    usage: 'POST multipart/form-data with 1 JPEG/PNG image under the "file" field',
    example: 'curl -X POST -F "file=@qrcode.png" https://presend.pages.dev/api/qr-scan',
    note: 'If the decoded content is a URL, it is also checked against URLhaus for known malware/phishing indicators.',
  }, null, 2), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
  const isTest = request.headers.get('X-Presend-Test') === '1';

  const allowed = await checkRateLimit(env, clientIP, 'qrscan', isTest);
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 20 requests per minute.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return new Response(JSON.stringify({ error: 'Expected multipart/form-data with a "file" field.' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return new Response(JSON.stringify({ error: 'Provide exactly one image under the "file" field.' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
    if (file.size > MAX_FILE_SIZE) {
      return new Response(JSON.stringify({ error: `File must be under ${MAX_FILE_SIZE / (1024 * 1024)}MB.` }), {
        status: 413, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    const image = await decodeImage(file);
    const result = jsQR(image.data, image.width, image.height);

    if (!result) {
      return new Response(JSON.stringify({ found: false, message: 'No QR code detected in this image.' }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders() },
      });
    }

    const content = result.data;
    const isUrl = looksLikeUrl(content);

    let reputation = null;
    let verdict = 'QR code decoded. Content is not a URL, so no reputation check was run.';

    if (isUrl) {
      reputation = await checkReputation(content, env);
      if (reputation.malicious === true) {
        verdict = `⚠️ This QR code links to a site flagged as malicious (${reputation.threat || 'unspecified threat'}). Do not visit it.`;
      } else if (reputation.malicious === false) {
        verdict = 'QR code links to a URL not currently flagged by URLhaus. This does not guarantee safety — only that it is not currently listed.';
      } else {
        verdict = 'QR code decoded, but the reputation check could not be completed right now.';
      }
    }

    return new Response(JSON.stringify({
      found: true,
      content,
      is_url: isUrl,
      reputation,
      verdict,
    }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders() },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Could not process this image.', detail: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
}
