// GET /api/password?length=16&symbols=1&numbers=1&uppercase=1&exclude_ambiguous=1

async function checkRateLimit(env, clientIP, bucket, isTest = false) {
  if (!env.PRESEND_ANALYTICS) return true;
  try {
    const now = Math.floor(Date.now() / 60000);
    const rateKey = `rate:${bucket}:${clientIP}:${now}`;
    let count = await env.PRESEND_ANALYTICS.get(rateKey);
    count = count ? parseInt(count) : 0;
    if (count >= 60) return false;
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

function corsHeaders(extra = {}) {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', ...extra };
}

const CHARS = {
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  numbers: '0123456789',
  symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?',
};
const AMBIGUOUS = 'il1Lo0O';

function generatePassword(opts) {
  let pool = CHARS.lowercase;
  if (opts.uppercase) pool += CHARS.uppercase;
  if (opts.numbers) pool += CHARS.numbers;
  if (opts.symbols) pool += CHARS.symbols;
  if (opts.excludeAmbiguous) {
    pool = pool.split('').filter((c) => !AMBIGUOUS.includes(c)).join('');
  }
  if (pool.length === 0) throw new Error('No character set selected');

  const bytes = crypto.getRandomValues(new Uint32Array(opts.length));
  let result = '';
  for (let i = 0; i < opts.length; i++) {
    result += pool[bytes[i] % pool.length];
  }
  return result;
}

function estimateEntropyBits(length, poolSize) {
  return Math.round(length * Math.log2(poolSize));
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

  const allowed = await checkRateLimit(env, clientIP, 'password', request.headers.get('X-Presend-Test') === '1');
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 60 requests per minute.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const { searchParams } = new URL(request.url);
  let length = parseInt(searchParams.get('length') || '16', 10);
  if (isNaN(length) || length < 4) length = 4;
  if (length > 128) length = 128;

  const opts = {
    length,
    uppercase: searchParams.get('uppercase') !== '0',
    numbers: searchParams.get('numbers') !== '0',
    symbols: searchParams.get('symbols') === '1',
    excludeAmbiguous: searchParams.get('exclude_ambiguous') === '1',
  };

  try {
    const password = generatePassword(opts);
    let poolSize = CHARS.lowercase.length;
    if (opts.uppercase) poolSize += CHARS.uppercase.length;
    if (opts.numbers) poolSize += CHARS.numbers.length;
    if (opts.symbols) poolSize += CHARS.symbols.length;

    return new Response(JSON.stringify({
      password,
      length: opts.length,
      entropy_bits: estimateEntropyBits(opts.length, poolSize),
    }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders() },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
}
