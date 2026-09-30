// GET /api/email-verify?email=foo@example.com
// Combines syntax check, MX lookup, disposable-domain detection, and
// generic/role-account detection in a single call — most free email
// APIs only offer these as separate paid checks.

import { DISPOSABLE_DOMAINS } from '../_shared/disposable-domains.js';

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
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', ...extra };
}

const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

// Common generic/role-account local parts. Not exhaustive, but covers the
// vast majority of non-personal inboxes seen in signup forms.
const ROLE_LOCAL_PARTS = new Set([
  'admin', 'administrator', 'support', 'info', 'contact', 'hello', 'sales',
  'billing', 'help', 'noreply', 'no-reply', 'webmaster', 'postmaster',
  'office', 'team', 'careers', 'jobs', 'hr', 'press', 'media', 'marketing',
  'security', 'privacy', 'legal', 'abuse', 'root', 'mail', 'newsletter',
]);

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

  const allowed = await checkRateLimit(env, clientIP, 'emailverify', request.headers.get('X-Presend-Test') === '1');
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 30 requests per minute.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const { searchParams } = new URL(request.url);
  const email = (searchParams.get('email') || '').trim();

  if (!email) {
    return new Response(JSON.stringify({
      usage: 'GET /api/email-verify?email=foo@example.com',
      checks: ['syntax', 'mx_record', 'disposable', 'role_account'],
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
      email, syntax_valid: false, mx_checked: false, has_mx: null,
      disposable: null, role_account: null, valid: false,
      reason: 'invalid_syntax',
    }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders() } });
  }

  const [localPart, domain] = email.split('@');
  const domainLower = domain.toLowerCase();
  const isDisposable = DISPOSABLE_DOMAINS.has(domainLower);
  const isRoleAccount = ROLE_LOCAL_PARTS.has(localPart.toLowerCase());

  const mx = await hasMxRecord(domain);

  // Never conclude "invalid" from a failed DNS lookup (lesson 20): valid is null, not false.
  let valid;
  let reason = null;
  if (mx.has_mx === false) { valid = false; reason = "no_mx_record"; }
  else if (isDisposable) { valid = false; reason = "disposable_domain"; }
  else if (mx.has_mx === true) { valid = true; }
  else { valid = null; reason = "mx_lookup_failed"; }

  return new Response(JSON.stringify({
    email,
    syntax_valid: true,
    domain,
    mx_checked: mx.checked,
    has_mx: mx.has_mx,
    mx_count: mx.mx_count || 0,
    disposable: isDisposable,
    role_account: isRoleAccount,
    valid,
    reason,
  }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': mx.checked ? 'public, max-age=3600' : 'no-store', ...corsHeaders() },
  });
}
