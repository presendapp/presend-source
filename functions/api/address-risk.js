// GET /api/address-risk?address=0x...
//
// Checks a crypto address against the OFAC Specially Designated
// Nationals (SDN) list -- the US Treasury's sanctions list, which since
// 2018 has included digital currency addresses. Covers EVM-format
// addresses (Ethereum, BSC, Arbitrum, and any other EVM chain reusing
// the same 0x... address, since the format -- and often the address
// itself -- is shared across chains).
//
// Source: the community-maintained 0xB10C/ofac-sanctioned-digital-currency-addresses
// repo, which extracts and republishes OFAC's SDN list as plain per-asset
// text files, regenerated nightly from the official sdn_advanced.xml.
// Free, no signup, no key -- same "no-friction" gap ip-reputation fills
// for Spamhaus DROP.
//
// Cosmos SDK (bech32) addresses are format-detected but not yet checked
// against a sanctions source -- OFAC has not published SDN entries in
// bech32 format as of this writing, so an honest "not covered" beats a
// false sense of clean.
//
// Complements ip-reputation and url-reputation -- same "verify before
// you trust it" family, this time for on-chain addresses.

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

  try {
    if (Math.random() < 0.1) {
      const today = new Date().toISOString().split('T')[0];
      const visitKey = `api-visits:address-risk:${today}`;
      const visits = await env.PRESEND_ANALYTICS.get(visitKey);
      await env.PRESEND_ANALYTICS.put(visitKey, ((visits ? parseInt(visits) : 0) + 10).toString());
    }
  } catch (e) { /* tracking best-effort */ }

  return true;
}

function corsHeaders(extra = {}) {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', ...extra };
}

const EVM_RE = /^0x[0-9a-fA-F]{40}$/;
// Bitcoin: bech32/bech32m (bc1...) or legacy base58 P2PKH/P2SH (1... / 3...).
const BTC_BECH32_RE = /^bc1[023456789ac-hj-np-z]{11,71}$/i;
const BTC_BASE58_RE = /^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/;
// Loose bech32 shape (human-readable prefix + '1' + data part), e.g. Cosmos SDK chains
// (cosmos1..., osmo1...). Shape only, no checksum. Bech32 is never mixed-case, which keeps
// base58 addresses of other chains (e.g. TRON) out of this class.
const BECH32_RE = /^[a-z]{1,20}1[023456789ac-hj-np-z]{20,90}$/i;
const INPUT_RE = /^[0-9A-Za-z:]{20,120}$/;

function isBech32(a) {
  return BECH32_RE.test(a) && (a === a.toLowerCase() || a === a.toUpperCase());
}

function detectFormat(address) {
  if (EVM_RE.test(address)) return 'evm';
  if (BTC_BASE58_RE.test(address) || (BTC_BECH32_RE.test(address) && isBech32(address))) return 'bitcoin';
  if (isBech32(address)) return 'bech32';
  return 'other';
}

// EVM hex and bech32 are case-insensitive; base58 is not.
function normalize(a) {
  return EVM_RE.test(a) || isBech32(a) ? a.toLowerCase() : a;
}

// Formats for which "not found" is a meaningful negative: OFAC files EVM and Bitcoin
// addresses, and every published list is searched.
const COVERED_FORMATS = new Set(['evm', 'bitcoin']);

