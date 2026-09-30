// GET /api/ip — geolocation, currency, language, EU flag, and Tor exit-node
// detection for the caller's own IP.
//
// Geolocation comes entirely from Cloudflare's request.cf object — free on
// every plan, no external API call, no third-party rate limit or cost risk.
// (This replaced a previous version that called ipinfo.io on every request,
// an unprotected external dependency with its own quota.)

const TOR_LIST_CACHE_KEY = 'tor-exit-list-cache';
const TOR_LIST_TTL_SECONDS = 3600; // refresh hourly

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

// Fetches the Tor Project's official public bulk exit-node list, cached in
// KV to avoid re-downloading it on every single request. This is a real,
// free, official data source — not a heuristic guess.
async function isTorExitNode(ip, env) {
  if (!ip || ip === 'unknown') return { checked: false, is_tor: null };

  let listText = null;
  try {
    if (env.PRESEND_ANALYTICS) {
      listText = await env.PRESEND_ANALYTICS.get(TOR_LIST_CACHE_KEY);
    }
  } catch (e) { /* cache miss, fall through to fetch */ }

  if (!listText) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const res = await fetch('https://check.torproject.org/torbulkexitlist', { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) return { checked: false, is_tor: null };
      listText = await res.text();
      if (env.PRESEND_ANALYTICS) {
        await env.PRESEND_ANALYTICS.put(TOR_LIST_CACHE_KEY, listText, { expirationTtl: TOR_LIST_TTL_SECONDS });
      }
    } catch (e) {
      return { checked: false, is_tor: null };
    }
  }

  const exitIPs = new Set(listText.split('\n').map((l) => l.trim()).filter(Boolean));
  return { checked: true, is_tor: exitIPs.has(ip) };
}

function getCurrency(code) {
  const currencies = {
    US: 'USD', GB: 'GBP', FR: 'EUR', DE: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR',
    BE: 'EUR', AT: 'EUR', PT: 'EUR', IE: 'EUR', FI: 'EUR', SE: 'SEK', NO: 'NOK',
    DK: 'DKK', CH: 'CHF', PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON', BG: 'BGN',
    HR: 'EUR', SI: 'EUR', SK: 'EUR', LT: 'EUR', LV: 'EUR', EE: 'EUR',
    CA: 'CAD', AU: 'AUD', NZ: 'NZD', JP: 'JPY', CN: 'CNY', IN: 'INR',
    BR: 'BRL', MX: 'MXN', AR: 'ARS', CL: 'CLP', CO: 'COP', PE: 'PEN', VE: 'VES',
    RU: 'RUB', TR: 'TRY', ZA: 'ZAR', EG: 'EGP', NG: 'NGN', KE: 'KES',
    SG: 'SGD', HK: 'HKD', TW: 'TWD', KR: 'KRW', TH: 'THB', MY: 'MYR',
    ID: 'IDR', PH: 'PHP', VN: 'VND', AE: 'AED', SA: 'SAR',
  };
  return currencies[code] || null;
}

function getLanguage(code) {
  const languages = {
    US: 'en', GB: 'en', FR: 'fr', DE: 'de', ES: 'es', IT: 'it', PT: 'pt',
    NL: 'nl', BE: 'nl', AT: 'de', CH: 'de', SE: 'sv', NO: 'no', DK: 'da',
    FI: 'fi', PL: 'pl', IE: 'en', CA: 'en', AU: 'en', NZ: 'en',
    JP: 'ja', CN: 'zh', IN: 'hi', RU: 'ru', BR: 'pt', MX: 'es',
    AR: 'es', CL: 'es', CO: 'es', PE: 'es', VE: 'es',
    TR: 'tr', ZA: 'en', EG: 'ar', NG: 'en', KE: 'en',
    SG: 'en', HK: 'zh', TW: 'zh', KR: 'ko', TH: 'th', MY: 'ms',
    ID: 'id', PH: 'en', VN: 'vi', AE: 'ar', SA: 'ar',
  };
  return languages[code] || null;
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for') || 'unknown';

  const allowed = await checkRateLimit(env, clientIP, 'ip', request.headers.get('X-Presend-Test') === '1');
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 60 requests per minute.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const cf = request.cf || {};
  const country = cf.country || null;
  const torResult = await isTorExitNode(clientIP, env);

  const result = {
    ip: clientIP,
    city: cf.city || null,
    region: cf.region || null,
    country,
    continent: cf.continent || null,
    latitude: cf.latitude || null,
    longitude: cf.longitude || null,
    postal: cf.postalCode || null,
    timezone: cf.timezone || null,
    asn: cf.asn || null,
    org: cf.asOrganization || null,
    currency: country ? getCurrency(country) : null,
    language: country ? getLanguage(country) : null,
    is_eu: typeof cf.isEUCountry !== 'undefined' ? cf.isEUCountry === '1' || cf.isEUCountry === true : null,
    tor: torResult,
  };

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders() },
  });
}
