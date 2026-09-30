// POST un fichier en binaire brut, reçois les hash SHA-256/SHA-1/SHA-512.
// Usage: curl -X POST --data-binary @fichier.pdf https://presend.pages.dev/api/hash


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

  // Tracking d'usage échantillonné (1 requête sur 10, multiplié par 10) pour économiser
  // le quota d'écritures KV — best-effort, ne bloque jamais la requête si ça échoue.
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

const MAX_SIZE = 20 * 1024 * 1024; // 20MB — limite CPU/mémoire raisonnable pour Workers gratuit
const ALGOS = ['SHA-256', 'SHA-1', 'SHA-512'];

function bufToHex(buf) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

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
    usage: 'POST des octets bruts (Content-Type: application/octet-stream)',
    example: 'curl -X POST --data-binary @fichier.pdf https://presend.pages.dev/api/hash',
    max_size_bytes: MAX_SIZE,
    algorithms: ALGOS,
  }, null, 2), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

  const allowed = await checkRateLimit(env, clientIP, 'hash', request.headers.get('X-Presend-Test') === '1');
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 30 requests per minute.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
  if (contentLength > MAX_SIZE) {
    return new Response(JSON.stringify({
      error: `Fichier trop volumineux. Max ${MAX_SIZE / (1024 * 1024)}MB via API. Utilise l'outil navigateur pour les fichiers plus gros.`,
    }), { status: 413, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  try {
    const buffer = await request.arrayBuffer();
    if (buffer.byteLength === 0) {
      return new Response(JSON.stringify({ error: 'Corps de requête vide.' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
    if (buffer.byteLength > MAX_SIZE) {
      return new Response(JSON.stringify({
        error: `Fichier trop volumineux. Max ${MAX_SIZE / (1024 * 1024)}MB via API.`,
      }), { status: 413, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
    }

    const hashes = {};
    for (const algo of ALGOS) {
      const digest = await crypto.subtle.digest(algo, buffer);
      hashes[algo.toLowerCase().replace('-', '')] = bufToHex(digest);
    }

    return new Response(JSON.stringify({
      size_bytes: buffer.byteLength,
      hashes,
    }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders() },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Impossible de hasher ce fichier.', detail: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
}
