// GET /api/email-disposable?email=foo@mailinator.com
// Detects disposable/throwaway email providers from a curated list of 576 known domains.
// Same list used by the client-side tool (tools/disposable-email-checker.html).
import { DISPOSABLE_DOMAINS } from '../_shared/disposable-domains.js';

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


const EMAIL_SHAPE_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

  const allowed = await checkRateLimit(env, clientIP, 'emaildisposable', request.headers.get('X-Presend-Test') === '1');
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
