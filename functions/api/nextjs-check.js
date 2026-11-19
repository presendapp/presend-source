// GET /api/nextjs-check?url=https://example.com
// Reads the Next.js version a site ships in its public JavaScript files, then lists the
// published advisories for that version (OSV database, mirror of GitHub Security Advisories).
//
// Read-only: the homepage and the /_next/static/*.js files it references, nothing else.
// SSRF: every hop and every script URL goes through safe-fetch (blocked hosts and private IPs).

import { validateAndResolve, safeFetch, safeFetchFollowingRedirects } from '../_lib/safe-fetch.js';
import { checkRateLimit } from '../_shared/rate-limit.js';

const UA = 'Mozilla/5.0 (compatible; PresendNextCheck/1.0; +https://presend.pages.dev/nextjs-check)';
const MAX_SCRIPTS = 20;
const MAX_HTML = 3_000_000;
const MAX_JS = 4_000_000;
const BUDGET_MS = 20_000;

// Targets with no published advisory when this was written (19 Nov 2026); see `target()`.
export const TARGET_15 = '15.5.29';
export const TARGET_16 = '16.4.6';

export const VERSION_PATTERNS = [
  /window\.next\s*=\s*\{\s*version\s*:\s*"(\d+\.\d+\.\d+[^"]*)"/,
  /version\s*:\s*"(\d+\.\d+\.\d+[^"]*)"\s*,\s*appDir/,
  /[\s,;(]\w+="(\d+\.\d+\.\d+[^"]*)",\w+=\(0,\w+\.default\)\(\)/,
];
const SCRIPT_RE = /(?:src|href)=["']([^"']*\/_next\/static\/[^"'?]+\.js(?:\?[^"']*)?)["']/g;
const RSC_SCRIPT_RE = /\\?["']((?:\/?_next\/)?static\/chunks\/[^"'\\?]+\.js)/g;

function cors(extra = {}) {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', ...extra };
}
function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors(extra) } });
}

export function isNextHtml(html) {
  return html.includes('/_next/') || html.includes('__NEXT_DATA__') || html.includes('self.__next_f');
}

export function scriptUrls(html, baseUrl) {
  const out = [];
  const add = (u) => { if (!out.includes(u)) out.push(u); };
  for (const m of html.matchAll(SCRIPT_RE)) add(new URL(m[1], baseUrl).toString());
  for (const m of html.matchAll(RSC_SCRIPT_RE)) {
    let rel = m[1].replace(/^\/+/, '');
    if (!rel.startsWith('_next/')) rel = '_next/' + rel;
    add(new URL('/' + rel, baseUrl).toString());
  }
  const prio = (u) => (/\/(main|main-app|webpack|framework|pages\/_app)[-.]/.test(u) ? 0 : 1);
  return out.sort((a, b) => prio(a) - prio(b));
}

export function findVersion(js) {
  for (const re of VERSION_PATTERNS) {
    const m = js.match(re);
    if (m) return m[1];
  }
  return null;
}

export function target(version) {
  const major = parseInt(version, 10);
  if (major <= 14) return { version: TARGET_16, kind: 'major', note: `No fixed release is left in the ${major}.x line: this needs a major-version upgrade (to ${TARGET_16}, or ${TARGET_15}).` };
  if (major === 15) return { version: TARGET_15, kind: 'patch', note: `Patch upgrade within 15.x to ${TARGET_15}.` };
  return { version: TARGET_16, kind: 'minor', note: `Upgrade within 16.x to ${TARGET_16}.` };
}

