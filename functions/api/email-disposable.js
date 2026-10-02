// GET /api/email-disposable?email=foo@mailinator.com
// Detects disposable/throwaway email providers from a curated list of 576 known domains.
// Same list used by the client-side tool (tools/disposable-email-checker.html).
import { DISPOSABLE_DOMAINS } from '../_shared/disposable-domains.js';
import { checkRateLimit } from '../_shared/rate-limit.js';

function corsHeaders(extra = {}) {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', ...extra };
}


const EMAIL_SHAPE_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

  const allowed = await checkRateLimit(env, clientIP, 'emaildisposable', { limit: 60, isTest: request.headers.get('X-Presend-Test') === '1', trackVisits: true });
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 60 requests per minute.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const { searchParams } = new URL(request.url);
  const email = (searchParams.get('email') || '').trim();

  if (!email) {
    return new Response(JSON.stringify({
      usage: 'GET /api/email-disposable?email=foo@example.com',
      known_domains_count: DISPOSABLE_DOMAINS.size,
    }, null, 2), { headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }
  if (!EMAIL_SHAPE_RE.test(email)) {
    return new Response(JSON.stringify({ error: 'Invalid email shape' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const domain = email.split('@')[1].toLowerCase();
  const isDisposable = DISPOSABLE_DOMAINS.has(domain);

  return new Response(JSON.stringify({
    email,
    domain,
    disposable: isDisposable,
  }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...corsHeaders() },
  });
}
