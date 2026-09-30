// GET /api/user-agent            -> parse le User-Agent de l'appelant
// GET /api/user-agent?ua=<string> -> parse une chaîne UA arbitraire

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

  const allowed = await checkRateLimit(env, clientIP, 'ua', request.headers.get('X-Presend-Test') === '1');
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
