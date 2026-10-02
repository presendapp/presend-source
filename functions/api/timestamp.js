import { checkRateLimit } from '../_shared/rate-limit.js';

// GET /api/timestamp                      -> heure actuelle
// GET /api/timestamp?unix=1700000000      -> convertit unix vers ISO/humain
// GET /api/timestamp?date=2024-01-01      -> convertit une date vers unix

function corsHeaders(extra = {}) {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', ...extra };
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

  const allowed = await checkRateLimit(env, clientIP, 'timestamp', { limit: 60 });
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 60 requests per minute.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const { searchParams } = new URL(request.url);
  const unixParam = searchParams.get('unix');
  const dateParam = searchParams.get('date');

  try {
    let date;
    if (unixParam !== null) {
      const n = Number(unixParam);
      if (isNaN(n)) throw new Error('Invalid unix timestamp');
      // Accepte secondes ou millisecondes
      date = new Date(n > 1e12 ? n : n * 1000);
    } else if (dateParam !== null) {
      date = new Date(dateParam);
      if (isNaN(date.getTime())) throw new Error('Invalid date string');
    } else {
      date = new Date();
    }

    return new Response(JSON.stringify({
      unix_seconds: Math.floor(date.getTime() / 1000),
      unix_milliseconds: date.getTime(),
      iso_8601: date.toISOString(),
      utc_string: date.toUTCString(),
      day_of_week: date.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
    }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders() },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
}
