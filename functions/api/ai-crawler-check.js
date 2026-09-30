// GET /api/ai-crawler-check?domain=example.com
//
// Fetches a domain's robots.txt and reports exactly which AI crawlers
// (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot, etc.) are
// allowed or blocked -- as a plain JSON API, no signup/email required,
// unlike the similar lead-gen checker tools that exist for this.
//
// AI crawler traffic grew ~7,851% in 2025 (HUMAN Security 2026 report),
// and a single misplaced Disallow line can silently block a site from
// every AI-powered search/answer engine without the owner noticing.

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

// Known AI crawler tokens as of 2026. Not exhaustive -- major new bots
// appear a few times a year. "respects_robots_txt" reflects each
// company's documented/observed behavior, not a guarantee.
const KNOWN_BOTS = [
  { token: 'GPTBot', company: 'OpenAI', category: 'ai-training', respects_robots_txt: true },
  { token: 'ChatGPT-User', company: 'OpenAI', category: 'ai-assistant', respects_robots_txt: false },
  { token: 'OAI-SearchBot', company: 'OpenAI', category: 'ai-search', respects_robots_txt: true },
  { token: 'ClaudeBot', company: 'Anthropic', category: 'ai-training', respects_robots_txt: true },
  { token: 'Claude-User', company: 'Anthropic', category: 'ai-assistant', respects_robots_txt: true },
  { token: 'Claude-SearchBot', company: 'Anthropic', category: 'ai-search', respects_robots_txt: true },
  { token: 'Google-Extended', company: 'Google', category: 'ai-training', respects_robots_txt: true },
  { token: 'PerplexityBot', company: 'Perplexity', category: 'ai-search', respects_robots_txt: true },
  { token: 'Perplexity-User', company: 'Perplexity', category: 'ai-assistant', respects_robots_txt: false },
  { token: 'CCBot', company: 'Common Crawl', category: 'ai-training', respects_robots_txt: true },
  { token: 'Bytespider', company: 'ByteDance', category: 'ai-training', respects_robots_txt: false },
  { token: 'Meta-ExternalAgent', company: 'Meta', category: 'ai-training', respects_robots_txt: true },
  { token: 'Applebot-Extended', company: 'Apple', category: 'ai-training', respects_robots_txt: true },
  { token: 'Amazonbot', company: 'Amazon', category: 'ai-training', respects_robots_txt: true },
  { token: 'Diffbot', company: 'Diffbot', category: 'ai-training', respects_robots_txt: false },
];

// Minimal robots.txt parser. Groups directives under each User-agent
// block (case-insensitive token match), handling the classic gotcha that
// "Disallow:" with an EMPTY value means "disallow nothing" (i.e. allow
// everything), not "disallow everything".
function parseRobotsTxt(text) {
  const lines = text.split('\n').map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
  const groups = []; // [{ agents: ['gptbot'], rules: [{type, path}] }]
  let current = null;
  let justSawAgent = false;

  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const directive = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    if (directive === 'user-agent') {
      if (current && !justSawAgent) current = null; // new block starts
      if (!current) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      justSawAgent = true;
    } else if (directive === 'disallow' || directive === 'allow') {
      if (!current) continue;
      justSawAgent = false;
      current.rules.push({ type: directive, path: value });
    } else {
      justSawAgent = false;
    }
  }
  return groups;
}

// Finds the rule group(s) matching a bot token (exact agent match first,
// falling back to the "*" wildcard group), and determines allowed status.
// matched_rules is only populated for a bot-SPECIFIC match -- when a bot
// falls back to the wildcard group, its rules are surfaced once at the
// top level (wildcard_rules) instead of being repeated per bot, since
// most domains have no bot-specific overrides and repeating a long
// wildcard rule list for every single known bot bloats the response
// without adding information.
function checkBotAccess(groups, botToken) {
  const lowerToken = botToken.toLowerCase();
  let group = groups.find((g) => g.agents.includes(lowerToken));
  let matchedBy = 'specific';
  if (!group) {
    group = groups.find((g) => g.agents.includes('*'));
    matchedBy = 'wildcard';
  }
  if (!group || group.rules.length === 0) {
    return { allowed: true, matched_by: 'none (no rule found -- default allow)', matched_rules: [] };
  }

  const disallowRules = group.rules.filter((r) => r.type === 'disallow' && r.path !== '');
  const rootBlocked = disallowRules.some((r) => r.path === '/');
  const allowed = rootBlocked ? false : (disallowRules.length > 0 ? 'partial' : true);

  if (matchedBy === 'wildcard') {
    return { allowed, matched_by: matchedBy, matched_rules: null };
  }
  return {
    allowed,
    matched_by: matchedBy,
    matched_rules: group.rules.map((r) => `${r.type === 'disallow' ? 'Disallow' : 'Allow'}: ${r.path || '(empty)'}`),
  };
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
  const isTest = request.headers.get('X-Presend-Test') === '1';

  const allowed = await checkRateLimit(env, clientIP, 'aicrawlercheck', isTest);
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 20 requests per minute.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const { searchParams } = new URL(request.url);
  const domain = (searchParams.get('domain') || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

  if (!domain) {
    return new Response(JSON.stringify({
      usage: 'GET /api/ai-crawler-check?domain=example.com',
      note: 'Fetches robots.txt and reports which known AI crawlers (GPTBot, ClaudeBot, PerplexityBot, etc.) are allowed or blocked. Free, no signup required.',
    }, null, 2), { headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }
  if (!DOMAIN_RE.test(domain)) {
    return new Response(JSON.stringify({ error: 'Invalid domain format' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`https://${domain}/robots.txt`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PresendBot/1.0; +https://presend.pages.dev)' },
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return new Response(JSON.stringify({
        domain, robots_txt_found: false,
        note: `No robots.txt found (HTTP ${res.status}). All crawlers are implicitly allowed by default.`,
        bots: KNOWN_BOTS.map((b) => ({ ...b, allowed: true, matched_by: 'none (no robots.txt)', matched_rules: [] })),
      }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...corsHeaders() } });
    }

    const text = await res.text();
    const groups = parseRobotsTxt(text);

    const wildcardGroup = groups.find((g) => g.agents.includes('*'));
    const wildcardRules = wildcardGroup
      ? wildcardGroup.rules.map((r) => `${r.type === 'disallow' ? 'Disallow' : 'Allow'}: ${r.path || '(empty)'}`)
      : [];

    const bots = KNOWN_BOTS.map((b) => ({ ...b, ...checkBotAccess(groups, b.token) }));
    const summary = {
      blocked: bots.filter((b) => b.allowed === false).length,
      partial: bots.filter((b) => b.allowed === 'partial').length,
      allowed: bots.filter((b) => b.allowed === true).length,
    };

    return new Response(JSON.stringify({
      domain, robots_txt_found: true, summary,
      wildcard_rules: wildcardRules.length > 0 ? wildcardRules : null,
      wildcard_rules_note: wildcardRules.length > 0 ? 'Shown once here; any bot below with matched_by="wildcard" is governed by these rules (no bot-specific override).' : null,
      bots,
    }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...corsHeaders() },
    });
  } catch (e) {
    clearTimeout(timeout);
    return new Response(JSON.stringify({
      error: e.name === 'AbortError' ? 'Request timed out fetching robots.txt' : 'Could not fetch robots.txt',
      detail: e.message,
    }), { status: 502, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }
}
