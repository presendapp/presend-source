// POST plusieurs fichiers PDF en multipart/form-data (champ "files"), reçois un
// PDF fusionné et compressé en une seule réponse.
// Usage: curl -X POST -F "files=@a.pdf" -F "files=@b.pdf" https://presend.pages.dev/api/merge-and-compress-pdf -o merged.pdf

import * as PDFLibNS from '../../vendor/pdf-lib.min.js';
const PDFDocument = PDFLibNS.PDFDocument || (PDFLibNS.default && PDFLibNS.default.PDFDocument);

async function checkRateLimit(env, clientIP, bucket, isTest = false) {
  if (!env.PRESEND_ANALYTICS) return true;
  try {
    const now = Math.floor(Date.now() / 60000);
    const rateKey = `rate:${bucket}:${clientIP}:${now}`;
    let count = await env.PRESEND_ANALYTICS.get(rateKey);
    count = count ? parseInt(count) : 0;
    if (count >= 10) return false; // plus coûteux en CPU que hash.js, quota plus bas
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

const MAX_TOTAL_SIZE = 30 * 1024 * 1024; // 30MB total across all files
const MAX_FILES = 20;

function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...extra,
  };
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestGet() {
  return new Response(JSON.stringify({
    usage: 'POST multipart/form-data with 2+ PDF files under the "files" field',
    example: 'curl -X POST -F "files=@a.pdf" -F "files=@b.pdf" https://presend.pages.dev/api/merge-and-compress-pdf -o merged.pdf',
    max_files: MAX_FILES,
    max_total_size_bytes: MAX_TOTAL_SIZE,
  }, null, 2), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

  const allowed = await checkRateLimit(env, clientIP, 'merge-and-compress-pdf', request.headers.get('X-Presend-Test') === '1');
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 10 requests per minute.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return new Response(JSON.stringify({ error: 'Expected multipart/form-data with "files" fields.' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  try {
    const formData = await request.formData();
    const fileEntries = formData.getAll('files');

    if (fileEntries.length < 2) {
      return new Response(JSON.stringify({ error: 'Please provide at least 2 PDF files under the "files" field.' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
    if (fileEntries.length > MAX_FILES) {
      return new Response(JSON.stringify({ error: `Too many files. Max ${MAX_FILES}.` }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    let totalSize = 0;
    const buffers = [];
    for (const entry of fileEntries) {
      if (!(entry instanceof File)) continue;
      const buf = await entry.arrayBuffer();
      totalSize += buf.byteLength;
      if (totalSize > MAX_TOTAL_SIZE) {
        return new Response(JSON.stringify({
          error: `Total size exceeds ${MAX_TOTAL_SIZE / (1024 * 1024)}MB limit.`,
        }), { status: 413, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
      }
      buffers.push(buf);
    }

    // Step 1: merge
    const merged = await PDFDocument.create();
    for (const buf of buffers) {
      const pdf = await PDFDocument.load(buf);
      const pages = await merged.copyPages(pdf, pdf.getPageIndices());
      pages.forEach((p) => merged.addPage(p));
    }
    const mergedBytes = await merged.save();

    // Step 2: compress the merged result (strip metadata + object streams)
    const finalDoc = await PDFDocument.load(mergedBytes, { updateMetadata: false });
    finalDoc.setTitle('');
    finalDoc.setAuthor('');
    finalDoc.setSubject('');
    finalDoc.setKeywords([]);
    finalDoc.setProducer('');
    finalDoc.setCreator('');
    const compressedBytes = await finalDoc.save({ useObjectStreams: true, addDefaultPage: false });

    return new Response(compressedBytes, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="merged-compressed.pdf"',
        'Cache-Control': 'no-store',
        'X-Original-Total-Bytes': String(totalSize),
        'X-Output-Bytes': String(compressedBytes.byteLength),
        'X-Page-Count': String(finalDoc.getPageCount()),
        ...corsHeaders(),
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({
      error: 'Could not process these PDFs. They may be encrypted or corrupted.',
      detail: e.message,
    }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }
}
