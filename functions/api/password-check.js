import { checkRateLimit } from '../_shared/rate-limit.js';

// POST /api/password-check
// Body: {"password": "...", "check_breach": true}
// Combines strength/entropy scoring (same formula as tools/password-strength.html)
// with an optional HaveIBeenPwned breach check (k-anonymity, same approach as
// /api/password-breach) — in one call instead of two.
//
// Uses POST with a JSON body rather than a query string, unlike the existing
// GET /api/password-breach — passwords should never travel in a URL, since
// query strings are commonly logged by proxies, CDNs, and browser history.

function corsHeaders(extra = {}) {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', ...extra };
}

// --- Strength analysis: identical formula to tools/password-strength.html ---
function analyzeStrength(pwd) {
  const len = pwd.length;
  let pool = 0;
  if (/[a-z]/.test(pwd)) pool += 26;
  if (/[A-Z]/.test(pwd)) pool += 26;
  if (/[0-9]/.test(pwd)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(pwd)) pool += 32;
  if (pool === 0) pool = 1;

  const entropy = len * Math.log2(pool);
  const combinations = Math.pow(pool, len);
  const guessesPerSec = 1e12;
  const seconds = combinations / guessesPerSec;

  let crackTime;
  if (seconds < 1) crackTime = 'instant';
  else if (seconds < 60) crackTime = Math.round(seconds) + ' seconds';
  else if (seconds < 3600) crackTime = Math.round(seconds / 60) + ' minutes';
  else if (seconds < 86400) crackTime = Math.round(seconds / 3600) + ' hours';
  else if (seconds < 31536000) crackTime = Math.round(seconds / 86400) + ' days';
  else if (seconds < 3153600000) crackTime = Math.round(seconds / 31536000) + ' years';
  else if (seconds < 315360000000) crackTime = Math.round(seconds / 3153600000) + ' centuries';
  else crackTime = 'millennia';

  let strength;
  if (entropy < 28) strength = 'very_weak';
  else if (entropy < 36) strength = 'weak';
  else if (entropy < 60) strength = 'fair';
  else if (entropy < 80) strength = 'good';
  else strength = 'strong';

  const checks = {
    length_ok: len >= 12,
    has_lowercase: /[a-z]/.test(pwd),
    has_uppercase: /[A-Z]/.test(pwd),
    has_number: /[0-9]/.test(pwd),
    has_symbol: /[^a-zA-Z0-9]/.test(pwd),
    no_repeated_pattern: !/(.{2,})\1+/.test(pwd),
  };

  return {
    length: len,
    entropy_bits: Math.round(entropy),
    strength,
    estimated_crack_time: crackTime,
    checks,
  };
}

async function sha1Hex(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-1', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

async function checkBreach(password) {
  const hash = await sha1Hex(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HIBP API error: HTTP ${res.status}`);
    const text = await res.text();

    let breachCount = 0;
    for (const line of text.split('\n')) {
      const [lineSuffix, countStr] = line.trim().split(':');
      if (lineSuffix === suffix) {
        breachCount = parseInt(countStr, 10);
        break;
      }
    }
    return { checked: true, breached: breachCount > 0, breach_count: breachCount };
  } catch (e) {
    clearTimeout(timeout);
    return { checked: false, breached: null, breach_count: null, error: e.message };
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestGet() {
  return new Response(JSON.stringify({
    usage: 'POST /api/password-check with JSON body {"password": "...", "check_breach": true}',
    note: 'Password is sent in the POST body, never in a URL. Breach check uses k-anonymity (only 5 hash chars leave the edge) — same approach as /api/password-breach.',
  }, null, 2), { headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

  const allowed = await checkRateLimit(env, clientIP, 'passwordcheck', { limit: 20 });
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 20 requests per minute.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Expected a JSON body: {"password": "..."}' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const password = body.password;
  const checkBreachFlag = body.check_breach !== false; // default true

  if (!password || typeof password !== 'string') {
    return new Response(JSON.stringify({ error: 'Missing or invalid "password" field.' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
  if (password.length > 256) {
    return new Response(JSON.stringify({ error: 'Password too long (max 256 chars).' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const strengthResult = analyzeStrength(password);
  let breachResult = null;
  if (checkBreachFlag) {
    breachResult = await checkBreach(password);
  }

  return new Response(JSON.stringify({
    ...strengthResult,
    breach: breachResult,
  }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders() },
  });
}
