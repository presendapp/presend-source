import { onRequestGet as maintainerGet } from './maintainer-change-check.js';
import { onRequestGet as vulnerabilityGet } from './vulnerability-check.js';
import { onRequestGet as typosquatGet } from './typosquat-check.js';
import { onRequestGet as repoHealthGet } from './repo-health-check.js';
import { callInternal } from '../_shared/internal-call.js';
// GET /api/supply-chain-check?ecosystem=npm&package=lodash
//
// Combines maintainer-change-check, vulnerability-check, typosquat-check,
// and (when a GitHub repo can be resolved from the registry metadata)
// repo-health-check into a single call with one overall verdict --
// same "should I trust this dependency" question, all four signals
// at once instead of four separate round-trips.
//
// maintainer-change-check is npm-only, so on PyPI this only combines
// vulnerability-check + typosquat-check + repo-health-check (when
// resolvable) -- disclosed in the response itself, not hidden.

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

function extractGithubRepo(repoField) {
  if (!repoField) return null;
  const url = typeof repoField === 'string' ? repoField : repoField.url;
  if (!url) return null;
  const match = url.match(/github\.com[:/]([^/]+)\/([^/.]+?)(\.git)?(\/)?$/);
  if (!match) return null;
  return `${match[1]}/${match[2]}`;
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

  const allowed = await checkRateLimit(env, clientIP, 'supplychaincheck');
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 10 requests per minute.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const { searchParams, origin } = new URL(request.url);
  const ecosystem = (searchParams.get('ecosystem') || '').toLowerCase();
  const pkg = (searchParams.get('package') || '').trim();
  const versionParam = (searchParams.get('version') || '').trim();

  if (!ecosystem || !pkg) {
    return new Response(JSON.stringify({
      usage: 'GET /api/supply-chain-check?ecosystem=npm&package=lodash',
      note: 'Combines maintainer-change-check (npm only), vulnerability-check, typosquat-check, and repo-health-check (when a GitHub repo can be resolved) into one call.',
    }, null, 2), { headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  const results = {};
  // Sub-checks run in-process as the original caller (own rate-limit bucket, no double counting).
  const sub = (handler, url) => callInternal(handler, { url, clientIP: context.request.headers.get('CF-Connecting-IP') || 'unknown', userAgent: context.request.headers.get('User-Agent') || '', env: context.env, waitUntil: (pr) => context.waitUntil(pr) });
  // A failed sub-check (429, 5xx...) is reported as unavailable, never read as 'no signal'.
  const asResult = async (r) => (r.ok ? r.json() : { unavailable: true, status: r.status });
  let repoPath = null;

  try {
    const tasks = [];
    // Version checked for vulnerabilities: the one requested, else the latest published one
    // (without a version, vulnerability-check reports advisories across ALL versions).
    let resolveVersion;
    const versionP = new Promise((res) => { resolveVersion = res; });
    if (versionParam) {
      resolveVersion(versionParam);
    } else if (ecosystem === 'pypi') {
      fetch(`https://pypi.org/pypi/${encodeURIComponent(pkg)}/json`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => resolveVersion((d && d.info && d.info.version) || null))
        .catch(() => resolveVersion(null));
    } else if (ecosystem !== 'npm') {
      resolveVersion(null);
    }

    if (ecosystem === 'npm') {
      tasks.push(
        fetch(`https://registry.npmjs.org/${encodeURIComponent(pkg)}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data) {
              repoPath = extractGithubRepo(data.repository);
            }
            if (!versionParam) resolveVersion((data && data['dist-tags'] && data['dist-tags'].latest) || null);
            return sub(maintainerGet, `${origin}/api/maintainer-change-check?ecosystem=${ecosystem}&package=${encodeURIComponent(pkg)}`);
          })
          .then(asResult)
          .then((data) => { results.maintainer_change = data; })
      );
    }

    tasks.push(
      versionP.then((v) => sub(vulnerabilityGet, `${origin}/api/vulnerability-check?ecosystem=${ecosystem}&package=${encodeURIComponent(pkg)}${v ? `&version=${encodeURIComponent(v)}` : ''}`))
        .then(asResult)
        .then((data) => { results.vulnerability = data; })
    );

    tasks.push(
      sub(typosquatGet, `${origin}/api/typosquat-check?ecosystem=${ecosystem}&package=${encodeURIComponent(pkg)}`)
        .then(asResult)
        .then((data) => { results.typosquat = data; })
    );

    await Promise.all(tasks);

    if (repoPath) {
      const repoRes = await sub(repoHealthGet, `${origin}/api/repo-health-check?repo=${encodeURIComponent(repoPath)}`);
      results.repo_health = await asResult(repoRes);
    }

    const flags = [];
    if (results.maintainer_change?.suspicious) flags.push('maintainer_change');
    if ((results.vulnerability?.vulnerabilities || []).length > 0) flags.push('known_vulnerabilities');
    if (results.typosquat?.suspicious) flags.push('possible_typosquat');
    if (results.repo_health?.archived) flags.push('repo_archived');
    const unavailable = Object.keys(results).filter((k) => results[k]?.unavailable);
    const versionChecked = await versionP;

    return new Response(JSON.stringify({
      package: pkg,
      ecosystem,
      github_repo_resolved: repoPath,
      overall_risk: flags.length > 0 ? 'review_recommended' : (unavailable.length > 0 ? 'incomplete' : 'no_signals_found'),
      unavailable_checks: unavailable,
      version_checked: versionChecked,
      version_source: versionParam ? 'requested' : (versionChecked ? 'latest' : null),
      version_note: versionChecked ? null : 'The version to check could not be determined: vulnerability results cover all versions of the package.',
      flags,
      checks: results,
      note: ecosystem !== 'npm'
        ? 'maintainer-change-check is npm-only, not included for this ecosystem.'
        : (repoPath ? null : 'No GitHub repo could be resolved from registry metadata -- repo_health not included.'),
    }, null, 2), { headers: { 'Content-Type': 'application/json', 'Cache-Control': unavailable.length > 0 ? 'no-store' : 'public, max-age=1800', ...corsHeaders() } });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Could not complete supply-chain check.', detail: e.message }), {
      status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
}
