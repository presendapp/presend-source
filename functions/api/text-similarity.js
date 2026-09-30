// POST /api/text-similarity
// Body: {"texts": ["..."]} for a hash only, or {"texts": ["...", "..."]}
// to directly compare two texts for near-duplicate content.
//
// Uses SimHash (locality-sensitive hashing over word shingles) -- the
// text equivalent of /api/image-similarity's perceptual image hash.
// Detects paraphrased or lightly-edited near-duplicate content, unlike
// a cryptographic hash which changes completely on any character
// difference. Useful for catching copy-pasted/reworded duplicate
// articles, comments, or listings.

import { simHash } from '../_shared/simhash.js';
import { hammingDistance, similarityPercent } from '../_shared/perceptual-hash.js';

async function checkRateLimit(env, clientIP, bucket, isTest = false) {
  if (!env.PRESEND_ANALYTICS) return true;
  try {
    const now = Math.floor(Date.now() / 60000);
    const rateKey = `rate:${bucket}:${clientIP}:${now}`;
    let count = await env.PRESEND_ANALYTICS.get(rateKey);
    count = count ? parseInt(count) : 0;
    if (count >= 30) return false;
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

const MAX_TEXT_LENGTH = 200000; // ~200KB of text, generous for articles/documents

// Thresholds calibrated empirically against real SimHash output (not
// ported directly from the image-hash thresholds, which have different
// baseline statistics): identical text scores 100%, a single word change
// scores ~84%, a moderate paraphrase ~77%, and genuinely unrelated text
// clusters around 50-56% (the statistical baseline for random 64-bit
// hashes, not 0%).
function verdictFor(similarity) {
  if (similarity >= 95) return 'Near-identical (likely the same text, possibly with trivial edits).';
  if (similarity >= 80) return 'Very similar (likely paraphrased or lightly edited from the same source).';
  if (similarity >= 60) return 'Somewhat similar -- some shared phrasing, but meaningfully different content.';
  return 'Different content. Note: unrelated texts typically score close to 50% by chance with this method, not 0%.';
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestGet() {
  return new Response(JSON.stringify({
    usage: 'POST JSON body: {"texts": ["text one"]} for a hash only, or {"texts": ["text one", "text two"]} to compare.',
    example_hash_only: 'curl -X POST -H "Content-Type: application/json" -d \'{"texts":["some text"]}\' https://presend.pages.dev/api/text-similarity',
    example_compare: 'curl -X POST -H "Content-Type: application/json" -d \'{"texts":["text a","text b"]}\' https://presend.pages.dev/api/text-similarity',
    note: 'Uses SimHash over word shingles -- detects near-duplicate/paraphrased content, not just exact matches. Unrelated texts typically score ~50% similarity by chance, not 0%.',
  }, null, 2), { headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
  const isTest = request.headers.get('X-Presend-Test') === '1';

  const allowed = await checkRateLimit(env, clientIP, 'textsimilarity', isTest);
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 30 requests per minute.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Expected a JSON body.' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const texts = Array.isArray(body.texts) ? body.texts.filter((t) => typeof t === 'string') : [];
  if (texts.length < 1 || texts.length > 2) {
    return new Response(JSON.stringify({ error: 'Provide 1 text (hash only) or 2 texts (compare) in a "texts" array.' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
  for (const t of texts) {
    if (t.length > MAX_TEXT_LENGTH) {
      return new Response(JSON.stringify({ error: `Each text must be under ${MAX_TEXT_LENGTH} characters.` }), {
        status: 413, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
  }

  const hashes = texts.map((t) => simHash(t));

  if (hashes.some((h) => h === null)) {
    return new Response(JSON.stringify({ error: 'One or more texts had no usable content after normalization.' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  if (texts.length === 1) {
    return new Response(JSON.stringify({
      length: texts[0].length,
      hash: hashes[0],
      hash_bits: 64,
    }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders() },
    });
  }

  const distance = hammingDistance(hashes[0], hashes[1]);
  const similarity = similarityPercent(distance);

  return new Response(JSON.stringify({
    texts: texts.map((t, i) => ({ length: t.length, hash: hashes[i] })),
    hamming_distance: distance,
    similarity_percent: similarity,
    verdict: verdictFor(similarity),
  }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders() },
  });
}
