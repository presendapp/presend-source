// GET /api/whois-lookup?domain=example.com
//
// Domain registration lookup via RDAP (Registration Data Access
// Protocol) -- the modern, HTTPS-based, structured-JSON successor to
// legacy WHOIS (which uses a raw TCP port-43 protocol Cloudflare
// Workers cannot reach). Uses rdap.org, a public aggregator that
// handles the per-TLD bootstrap discovery automatically.
//
// Registration age is a real, commonly-used signal: a domain
// registered days or hours ago is far more likely to be a phishing
// or scam site than an established one -- complements url-reputation
// and dns-lookup for the same "verify before you trust it" purpose.

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

function findEvent(events, action) {
  const e = (events || []).find((ev) => ev.eventAction === action);
  return e ? e.eventDate : null;
}

function extractRegistrar(entities) {
  const registrar = (entities || []).find((e) => (e.roles || []).includes('registrar'));
  if (!registrar) return null;
  const vcard = registrar.vcardArray && registrar.vcardArray[1];
  if (!vcard) return null;
  const fn = vcard.find((field) => field[0] === 'fn');
  return fn ? fn[3] : null;
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

  const allowed = await checkRateLimit(env, clientIP, 'whois-lookup');
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 10 requests per minute.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const { searchParams } = new URL(request.url);
  const domain = (searchParams.get('domain') || '').trim().toLowerCase();

  if (!domain) {
    return new Response(JSON.stringify({
      usage: 'GET /api/whois-lookup?domain=example.com',
      note: 'Domain registration lookup via RDAP, the modern HTTPS-based successor to WHOIS.',
    }, null, 2), { headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }
  if (!DOMAIN_RE.test(domain)) {
    return new Response(JSON.stringify({ error: 'Invalid domain format' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
      signal: controller.signal,
      headers: {
        Accept: 'application/rdap+json',
        'User-Agent': 'Mozilla/5.0 (compatible; PresendBot/1.0; +https://presend.pages.dev)',
      },
    });
    clearTimeout(timeout);

    if (res.status === 404) {
      return new Response(JSON.stringify({
        domain, registered: false,
        note: 'No RDAP record found -- likely unregistered, or this TLD does not yet publish RDAP data.',
      }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...corsHeaders() } });
    }
    if (!res.ok) throw new Error(`RDAP lookup failed (HTTP ${res.status})`);

    const data = await res.json();
    const created = findEvent(data.events, 'registration');
    const ageDays = created ? Math.floor((Date.now() - new Date(created).getTime()) / 86400000) : null;

    return new Response(JSON.stringify({
      domain,
      registered: true,
      registrar: extractRegistrar(data.entities),
      created,
      expires: findEvent(data.events, 'expiration'),
      last_changed: findEvent(data.events, 'last changed'),
      age_days: ageDays,
      nameservers: (data.nameservers || []).map((n) => (n.ldhName || '').toLowerCase()),
      status: data.status || [],
      source: 'RDAP (rdap.org) -- the ICANN-mandated successor to legacy WHOIS.',
    }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...corsHeaders() } });
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') {
      return new Response(JSON.stringify({ error: 'RDAP request timed out. Try again shortly.' }), {
        status: 504, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
    return new Response(JSON.stringify({ error: 'Could not complete RDAP lookup.', detail: e.message }), {
      status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
}
