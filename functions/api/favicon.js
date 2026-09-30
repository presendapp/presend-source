// GET /api/favicon?domain=example.com  -> { favicon: "https://example.com/favicon.ico" }
//
// SSRF: every redirect hop is resolved, validated, and pinned via
// safe-fetch's safeFetchFollowingRedirects(). See functions/_lib/safe-fetch.js.

import { validateAndResolve, safeFetchFollowingRedirects } from '../_lib/safe-fetch.js';

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

export async function onRequestGet(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

  const allowed = await checkRateLimit(env, clientIP, 'favicon', request.headers.get('X-Presend-Test') === '1');
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 30 requests per minute.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const { searchParams } = new URL(request.url);
  let domain = (searchParams.get('domain') || '').trim();

  if (!domain) {
    return new Response(JSON.stringify({ usage: 'GET /api/favicon?domain=example.com' }, null, 2), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  domain = domain.replace(/^https?:\/\//, '').split('/')[0];

  try {
    await validateAndResolve(domain);
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Disallowed domain' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const targetUrl = 'https://' + domain + '/';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await safeFetchFollowingRedirects(targetUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PresendBot/1.0; +https://presend.pages.dev)' },
    });
    clearTimeout(timeout);

    const finalUrl = new URL(res.url);

    let faviconPath = '/favicon.ico';
    let source = 'default';
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      const html = (await res.text()).slice(0, 100000);
      const m = html.match(/<link[^>]+rel=["'](?:shortcut\s+)?icon["'][^>]*>/i);
      if (m) {
        const hrefMatch = m[0].match(/href=["']([^"']*)["']/i);
        if (hrefMatch) { faviconPath = hrefMatch[1]; source = 'declared'; }
      }
    }

    const faviconUrl = faviconPath.startsWith('http')
      ? faviconPath
      : new URL(faviconPath, finalUrl.origin).href;

    const body = source === 'declared'
      ? { domain, favicon: faviconUrl, source }
      : { domain, favicon: faviconUrl, source, note: 'The homepage declares no <link rel="icon">; returning the conventional /favicon.ico, not checked to exist.' };
    return new Response(JSON.stringify(body), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400', ...corsHeaders() },
    });
  } catch (e) {
    clearTimeout(timeout);
    return new Response(JSON.stringify({
      domain,
      favicon: 'https://' + domain + '/favicon.ico',
      source: 'default',
      note: 'Could not fetch the homepage; returning the conventional /favicon.ico as an unverified guess.',
    }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...corsHeaders() },
    });
  }
}
