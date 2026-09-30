// POST /api/image-similarity
// Accepts 1 or 2 images (JPEG or PNG) via multipart/form-data under the
// "files" field.
//   - 1 image  -> returns its perceptual hash (dHash, 64-bit hex).
//   - 2 images -> returns both hashes plus a Hamming-distance comparison
//                 and a similarity verdict.
//
// Unlike a cryptographic hash (SHA-256 etc.), this survives lossy
// re-compression, minor resizing, and small edits -- two images that
// LOOK the same will hash close together even if their bytes differ
// completely. Useful for duplicate/near-duplicate detection.

import decodeJpeg from '../../vendor/jpeg-decoder.js';
import { decodePng } from '../../vendor/png-decoder.js';
import { dHash, hammingDistance, similarityPercent } from '../_shared/perceptual-hash.js';

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

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB -- pixel decoding is CPU-bound, keep this conservative

async function decodeImage(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const type = (file.type || '').toLowerCase();

  if (type.includes('png') || (buf[0] === 0x89 && buf[1] === 0x50)) {
    return await decodePng(buf);
  }
  if (type.includes('jpeg') || type.includes('jpg') || (buf[0] === 0xff && buf[1] === 0xd8)) {
    return decodeJpeg(buf, { useTArray: true });
  }
  throw new Error(`Unsupported format for "${file.name || 'file'}". Only JPEG and PNG are supported.`);
}

function verdictFor(similarity) {
  if (similarity >= 95) return 'Near-identical (likely the same image, possibly re-compressed or lightly edited).';
  if (similarity >= 85) return 'Very similar.';
  if (similarity >= 70) return 'Somewhat similar.';
  return 'Different images.';
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestGet() {
  return new Response(JSON.stringify({
    usage: 'POST multipart/form-data with 1 or 2 JPEG/PNG files under the "files" field',
    example_hash_only: 'curl -X POST -F "files=@photo.jpg" https://presend.pages.dev/api/image-similarity',
    example_compare: 'curl -X POST -F "files=@a.jpg" -F "files=@b.png" https://presend.pages.dev/api/image-similarity',
    note: 'Perceptual hash (dHash) -- survives re-compression and minor edits, unlike a cryptographic hash.',
  }, null, 2), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
  const isTest = request.headers.get('X-Presend-Test') === '1';

  const allowed = await checkRateLimit(env, clientIP, 'imagesimilarity', isTest);
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 20 requests per minute.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return new Response(JSON.stringify({ error: 'Expected multipart/form-data with "files" field(s).' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  try {
    const formData = await request.formData();
    const files = formData.getAll('files').filter((f) => f instanceof File);

    if (files.length < 1 || files.length > 2) {
      return new Response(JSON.stringify({ error: 'Provide 1 file (hash only) or 2 files (compare).' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
    for (const f of files) {
      if (f.size > MAX_FILE_SIZE) {
        return new Response(JSON.stringify({ error: `Each file must be under ${MAX_FILE_SIZE / (1024 * 1024)}MB.` }), {
          status: 413, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        });
      }
    }

    const decoded = await Promise.all(files.map((f) => decodeImage(f)));
    const hashes = decoded.map((img) => dHash(img.data, img.width, img.height));

    if (files.length === 1) {
      return new Response(JSON.stringify({
        filename: files[0].name || null,
        width: decoded[0].width,
        height: decoded[0].height,
        hash: hashes[0],
        hash_bits: 64,
      }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders() },
      });
    }

    const distance = hammingDistance(hashes[0], hashes[1]);
    const similarity = similarityPercent(distance);

    return new Response(JSON.stringify({
      files: files.map((f, i) => ({
        filename: f.name || null,
        width: decoded[i].width,
        height: decoded[i].height,
        hash: hashes[i],
      })),
      hamming_distance: distance,
      similarity_percent: similarity,
      verdict: verdictFor(similarity),
    }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders() },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Could not process these images.', detail: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
}
