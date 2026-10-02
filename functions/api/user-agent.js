import { checkRateLimit } from '../_shared/rate-limit.js';

// GET /api/user-agent            -> parse le User-Agent de l'appelant
// GET /api/user-agent?ua=<string> -> parse une chaîne UA arbitraire

function corsHeaders(extra = {}) {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', ...extra };
}

function parseUserAgent(ua) {
  const result = { browser: 'Unknown', browser_version: null, os: 'Unknown', os_version: null, device_type: 'desktop', is_bot: false };

  if (/bot|crawler|spider|crawling/i.test(ua)) result.is_bot = true;

  // OS
  let m;
  if ((m = ua.match(/Windows NT ([\d.]+)/))) { result.os = 'Windows'; result.os_version = m[1]; }
  else if ((m = ua.match(/Mac OS X ([\d_]+)/))) { result.os = 'macOS'; result.os_version = m[1].replace(/_/g, '.'); }
  else if (/Android/.test(ua)) { result.os = 'Android'; m = ua.match(/Android ([\d.]+)/); result.os_version = m ? m[1] : null; }
  else if (/iPhone|iPad|iPod/.test(ua)) { result.os = 'iOS'; m = ua.match(/OS ([\d_]+)/); result.os_version = m ? m[1].replace(/_/g, '.') : null; }
  else if (/Linux/.test(ua)) { result.os = 'Linux'; }

  // Device type
  if (/Mobi|Android.*Mobile/.test(ua)) result.device_type = 'mobile';
  else if (/iPad|Tablet/.test(ua)) result.device_type = 'tablet';

  // Browser (ordre important : Edge/Chrome avant Safari, Chrome avant Safari)
  if ((m = ua.match(/Edg\/([\d.]+)/))) { result.browser = 'Edge'; result.browser_version = m[1]; }
  else if ((m = ua.match(/OPR\/([\d.]+)/))) { result.browser = 'Opera'; result.browser_version = m[1]; }
  else if ((m = ua.match(/Firefox\/([\d.]+)/))) { result.browser = 'Firefox'; result.browser_version = m[1]; }
  else if ((m = ua.match(/Chrome\/([\d.]+)/)) && !/Chromium/.test(ua)) { result.browser = 'Chrome'; result.browser_version = m[1]; }
  else if ((m = ua.match(/Version\/([\d.]+).*Safari/))) { result.browser = 'Safari'; result.browser_version = m[1]; }

  return result;
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

  const allowed = await checkRateLimit(env, clientIP, 'ua', { limit: 60 });
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 60 requests per minute.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const { searchParams } = new URL(request.url);
  const ua = searchParams.get('ua') || request.headers.get('User-Agent') || '';

  if (!ua) {
    return new Response(JSON.stringify({ error: 'No User-Agent provided or detected' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  return new Response(JSON.stringify({
    user_agent: ua,
    parsed: parseUserAgent(ua),
  }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders() },
  });
}
