// GET /api/redirect-trace?url=https://example.com
//
// Follows a URL's full redirect chain manually (redirect: "manual"),
// recording each hop's status code and destination, instead of just
// returning the final destination like a normal fetch() would.
//
// Complements url-reputation and whois-lookup: a link that hops
// through several unrelated domains before landing somewhere else is
// a classic cloaking/phishing pattern that neither "is the final URL
// malicious" nor "how old is the final domain" alone would catch --
// checking the destination doesn't tell you about the path taken to
// get there.
//
// SSRF: every hop (initial URL and every redirect target) is resolved
// and validated via safe-fetch's validateAndResolve() BEFORE being
// fetched, and the actual connection is pinned to that validated IP
// (cf.resolveOverride) -- checking only the hostname string would miss
// DNS rebinding, where a hostname resolves to a public IP at check time
// and a private one at connect time. See functions/_lib/safe-fetch.js.

import { validateAndResolve } from '../_lib/safe-fetch.js';

async function checkRateLimit(env, clientIP, bucket) {
  if (!env.PRESEND_ANALYTICS) return true;
  try {
    const now = Math.floor(Date.now() / 60000);
    const rateKey = `rate:${bucket}:${clientIP}:${now}`;
    let count = await env.PRESEND_ANALYTICS.get(rateKey);
    count = count ? parseInt(count) : 0;
    if (count >= 10) return false;
    if (Math.random() < 1 / 5) {
      await env.PRESEND_ANALYTICS.put(rateKey, (count + 5).toString(), { expirationTtl: 120 });
    }
  } catch (e) {
    return true;
  }
  return true;
}

function corsHeaders(extra = {}) {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', ...extra };
}

const MAX_HOPS = 15;

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

  const allowed = await checkRateLimit(env, clientIP, 'redirect-trace');
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 10 requests per minute.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const { searchParams } = new URL(request.url);
  const startUrlRaw = (searchParams.get('url') || '').trim();

  if (!startUrlRaw) {
    return new Response(JSON.stringify({
      usage: 'GET /api/redirect-trace?url=https://example.com',
      note: 'Follows the full redirect chain (up to 15 hops), recording each hop\'s status and destination.',
    }, null, 2), { headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  let currentUrl;
  try {
    currentUrl = new URL(startUrlRaw);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid URL format.' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
  if (!['http:', 'https:'].includes(currentUrl.protocol)) {
    return new Response(JSON.stringify({ error: 'Invalid or disallowed URL' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const hops = [];
  const seen = new Set();
  let finalStatus = null;
  let error = null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    for (let i = 0; i < MAX_HOPS; i++) {
      const urlStr = currentUrl.toString();
      if (seen.has(urlStr)) {
        error = 'Redirect loop detected';
        break;
      }
      seen.add(urlStr);

      let validatedIp;
      try {
        validatedIp = await validateAndResolve(currentUrl.hostname);
      } catch (e) {
        error = `Disallowed hop: ${e.message}`;
        break;
      }

      const res = await fetch(urlStr, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PresendBot/1.0; +https://presend.pages.dev)' },
        cf: { resolveOverride: validatedIp },
      });

      const isRedirect = res.status >= 300 && res.status < 400;
      const location = res.headers.get('Location');

      hops.push({ url: urlStr, status: res.status, hostname: currentUrl.hostname });

      if (!isRedirect || !location) {
        finalStatus = res.status;
        break;
      }

      let nextUrl;
      try {
        nextUrl = new URL(location, currentUrl);
      } catch {
        error = 'Malformed Location header, could not follow further';
        break;
      }
      if (!['http:', 'https:'].includes(nextUrl.protocol)) {
        error = 'Redirect target uses a disallowed protocol';
        break;
      }
      currentUrl = nextUrl;

      if (i === MAX_HOPS - 1) {
        error = `Stopped after ${MAX_HOPS} hops (possible redirect loop)`;
      }
    }
    clearTimeout(timeout);
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') {
      return new Response(JSON.stringify({ error: 'Request timed out while following the redirect chain.', hops }), {
        status: 504, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
    return new Response(JSON.stringify({ error: 'Could not complete redirect trace.', detail: e.message, hops }), {
      status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const uniqueHostnames = [...new Set(hops.map((h) => h.hostname))];

  return new Response(JSON.stringify({
    requested_url: startUrlRaw,
    hop_count: hops.length,
    hops,
    final_url: hops.length ? hops[hops.length - 1].url : startUrlRaw,
    final_status: finalStatus,
    crossed_domains: uniqueHostnames.length > 1,
    unique_hostnames: uniqueHostnames,
    ...(error ? { warning: error } : {}),
  }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300', ...corsHeaders() } });
}