// Every per-asset list the source publishes. OFAC files EVM-format addresses under tokens
// (USDT, USDC) and other chains (ETC), not only ETH/BSC/ARB, so ALL lists are searched for
// every address. Until 26 Sept. 2026 only ETH/BSC/ARB were: 4 sanctioned 0x addresses
// returned sanctioned: false. tests/address-risk/lists.mjs fails if the source adds or
// removes a list.
const ALL_LISTS = ['ARB', 'BCH', 'BSC', 'BSV', 'BTG', 'DASH', 'ETC', 'ETH', 'LTC', 'SOL', 'TRX', 'USDC', 'USDT', 'XBT', 'XMR', 'XRP', 'XVG', 'ZEC'];
const LIST_BASE = 'https://raw.githubusercontent.com/0xB10C/ofac-sanctioned-digital-currency-addresses/lists';
const SOURCE = 'OFAC Specially Designated Nationals (SDN) list, digital currency addresses (all per-asset lists), republished nightly by 0xB10C/ofac-sanctioned-digital-currency-addresses from the official sdn_advanced.xml.';
const UNRECOGNIZED = 'Unrecognized address format. EVM (0x + 40 hex chars) and Bitcoin (bc1..., 1..., 3...) addresses are fully checked; bech32 addresses of other chains (e.g. cosmos1...) are recognized but unchecked. Addresses of other chains are reported only when they appear on an OFAC list.';

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', ...corsHeaders(), ...extra },
  });
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

  const allowed = await checkRateLimit(env, clientIP, 'address-risk');
  if (!allowed) return json({ error: 'Rate limit exceeded. Max 10 requests per minute.' }, 429);

  const { searchParams } = new URL(request.url);
  const address = (searchParams.get('address') || '').trim();

  if (!address) {
    return new Response(JSON.stringify({
      usage: 'GET /api/address-risk?address=0x...',
      note: 'Checks an address against every OFAC SDN digital currency address list. EVM (0x...) and Bitcoin (bc1..., 1..., 3...) addresses are fully covered. Bech32 addresses of other chains (e.g. Cosmos SDK) return sanctioned: null unless listed, since OFAC has published no entries in that format.',
    }, null, 2), { headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  if (!INPUT_RE.test(address)) return json({ error: UNRECOGNIZED }, 400);

  const format = detectFormat(address);
  const key = normalize(address);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  const results = await Promise.allSettled(ALL_LISTS.map((ticker) =>
    fetch(`${LIST_BASE}/sanctioned_addresses_${ticker}.txt`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PresendBot/1.0; +https://presend.pages.dev)' },
      cf: { cacheTtl: 1800, cacheEverything: true },
    }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    })
  ));
  clearTimeout(timeout);

  const matched = [];
  const failed = [];
  let listSize = 0;
  results.forEach((res, i) => {
    if (res.status !== 'fulfilled') { failed.push(ALL_LISTS[i]); return; }
    const lines = res.value.split('\n').map((l) => l.trim()).filter(Boolean);
    listSize += lines.length;
    if (lines.some((l) => normalize(l) === key)) matched.push(ALL_LISTS[i]);
  });

  const cache = { 'Cache-Control': 'public, max-age=900' };

  if (matched.length) {
    return json({
      address, format, sanctioned: true, matched_lists: matched,
      lists_checked: ALL_LISTS, list_size: listSize, source: SOURCE,
      note: 'This address appears on the OFAC SDN sanctions list. US persons are generally prohibited from dealing with it.',
    }, 200, cache);
  }

  // Fail closed: without every list, a negative cannot be confirmed.
  if (failed.length) {
    const timedOut = results.some((r) => r.status === 'rejected' && r.reason && r.reason.name === 'AbortError');
    return json({
      error: timedOut
        ? 'OFAC list request timed out. Try again shortly.'
        : 'Could not load every OFAC list, so a negative result cannot be confirmed. Try again shortly.',
      lists_unavailable: failed,
    }, timedOut ? 504 : 502);
  }

  if (COVERED_FORMATS.has(format)) {
    return json({
      address, format, sanctioned: false, matched_lists: [],
      lists_checked: ALL_LISTS, list_size: listSize, source: SOURCE,
      note: 'Not on any OFAC SDN digital currency address list. This is one specific, US-government sanctions list -- not a full risk score, and a clean result here does not mean the address is otherwise trustworthy.',
    }, 200, cache);
  }

  if (format === 'bech32') {
    return json({
      address, format, sanctioned: null, matched_lists: [],
      lists_checked: ALL_LISTS, list_size: listSize, source: SOURCE,
      note: 'Bech32 address (e.g. a Cosmos SDK chain) not found on any OFAC list. OFAC has published no sanctions entries for Cosmos SDK chains, so this is an unchecked result, not a clean one.',
    }, 200, cache);
  }

  return json({ error: UNRECOGNIZED }, 400);
}
