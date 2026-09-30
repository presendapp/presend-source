// GET /api/iban-validate?iban=DE89370400440532013000
// Validates an IBAN via the ISO 7064 mod-97 checksum. No external data source --
// pure algorithm, so nothing here can ever be "redundant" with an upstream API.

async function checkRateLimit(env, clientIP, bucket, isTest = false) {
  if (!env.PRESEND_ANALYTICS) return true;
  try {
    const now = Math.floor(Date.now() / 60000);
    const rateKey = `rate:${bucket}:${clientIP}:${now}`;
    let count = await env.PRESEND_ANALYTICS.get(rateKey);
    count = count ? parseInt(count) : 0;
    if (count >= 60) return false;
    if (Math.random() < 1 / 5) {
      await env.PRESEND_ANALYTICS.put(rateKey, (count + 5).toString(), { expirationTtl: 120 });
    }
  } catch (e) {
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
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', ...extra };
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

const IBAN_LENGTHS = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22,
  BR: 29, BY: 28, CH: 21, CR: 22, CY: 28, CZ: 24, DE: 22, DK: 18, DO: 28,
  EE: 20, EG: 29, ES: 24, FI: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23,
  GL: 18, GR: 27, GT: 28, HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26,
  IT: 27, JO: 30, KW: 30, KZ: 20, LB: 28, LC: 32, LI: 21, LT: 20, LU: 20,
  LV: 21, LY: 25, MC: 27, MD: 24, ME: 22, MK: 19, MR: 27, MT: 31, MU: 30,
  NL: 18, NO: 15, PK: 24, PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22,
  SA: 24, SC: 31, SE: 24, SI: 19, SK: 24, SM: 27, ST: 25, SV: 28, TL: 23,
  TN: 24, TR: 26, UA: 29, VA: 22, VG: 24, XK: 20,
};

function formatIban(iban) {
  return iban.match(/.{1,4}/g).join(' ');
}

function mod97Check(iban) {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (ch) => (ch.charCodeAt(0) - 55).toString());

  let remainder = numeric;
  while (remainder.length > 2) {
    const block = remainder.slice(0, 9);
    remainder = (parseInt(block, 10) % 97).toString() + remainder.slice(block.length);
  }
  return parseInt(remainder, 10) % 97 === 1;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

  const allowed = await checkRateLimit(env, clientIP, 'iban-validate', request.headers.get('X-Presend-Test') === '1');
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 60 requests per minute.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const { searchParams } = new URL(request.url);
  const raw = (searchParams.get('iban') || '').trim();

  if (!raw) {
    return new Response(JSON.stringify({
      usage: 'GET /api/iban-validate?iban=DE89370400440532013000',
      note: 'Validates an IBAN via the ISO 7064 mod-97 checksum. Spaces are ignored.',
    }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  const iban = raw.replace(/\s+/g, '').toUpperCase();

  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) {
    return new Response(JSON.stringify({
      iban: raw, valid: false, reason: 'Does not match the basic IBAN pattern (2 letters, 2 check digits, alphanumeric BBAN).',
    }), { headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  const countryCode = iban.slice(0, 2);
  const expectedLength = IBAN_LENGTHS[countryCode];

  if (expectedLength && iban.length !== expectedLength) {
    return new Response(JSON.stringify({
      iban: raw, valid: false, country_code: countryCode,
      reason: `Wrong length for ${countryCode}: expected ${expectedLength} characters, got ${iban.length}.`,
    }), { headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  let checksumValid;
  try {
    checksumValid = mod97Check(iban);
  } catch (e) {
    return new Response(JSON.stringify({ iban: raw, valid: false, reason: 'Could not compute checksum -- malformed input.' }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  return new Response(JSON.stringify({
    iban: raw,
    valid: checksumValid,
    country_code: countryCode,
    formatted: checksumValid ? formatIban(iban) : undefined,
    reason: checksumValid ? undefined : 'Failed the ISO 7064 mod-97 checksum.',
    note: expectedLength ? undefined : `Country code "${countryCode}" not in the known-length table -- checksum-only validation.`,
  }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders() } });
}
