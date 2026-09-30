// GET /api/rpc-check?url=https://rpc.example-chain.network:443
//
// Audits a public CometBFT RPC endpoint for a Cosmos SDK chain: node
// liveness/sync status, peer connectivity, and -- most importantly --
// whether "unsafe" administrative RPC methods (dial_seeds, dial_peers,
// unsafe_flush_mempool) appear to be exposed. These are meant to be
// enabled only for local/trusted access; a publicly reachable node with
// them on can be forced to dial arbitrary peers or flush its mempool by
// anyone who finds the URL.
//
// Safety note: this tool NEVER calls any unsafe method. Detection is
// done by fetching CometBFT's own root listing page (a plain GET to
// the RPC base URL, which returns a static list of registered routes,
// documented and mentioned in CometBFT's own source as a passive
// listing -- it renders links, it does not invoke the underlying
// handlers) and checking whether the three unsafe route names appear
// in it. No mutating or resource-affecting call is ever made against
// the target node.
//
// SSRF: the RPC host is resolved, validated, and pinned via
// safe-fetch's safeFetchFollowingRedirects(), exactly like
// security-scan and redirect-trace. See functions/_lib/safe-fetch.js.

import { validateAndResolve, safeFetchFollowingRedirects } from '../_lib/safe-fetch.js';

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
      const visitKey = `api-visits:rpc-check:${today}`;
      const visits = await env.PRESEND_ANALYTICS.get(visitKey);
      await env.PRESEND_ANALYTICS.put(visitKey, ((visits ? parseInt(visits) : 0) + 10).toString());
    }
  } catch (e) { /* tracking best-effort */ }

  return true;
}

function corsHeaders(extra = {}) {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', ...extra };
}

const UNSAFE_METHODS = ['dial_seeds', 'dial_peers', 'unsafe_flush_mempool'];
const FETCH_TIMEOUT_MS = 8000;

function joinRpcPath(base, path) {
  return base.replace(/\/+$/, '') + path;
}

async function safeGetJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await safeFetchFollowingRedirects(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PresendBot/1.0; +https://presend.pages.dev)' },
    });
    clearTimeout(timeout);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const body = await res.json();
    return { ok: true, data: body && body.result !== undefined ? body.result : body };
  } catch (e) {
    clearTimeout(timeout);
    return { ok: false, error: e.name === 'AbortError' ? 'Request timed out' : e.message };
  }
}

async function safeGetText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await safeFetchFollowingRedirects(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PresendBot/1.0; +https://presend.pages.dev)' },
    });
    clearTimeout(timeout);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const text = await res.text();
    return { ok: true, text };
  } catch (e) {
    clearTimeout(timeout);
    return { ok: false, error: e.name === 'AbortError' ? 'Request timed out' : e.message };
  }
}

function checkUnsafeExposure(listingText) {
  const found = UNSAFE_METHODS.filter((m) => listingText.includes('/' + m));
  return {
    checked: true,
    exposed: found.length > 0,
    methods_found: found,
    note: found.length > 0
      ? `This node's root endpoint listing advertises ${found.length} unsafe RPC method(s). If this is a public-facing node, these should be disabled (rpc.unsafe = false in config.toml) -- they allow forcing peer connections or flushing the mempool.`
      : 'No unsafe RPC methods (dial_seeds, dial_peers, unsafe_flush_mempool) found in this node\'s route listing. Note: some nodes disable the listing itself, which would also show as not-found here -- this is not a guarantee the methods are off, only that they are not advertised.',
  };
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

  const allowed = await checkRateLimit(env, clientIP, 'rpc-check');
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 10 requests per minute.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const { searchParams } = new URL(request.url);
  const rpcUrl = (searchParams.get('url') || '').trim();

  if (!rpcUrl) {
    return new Response(JSON.stringify({
      usage: 'GET /api/rpc-check?url=https://rpc.example-chain.network:443',
      note: 'Audits a public CometBFT RPC endpoint: status, health, peer connectivity, and whether unsafe admin methods (dial_seeds, dial_peers, unsafe_flush_mempool) are exposed. Read-only -- never calls any unsafe method itself.',
    }, null, 2), { headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(rpcUrl);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('bad protocol');
    await validateAndResolve(parsedUrl.hostname);
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid or disallowed URL' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const base = rpcUrl.replace(/\/+$/, '');

  const [statusResult, healthResult, netInfoResult, abciInfoResult, listingResult] = await Promise.all([
    safeGetJson(joinRpcPath(base, '/status')),
    safeGetJson(joinRpcPath(base, '/health')),
    safeGetJson(joinRpcPath(base, '/net_info')),
    safeGetJson(joinRpcPath(base, '/abci_info')),
    safeGetText(joinRpcPath(base, '/')),
  ]);

  const reachable = statusResult.ok || healthResult.ok;

  const status = statusResult.ok
    ? {
      checked: true,
      chain_id: statusResult.data?.node_info?.network ?? null,
      moniker: statusResult.data?.node_info?.moniker ?? null,
      node_version: statusResult.data?.node_info?.version ?? null,
      catching_up: statusResult.data?.sync_info?.catching_up ?? null,
      latest_block_height: statusResult.data?.sync_info?.latest_block_height ?? null,
      latest_block_time: statusResult.data?.sync_info?.latest_block_time ?? null,
    }
    : { checked: false, error: statusResult.error };

  const health = { checked: healthResult.ok, healthy: healthResult.ok, error: healthResult.ok ? null : healthResult.error };

  const netInfo = netInfoResult.ok
    ? { checked: true, listening: netInfoResult.data?.listening ?? null, n_peers: netInfoResult.data?.n_peers ?? null }
    : { checked: false, error: netInfoResult.error };

  const abciInfo = abciInfoResult.ok
    ? {
      checked: true,
      app_version: abciInfoResult.data?.response?.version ?? null,
      last_block_height: abciInfoResult.data?.response?.last_block_height ?? null,
    }
    : { checked: false, error: abciInfoResult.error };

  const unsafeExposure = listingResult.ok
    ? checkUnsafeExposure(listingResult.text)
    : { checked: false, exposed: null, error: listingResult.error };

  const tls = {
    used: parsedUrl.protocol === 'https:',
    note: parsedUrl.protocol === 'https:'
      ? null
      : 'RPC traffic to this endpoint is unencrypted (http://). Anyone on the network path can read requests and responses.',
  };

  let verdict = 'Node reachable, no major issues found.';
  if (!reachable) {
    verdict = 'Could not reach this RPC endpoint.';
  } else if (unsafeExposure.exposed === true) {
    verdict = 'Unsafe RPC methods appear exposed -- see unsafe_methods for details.';
  } else if (!tls.used) {
    verdict = 'Node reachable, but RPC traffic is unencrypted.';
  }

  return new Response(JSON.stringify({
    url: rpcUrl,
    reachable,
    verdict,
    tls,
    status,
    health,
    net_info: netInfo,
    abci_info: abciInfo,
    unsafe_methods: unsafeExposure,
  }, null, 2), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders() },
  });
}
