// GET /api/dns-lookup?domain=example.com[&type=MX]
//
// Looks up common DNS record types for a domain via Cloudflare's
// DNS-over-HTTPS resolver (same proven pattern used in email-security.js).
// With no &type, returns A, AAAA, CNAME, MX, TXT and NS all at once --
// one call instead of six, same chaining philosophy as merge-and-compress-pdf
// and security-scan.

async function checkRateLimit(env, clientIP, bucket) {
  if (!env.PRESEND_ANALYTICS) return true;
  try {
    const now = Math.floor(Date.now() / 60000);
    const rateKey = `rate:${bucket}:${clientIP}:${now}`;
    let count = await env.PRESEND_ANALYTICS.get(rateKey);
    count = count ? parseInt(count) : 0;
    if (count >= 10) return false;
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

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;

const RECORD_TYPES = {
  A: 1, AAAA: 28, CNAME: 5, MX: 15, TXT: 16, NS: 2,
};

function stripTrailingDot(s) {
  return s.endsWith('.') ? s.slice(0, -1) : s;
}

function parseAnswer(type, answers) {
  const code = RECORD_TYPES[type];
  const matching = (answers || []).filter((a) => a.type === code);

  if (type === 'TXT') {
    return matching.map((a) => a.data.replace(/^"|"$/g, '').replace(/"\s*"/g, ''));
  }
  if (type === 'MX') {
    return matching.map((a) => {
      const [priority, ...rest] = a.data.split(' ');
      return { priority: parseInt(priority, 10), exchange: stripTrailingDot(rest.join(' ')) };
    }).sort((a, b) => a.priority - b.priority);
  }
  // A, AAAA, CNAME, NS -- valeur brute, juste nettoyée du point final
  return matching.map((a) => stripTrailingDot(a.data));
}

async function queryType(domain, type) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=${type}`,
      { headers: { Accept: 'application/dns-json' }, signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!res.ok) return { records: [], error: `DNS query failed (HTTP ${res.status})` };
    const data = await res.json();
    return { records: parseAnswer(type, data.Answer), status: data.Status };
  } catch (e) {
    clearTimeout(timeout);
    return { records: [], error: e.name === 'AbortError' ? 'DNS query timed out' : e.message };
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

  const allowed = await checkRateLimit(env, clientIP, 'dns-lookup');
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 10 requests per minute.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const { searchParams } = new URL(request.url);
  const domain = (searchParams.get('domain') || '').trim().toLowerCase();
  const requestedType = (searchParams.get('type') || '').trim().toUpperCase();

  if (!domain) {
    return new Response(JSON.stringify({
      usage: 'GET /api/dns-lookup?domain=example.com or &type=MX for a single type',
      supported_types: Object.keys(RECORD_TYPES),
      note: 'With no &type, returns A, AAAA, CNAME, MX, TXT and NS in one call.',
    }, null, 2), { headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }
  if (!DOMAIN_RE.test(domain)) {
    return new Response(JSON.stringify({ error: 'Invalid domain format' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
  if (requestedType && !RECORD_TYPES[requestedType]) {
    return new Response(JSON.stringify({
      error: `Unsupported record type "${requestedType}"`,
      supported_types: Object.keys(RECORD_TYPES),
    }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  const typesToQuery = requestedType ? [requestedType] : Object.keys(RECORD_TYPES);
  const results = await Promise.all(typesToQuery.map((t) => queryType(domain, t)));

  const records = {};
  let anyError = null;
  typesToQuery.forEach((t, i) => {
    records[t] = results[i].records;
    if (results[i].error) anyError = anyError || results[i].error;
  });

  return new Response(JSON.stringify({
    domain,
    records,
    ...(anyError ? { partial_error: anyError } : {}),
    source: 'Cloudflare DNS-over-HTTPS resolver — public DNS, no data from your own network is queried.',
  }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300', ...corsHeaders() },
  });
}
