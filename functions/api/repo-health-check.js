// GET /api/repo-health-check?repo=owner/name
//
// Pulls repository health signals from the GitHub API: stars, forks,
// open issues, license, whether it's archived, and days since the
// last push. Free, unauthenticated GitHub API access, no signup.
//
// Complements typosquat-check and vulnerability-check: a package
// whose name looks like a typo of something popular AND whose source
// repo was created days ago with zero stars is a much stronger
// combined signal than either check alone. Same "should I trust this
// dependency" question, checked from the repo side rather than the
// registry side.
//
// Known limitation, disclosed rather than hidden: unauthenticated
// GitHub API access is capped at 60 requests/hour, shared across ALL
// Presend traffic through Cloudflare's edge IPs -- tighter than every
// other endpoint here. A 403 from GitHub's own rate limit is passed
// through with a clear explanation rather than a generic error.

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

const REPO_RE = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

  const allowed = await checkRateLimit(env, clientIP, 'repo-health-check');
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 10 requests per minute.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const { searchParams } = new URL(request.url);
  const repo = (searchParams.get('repo') || '').trim();

  if (!repo) {
    return new Response(JSON.stringify({
      usage: 'GET /api/repo-health-check?repo=owner/name',
      example: 'GET /api/repo-health-check?repo=lodash/lodash',
      note: 'Uses unauthenticated GitHub API access, capped at 60 requests/hour shared across all Presend traffic -- tighter than other endpoints. A busy period may return a 503 with a clear explanation.',
    }, null, 2), { headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }
  if (!REPO_RE.test(repo)) {
    return new Response(JSON.stringify({ error: 'Invalid format. Use owner/name, e.g. lodash/lodash.' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (compatible; PresendBot/1.0; +https://presend.pages.dev)',
      Accept: 'application/vnd.github+json',
    };
    // Jeton optionnel côté serveur : fait passer la limite de 60/h (partagée
    // par tout le trafic Presend) à 5000/h. Jamais exposé, aucune inscription
    // requise côté utilisateur -- ne change rien à la philosophie "zéro friction".
    if (env.GITHUB_TOKEN) {
      headers['Authorization'] = `Bearer ${env.GITHUB_TOKEN}`;
    }
    const res = await fetch(`https://api.github.com/repos/${repo}`, {
      signal: controller.signal,
      headers,
    });
    clearTimeout(timeout);

    if (res.status === 404) {
      return new Response(JSON.stringify({ repo, found: false, note: 'Repository not found (or private).' }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=1800', ...corsHeaders() },
      });
    }
    if (res.status === 403) {
      return new Response(JSON.stringify({
        error: 'GitHub\'s unauthenticated API rate limit (60/hour, shared across all Presend traffic) was hit. Try again in a few minutes.',
      }), { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
    }
    if (!res.ok) throw new Error(`GitHub API error (HTTP ${res.status})`);

    const d = await res.json();
    const now = Date.now();
    const pushedDaysAgo = d.pushed_at ? Math.floor((now - new Date(d.pushed_at).getTime()) / 86400000) : null;
    const ageDays = d.created_at ? Math.floor((now - new Date(d.created_at).getTime()) / 86400000) : null;

    return new Response(JSON.stringify({
      repo,
      found: true,
      ...(d.full_name && d.full_name.toLowerCase() !== repo.toLowerCase()
        ? { moved_to: d.full_name, note_rename: `${repo} was renamed/moved -- data below is for its current location, ${d.full_name}.` }
        : {}),
      description: d.description || null,
      stars: d.stargazers_count,
      forks: d.forks_count,
      open_issues: d.open_issues_count,
      created: d.created_at,
      age_days: ageDays,
      last_push: d.pushed_at,
      days_since_last_push: pushedDaysAgo,
      archived: d.archived,
      is_fork: d.fork,
      license: d.license ? d.license.spdx_id : null,
      default_branch: d.default_branch,
      topics: d.topics || [],
      url: d.html_url,
      source: 'GitHub REST API.',
    }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=1800', ...corsHeaders() } });
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') {
      return new Response(JSON.stringify({ error: 'GitHub API request timed out. Try again shortly.' }), {
        status: 504, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
    return new Response(JSON.stringify({ error: 'Could not complete repository health check.', detail: e.message }), {
      status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
}
