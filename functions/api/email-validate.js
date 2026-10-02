import { checkRateLimit } from '../_shared/rate-limit.js';

// GET /api/email-validate?email=foo@example.com
// Vérifie la syntaxe ET la présence d'un enregistrement MX (via Cloudflare DNS-over-HTTPS).

function corsHeaders(extra = {}) {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', ...extra };
}

const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

async function hasMxRecord(domain) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`,
      { headers: { Accept: 'application/dns-json' }, signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!res.ok) return { checked: false, has_mx: null };
    const data = await res.json();
    const mxRecords = (data.Answer || []).filter((r) => r.type === 15);
    return { checked: true, has_mx: mxRecords.length > 0, mx_count: mxRecords.length };
  } catch (e) {
    clearTimeout(timeout);
    return { checked: false, has_mx: null };
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

  const allowed = await checkRateLimit(env, clientIP, 'emailvalidate', { limit: 30, isTest: request.headers.get('X-Presend-Test') === '1', trackVisits: true });
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 30 requests per minute.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const { searchParams } = new URL(request.url);
  const email = (searchParams.get('email') || '').trim();

  if (!email) {
    return new Response(JSON.stringify({
      usage: 'GET /api/email-validate?email=foo@example.com',
    }, null, 2), { headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }
  if (email.length > 254) {
    return new Response(JSON.stringify({ error: 'Email too long' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const syntaxValid = EMAIL_RE.test(email);
  if (!syntaxValid) {
    return new Response(JSON.stringify({
      email, syntax_valid: false, mx_checked: false, has_mx: null, valid: false,
    }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders() } });
  }

  const domain = email.split('@')[1];
  const mx = await hasMxRecord(domain);

  return new Response(JSON.stringify({
    email,
    syntax_valid: true,
    domain,
    mx_checked: mx.checked,
    has_mx: mx.has_mx,
    mx_count: mx.mx_count || 0,
    valid: mx.has_mx === true,
  }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...corsHeaders() },
  });
}