const ORDER = { CRITICAL: 0, HIGH: 1, MODERATE: 2, MEDIUM: 2, LOW: 3 };
export function summarize(vulns) {
  const rows = (vulns || []).map((v) => {
    const sev = (((v.database_specific || {}).severity) || 'UNKNOWN').toUpperCase();
    const id = v.id.startsWith('GHSA') ? v.id : ((v.aliases || []).find((a) => a.startsWith('GHSA')) || v.id);
    const cve = (v.aliases || []).find((a) => a.startsWith('CVE')) || null;
    const fixed = [];
    for (const aff of v.affected || []) {
      if (((aff.package || {}).name) !== 'next') continue;
      for (const r of aff.ranges || []) for (const ev of r.events || []) if (ev.fixed) fixed.push(ev.fixed);
    }
    return { id, cve, severity: sev.toLowerCase(), summary: (v.summary || '').trim(), fixed: [...new Set(fixed)] };
  });
  rows.sort((a, b) => (ORDER[a.severity.toUpperCase()] ?? 4) - (ORDER[b.severity.toUpperCase()] ?? 4));
  const counts = { critical: 0, high: 0, moderate: 0, low: 0 };
  for (const r of rows) {
    const k = r.severity === 'medium' ? 'moderate' : r.severity;
    if (k in counts) counts[k]++;
  }
  return { total: rows.length, counts, advisories: rows };
}

async function readText(res, max) {
  const t = await res.text();
  return t.length > max ? t.slice(0, max) : t;
}

export async function onRequestOptions() {
  return new Response(null, { headers: cors() });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!(await checkRateLimit(env, ip, 'nextjscheck', { limit: 10 }))) {
    return json({ error: 'Too many checks from your address. Try again in a minute.' }, 429);
  }
  const target_url = new URL(request.url).searchParams.get('url');
  if (!target_url) return json({ usage: 'GET /api/nextjs-check?url=https://example.com' });

  let start;
  try {
    if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(target_url) && !/^https?:\/\//i.test(target_url)) throw new Error('protocol');
    start = new URL(/^https?:\/\//i.test(target_url) ? target_url : 'https://' + target_url);
    if (!['http:', 'https:'].includes(start.protocol)) throw new Error('protocol');
    await validateAndResolve(start.hostname);
  } catch (e) {
    return json({ error: 'Enter a public website address, for example https://example.com' }, 400);
  }

  const t0 = Date.now();
  const opts = () => ({ headers: { 'User-Agent': UA, Accept: 'text/html,*/*' }, signal: AbortSignal.timeout(8000) });
  let res, html, finalUrl;
  try {
    res = await safeFetchFollowingRedirects(start.toString(), opts());
    finalUrl = res.url || start.toString();
    html = await readText(res, MAX_HTML);
  } catch (e) {
    return json({ error: 'The site could not be reached.' }, 502);
  }
  if (!res.ok) return json({ error: `The site answered with HTTP ${res.status}.` }, 502);

  const base = { url: start.toString(), final_url: finalUrl, checked_at: new Date().toISOString() };
  if (!isNextHtml(html)) return json({ ...base, nextjs: false }, 200, { 'Cache-Control': 'public, max-age=3600' });

  let version = null;
  for (const u of scriptUrls(html, finalUrl).slice(0, MAX_SCRIPTS)) {
    if (Date.now() - t0 > BUDGET_MS) break;
    try {
      const r = await safeFetch(u, opts());
      if (!r.ok) continue;
      version = findVersion(await readText(r, MAX_JS));
      if (version) break;
    } catch (e) { /* next script */ }
  }
  if (!version) return json({ ...base, nextjs: true, version: null }, 200, { 'Cache-Control': 'public, max-age=3600' });

  let report;
  try {
    const o = await fetch('https://api.osv.dev/v1/query', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package: { name: 'next', ecosystem: 'npm' }, version }),
      signal: AbortSignal.timeout(10000),
    });
    report = summarize((await o.json()).vulns);
  } catch (e) {
    return json({ ...base, nextjs: true, version, error: 'The advisory database could not be reached. Try again later.' }, 502);
  }
  return json({ ...base, nextjs: true, version, ...report, recommended: report.total ? target(version) : null },
    200, { 'Cache-Control': 'public, max-age=3600' });
}
