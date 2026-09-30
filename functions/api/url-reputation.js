// GET /api/url-reputation?url=https://suspicious-site.com
// Vérifie une URL contre URLhaus (abuse.ch), base publique de malware/phishing.

async function checkRateLimit(env, clientIP, bucket) {
  if (!env.PRESEND_ANALYTICS) return true;
  try {
    const now = Math.floor(Date.now() / 60000);
    const rateKey = `rate:${bucket}:${clientIP}:${now}`;
    let count = await env.PRESEND_ANALYTICS.get(rateKey);
    count = count ? parseInt(count) : 0;
    if (count >= 20) return false;
    // Écriture échantillonnée (1 sur 5) pour économiser le quota KV --
    // légèrement moins précis en rafale, mais protège toujours contre un abus soutenu.
    if (Math.random() < 1 / 5) {
      await env.PRESEND_ANALYTICS.put(rateKey, (count + 5).toString(), { expirationTtl: 120 });
    }
  } catch (e) {
    // KV en panne ou quota dépassé -- ne doit jamais faire planter la requête.
    return true;
  }
  return true;
}

function corsHeaders(extra = {}) {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', ...extra };
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

  const allowed = await checkRateLimit(env, clientIP, 'urlreputation');
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 20 requests per minute.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return new Response(JSON.stringify({
      usage: 'GET /api/url-reputation?url=https://example.com',
      source: 'URLhaus (abuse.ch) — public malware/phishing URL database',
    }, null, 2), { headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  try {
    new URL(targetUrl);
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid URL' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    if (!env.URLHAUS_AUTH_KEY) {
      clearTimeout(timeout);
      return new Response(JSON.stringify({ error: 'Service temporarily misconfigured. Try again later.' }), {
        status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    const res = await fetch('https://urlhaus-api.abuse.ch/v1/url/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Auth-Key': env.URLHAUS_AUTH_KEY,
      },
      body: 'url=' + encodeURIComponent(targetUrl),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`URLhaus API error: HTTP ${res.status}`);
    const data = await res.json();

    if (data.query_status === 'no_results') {
      return new Response(JSON.stringify({
        url: targetUrl,
        malicious: false,
        status: 'not_found',
        note: 'Not found in URLhaus. This does not guarantee the URL is safe — only that it is not currently listed.',
      }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=1800', ...corsHeaders() } });
    }

    if (data.query_status === 'ok') {
      return new Response(JSON.stringify({
        url: targetUrl,
        malicious: true,
        status: data.url_status,
        threat: data.threat,
        tags: data.tags || [],
        date_added: data.date_added,
      }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=1800', ...corsHeaders() } });
    }

    return new Response(JSON.stringify({ url: targetUrl, malicious: null, status: data.query_status }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  } catch (e) {
    clearTimeout(timeout);
    return new Response(JSON.stringify({ error: 'Could not check URL reputation right now.', detail: e.message }), {
      status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
}
