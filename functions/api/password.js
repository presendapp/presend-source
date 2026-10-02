import { checkRateLimit } from '../_shared/rate-limit.js';

// GET /api/password?length=16&symbols=1&numbers=1&uppercase=1&exclude_ambiguous=1

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

  const allowed = await checkRateLimit(env, clientIP, 'password', { limit: 60 });
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
