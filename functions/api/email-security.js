// GET /api/email-security?domain=example.com
//
// Checks a domain's anti-spoofing email configuration: SPF, DMARC, and a
// best-effort DKIM lookup (DKIM has no fixed DNS location -- the selector
// depends on the sending provider, so this only tests a handful of the
// most common selectors and cannot claim a definitive "not configured"
// result if none match).

async function checkRateLimit(env, clientIP, bucket, isTest = false) {
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

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i;

// Most common DKIM selectors across major email providers. This is a
// best-effort list, not exhaustive -- absence here does NOT mean DKIM
// is unconfigured, only that it isn't using one of these common selectors.
const COMMON_DKIM_SELECTORS = [
  'default', 'google', 'selector1', 'selector2', 'k1', 's1', 's2',
  'mail', 'smtp', 'dkim', 'mandrill', 'mailjet', 'mimecast',
];

async function queryTxt(name) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=TXT`,
      { headers: { Accept: 'application/dns-json' }, signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.Answer || [])
      .filter((r) => r.type === 16)
      .map((r) => r.data.replace(/^"|"$/g, '').replace(/"\s*"/g, ''));
  } catch (e) {
    clearTimeout(timeout);
    return [];
  }
}

function parseSpf(records) {
  const spf = records.find((r) => r.toLowerCase().startsWith('v=spf1'));
  if (!spf) return { configured: false };

  let strength = 'weak';
  if (/[-]all\s*$/.test(spf)) strength = 'strict'; // -all: hard fail
  else if (/~all\s*$/.test(spf)) strength = 'moderate'; // ~all: soft fail
  else if (/[?+]all\s*$/.test(spf)) strength = 'weak'; // ?all / +all: effectively no protection

  return { configured: true, record: spf, strength };
}

function parseDmarc(records) {
  const dmarc = records.find((r) => r.toLowerCase().startsWith('v=dmarc1'));
  if (!dmarc) return { configured: false };

  const policyMatch = dmarc.match(/p=(\w+)/i);
  const policy = policyMatch ? policyMatch[1].toLowerCase() : null;
  const enforced = policy === 'quarantine' || policy === 'reject';

  return { configured: true, record: dmarc, policy, enforced };
}

async function checkDkimSelectors(domain) {
  const found = [];
  await Promise.all(COMMON_DKIM_SELECTORS.map(async (selector) => {
    const records = await queryTxt(`${selector}._domainkey.${domain}`);
    const dkim = records.find((r) => r.toLowerCase().includes('v=dkim1') || r.toLowerCase().includes('k=rsa') || r.includes('p='));
    if (dkim) found.push(selector);
  }));
  return { checked_selectors: COMMON_DKIM_SELECTORS.length, found_selectors: found };
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
  const isTest = request.headers.get('X-Presend-Test') === '1';

  const allowed = await checkRateLimit(env, clientIP, 'emailsecurity', isTest);
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 20 requests per minute.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const { searchParams } = new URL(request.url);
  const domain = (searchParams.get('domain') || '').trim().toLowerCase();

  if (!domain) {
    return new Response(JSON.stringify({
      usage: 'GET /api/email-security?domain=example.com',
      checks: ['spf', 'dmarc', 'dkim (best-effort, common selectors only)'],
    }, null, 2), { headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }
  if (!DOMAIN_RE.test(domain)) {
    return new Response(JSON.stringify({ error: 'Invalid domain format' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const [spfRecords, dmarcRecords, dkim] = await Promise.all([
    queryTxt(domain),
    queryTxt(`_dmarc.${domain}`),
    checkDkimSelectors(domain),
  ]);

  const spf = parseSpf(spfRecords);
  const dmarc = parseDmarc(dmarcRecords);

  let score = 0;
  if (spf.configured) score += spf.strength === 'strict' ? 40 : spf.strength === 'moderate' ? 25 : 10;
  if (dmarc.configured) score += dmarc.enforced ? 40 : 15;
  if (dkim.found_selectors.length > 0) score += 20;

  let verdict;
  if (score >= 80) verdict = 'Well protected against email spoofing.';
  else if (score >= 40) verdict = 'Partially protected — see recommendations.';
  else verdict = 'Weak or missing anti-spoofing configuration.';

  return new Response(JSON.stringify({
    domain,
    score,
    verdict,
    spf,
    dmarc,
    dkim: {
      ...dkim,
      note: 'Best-effort: only common selectors are tested. A domain can have valid DKIM under a custom selector not listed here — absence of a match does not prove DKIM is unconfigured.',
    },
  }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...corsHeaders() },
  });
}
