// GET /api/vat-validate?country=FR&vat=40449989573
//
// Validates an EU VAT number via the European Commission's official VIES
// (VAT Information Exchange System) REST API. The target is our own fixed
// endpoint (not user-supplied), so no SSRF hardening is needed here --
// unlike link-metadata or redirect-trace, which fetch arbitrary user URLs.

async function checkRateLimit(env, clientIP, bucket, isTest = false) {
  if (!env.PRESEND_ANALYTICS) return true;
  try {
    const now = Math.floor(Date.now() / 60000);
    const rateKey = `rate:${bucket}:${clientIP}:${now}`;
    let count = await env.PRESEND_ANALYTICS.get(rateKey);
    count = count ? parseInt(count) : 0;
    if (count >= 30) return false;
    if (Math.random() < 1 / 5) {
      await env.PRESEND_ANALYTICS.put(rateKey, (count + 5).toString(), { expirationTtl: 120 });
    }
  } catch (e) {
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

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

const EU_COUNTRY_CODES = new Set([
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES', 'FI', 'FR',
  'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO',
  'SE', 'SI', 'SK', 'XI',
]);

const VIES_URL = 'https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number';

export async function onRequestGet(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

  const allowed = await checkRateLimit(env, clientIP, 'vat-validate', request.headers.get('X-Presend-Test') === '1');
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 30 requests per minute.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const { searchParams } = new URL(request.url);
  let country = (searchParams.get('country') || '').trim().toUpperCase();
  let vat = (searchParams.get('vat') || '').trim().replace(/\s+/g, '');

  // Autorise aussi le format combine "FR40449989573" dans le seul parametre vat.
  if (!country && vat.length > 2 && /^[A-Z]{2}/.test(vat)) {
    country = vat.slice(0, 2);
    vat = vat.slice(2);
  }

  if (!country || !vat) {
    return new Response(JSON.stringify({
      usage: 'GET /api/vat-validate?country=FR&vat=40449989573',
      note: 'Validates an EU VAT number via the official VIES service. country is the 2-letter EU country code (EL for Greece, XI for Northern Ireland).',
    }, null, 2), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  if (!EU_COUNTRY_CODES.has(country)) {
    return new Response(JSON.stringify({
      country_code: country, vat_number: vat, valid: false,
      reason: `"${country}" is not a VIES-supported country code. The UK (GB) left VIES after Brexit; Northern Ireland uses "XI".`,
    }), { headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  let viesData;
  try {
    const res = await fetch(VIES_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ countryCode: country, vatNumber: vat }),
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `VIES returned HTTP ${res.status} -- the service may be temporarily unavailable.` }), {
        status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
    viesData = await res.json();
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') {
      return new Response(JSON.stringify({ error: 'VIES request timed out. The official service is occasionally slow or unavailable -- try again shortly.' }), {
        status: 504, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
    return new Response(JSON.stringify({ error: 'Could not reach VIES.', detail: e.message }), {
      status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  if (viesData.userError && viesData.userError !== 'VALID') {
    return new Response(JSON.stringify({
      country_code: country, vat_number: vat, valid: false,
      vies_error: viesData.userError,
      note: 'VIES reported an error for this lookup rather than a simple invalid/valid result -- see vies_error.',
    }), { headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  return new Response(JSON.stringify({
    country_code: viesData.countryCode || country,
    vat_number: viesData.vatNumber || vat,
    valid: !!viesData.valid,
    name: viesData.name && viesData.name !== '---' ? viesData.name : null,
    address: viesData.address && viesData.address !== '---' ? viesData.address : null,
    request_date: viesData.requestDate || null,
    source: 'European Commission VIES (VAT Information Exchange System), official.',
  }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders() } });
}
