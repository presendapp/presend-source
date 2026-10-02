import { checkRateLimit } from '../_shared/rate-limit.js';

// GET /api/uuid?count=5  -> jusqu'à 100 UUIDs v4 par requête

function corsHeaders(extra = {}) {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', ...extra };
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

  const allowed = await checkRateLimit(env, clientIP, 'uuid', { limit: 60, isTest: request.headers.get('X-Presend-Test') === '1', trackVisits: true });
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 60 requests per minute.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const { searchParams } = new URL(request.url);
  let count = parseInt(searchParams.get('count') || '1', 10);
  if (isNaN(count) || count < 1) count = 1;
  if (count > 100) count = 100;

  const uuids = Array.from({ length: count }, () => crypto.randomUUID());

  return new Response(JSON.stringify({ count: uuids.length, uuids }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders() },
  });
}
