// GET /api/security-headers?url=https://example.com
// Audite les en-têtes de sécurité HTTP et donne un score.
//
// SSRF: every redirect hop is resolved, validated, and pinned via
// safe-fetch's safeFetchFollowingRedirects(). See functions/_lib/safe-fetch.js.

import { validateAndResolve, safeFetchFollowingRedirects } from '../_lib/safe-fetch.js';

async function checkRateLimit(env, clientIP, bucket) {
  if (!env.PRESEND_ANALYTICS) return true;
  try {
    const now = Math.floor(Date.now() / 60000);
    const rateKey = `rate:${bucket}:${clientIP}:${now}`;
    let count = await env.PRESEND_ANALYTICS.get(rateKey);
    count = count ? parseInt(count) : 0;
    if (count >= 20) return false;
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

const CHECKS = [
  { header: 'strict-transport-security', weight: 20, label: 'HSTS', advice: 'Add Strict-Transport-Security to force HTTPS and prevent downgrade attacks.' },
  { header: 'content-security-policy', weight: 25, label: 'Content-Security-Policy', advice: 'Add a Content-Security-Policy to mitigate XSS and data injection attacks.' },
  { header: 'x-content-type-options', weight: 10, label: 'X-Content-Type-Options', advice: 'Add X-Content-Type-Options: nosniff to prevent MIME-sniffing attacks.', expected: 'nosniff' },
  { header: 'x-frame-options', weight: 15, label: 'X-Frame-Options', advice: 'Add X-Frame-Options (or frame-ancestors in CSP) to prevent clickjacking.' },
  { header: 'referrer-policy', weight: 10, label: 'Referrer-Policy', advice: 'Add a Referrer-Policy to control how much referrer data leaks to other sites.' },
  { header: 'permissions-policy', weight: 10, label: 'Permissions-Policy', advice: 'Add a Permissions-Policy to restrict access to browser features (camera, geolocation, etc.).' },
  { header: 'x-xss-protection', weight: 5, label: 'X-XSS-Protection', advice: 'Legacy header, low impact on modern browsers, but cheap to add.' },
  { header: 'cross-origin-opener-policy', weight: 5, label: 'Cross-Origin-Opener-Policy', advice: 'Add Cross-Origin-Opener-Policy to isolate your browsing context from cross-origin windows.' },
];

function grade(score) {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 65) return 'B';
  if (score >= 50) return 'C';
  if (score >= 30) return 'D';
  return 'F';
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

  const allowed = await checkRateLimit(env, clientIP, 'securityheaders');
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 20 requests per minute.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return new Response(JSON.stringify({ usage: 'GET /api/security-headers?url=https://example.com' }, null, 2), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('bad protocol');
    await validateAndResolve(parsedUrl.hostname);
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid or disallowed URL' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await safeFetchFollowingRedirects(targetUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PresendBot/1.0; +https://presend.pages.dev)' },
    });
    clearTimeout(timeout);

    let score = 0;
    let maxScore = 0;
    const results = [];

    for (const check of CHECKS) {
      maxScore += check.weight;
      const value = res.headers.get(check.header);
      const present = !!value;
      const valid = present && (!check.expected || value.toLowerCase().includes(check.expected));
      if (valid) score += check.weight;

      results.push({
        header: check.label,
        present,
        value: value || null,
        points: valid ? check.weight : 0,
        max_points: check.weight,
        advice: valid ? null : check.advice,
      });
    }

    const percentage = Math.round((score / maxScore) * 100);

    return new Response(JSON.stringify({
      url: targetUrl,
      grade: grade(percentage),
      score: percentage,
      checks: results,
    }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...corsHeaders() },
    });
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') {
      return new Response(JSON.stringify({ error: 'Request timed out' }), {
        status: 504, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
    return new Response(JSON.stringify({ error: e.message }), {
      status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
}
