// GET /api/link-metadata?url=https://example.com
//
// Extracts Open Graph, Twitter Card, and basic <head> metadata from a URL --
// the same data a chat app or Slack/Discord uses to render a link preview card.
//
// SSRF: every hop, redirects included, is resolved and validated by
// safe-fetch's safeFetchFollowingRedirects() (manual redirects, one
// validateAndResolve() per hop). Until 2026-10-01 only the first hostname
// was validated and redirects were followed by fetch() unchecked. See
// functions/_lib/safe-fetch.js.
//
// Also returns final_url (after redirects; relative URLs in the page
// resolve against it) and favicon / favicon_source ("declared" when the
// page has <link rel="icon">, "default" when /favicon.ico is only a guess).
// Replaces the undocumented /api/scrape (merged 2026-10-01).
//
// Only reads up to MAX_BYTES of the response (stops early at </head> when
// found), since metadata lives in <head> and there's no reason to download
// a multi-MB page body just to read a handful of meta tags.

import { validateAndResolve, safeFetchFollowingRedirects } from '../_lib/safe-fetch.js';
import { checkRateLimit } from '../_shared/rate-limit.js';

function corsHeaders(extra = {}) {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', ...extra };
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

const MAX_BYTES = 300000; // large enough for any reasonable <head>, small enough to stay fast

function extractMeta(html, attr, key) {
  const re = new RegExp(`<meta[^>]+${attr}=["']${key}["'][^>]+content=["']([^"']*)["']`, 'i');
  const reAlt = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${attr}=["']${key}["']`, 'i');
  const m = html.match(re) || html.match(reAlt);
  return m ? decodeEntities(m[1].trim()) : null;
}

function decodeEntitiesOnce(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function decodeEntities(str) {
  if (!str) return str;
  // Applique deux fois -- certaines pages (GitHub notamment) servent des
  // entites doublement encodees (&amp;amp;) dans leur propre HTML source.
  return decodeEntitiesOnce(decodeEntitiesOnce(str));
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? decodeEntities(m[1].trim()) : null;
}

function extractFavicon(html, baseUrl) {
  const tag = html.match(/<link[^>]+rel=["'](?:shortcut\s+)?icon["'][^>]*>/i);
  const href = tag ? tag[0].match(/href=["']([^"']+)["']/i) : null;
  if (href) {
    try {
      return { favicon: new URL(decodeEntities(href[1].trim()), baseUrl).href, favicon_source: 'declared' };
    } catch { /* unusable href: fall back to the default guess */ }
  }
  return { favicon: new URL('/favicon.ico', baseUrl).href, favicon_source: 'default' };
}

function extractCanonical(html) {
  const m = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i);
  return m ? m[1].trim() : null;
}

async function readHead(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let total = 0;

  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    text += decoder.decode(value, { stream: true });
    if (/<\/head>/i.test(text)) break;
  }
  try { reader.cancel(); } catch (e) { /* best-effort */ }
  return text;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

  const allowed = await checkRateLimit(env, clientIP, 'link-metadata', { limit: 20, isTest: request.headers.get('X-Presend-Test') === '1', trackVisits: true });
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 20 requests per minute.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const { searchParams } = new URL(request.url);
  const targetRaw = (searchParams.get('url') || '').trim();

  if (!targetRaw) {
    return new Response(JSON.stringify({
      usage: 'GET /api/link-metadata?url=https://example.com',
      note: 'Extracts Open Graph, Twitter Card, and basic <head> metadata -- the same data used to render a link preview card.',
    }, null, 2), { headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  let targetUrl;
  try {
    targetUrl = new URL(targetRaw);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid URL format.' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
  if (!['http:', 'https:'].includes(targetUrl.protocol)) {
    return new Response(JSON.stringify({ error: 'Invalid or disallowed URL' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  try {
    await validateAndResolve(targetUrl.hostname);
  } catch (e) {
    return new Response(JSON.stringify({ error: `Disallowed target: ${e.message}` }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  let html;
  let finalUrl = targetUrl.toString();
  try {
    const res = await safeFetchFollowingRedirects(targetUrl.toString(), {
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PresendBot/1.0; +https://presend.pages.dev)' },
    });
    clearTimeout(timeout);
    if (res.url) finalUrl = res.url;

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Target returned HTTP ${res.status}`, url: targetRaw }), {
        status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
    html = await readHead(res);
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') {
      return new Response(JSON.stringify({ error: 'Request timed out fetching the target.' }), {
        status: 504, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
    return new Response(JSON.stringify({ error: 'Could not fetch target.', detail: e.message }), {
      status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const result = {
    url: targetRaw,
    final_url: finalUrl,
    title: extractTitle(html),
    description: extractMeta(html, 'name', 'description'),
    canonical_url: extractCanonical(html),
    open_graph: {
      title: extractMeta(html, 'property', 'og:title'),
      description: extractMeta(html, 'property', 'og:description'),
      image: extractMeta(html, 'property', 'og:image'),
      type: extractMeta(html, 'property', 'og:type'),
      site_name: extractMeta(html, 'property', 'og:site_name'),
      url: extractMeta(html, 'property', 'og:url'),
    },
    twitter_card: {
      card: extractMeta(html, 'name', 'twitter:card'),
      title: extractMeta(html, 'name', 'twitter:title'),
      description: extractMeta(html, 'name', 'twitter:description'),
      image: extractMeta(html, 'name', 'twitter:image'),
    },
    ...extractFavicon(html, finalUrl),
  };

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=600', ...corsHeaders() },
  });
}
