#!/usr/bin/env node
// Check the npm / PyPI packages an MCP configuration launches, before launching them.
// Usage: node mcp-preflight.mjs path/to/mcp.json        (Claude Desktop, Cursor, .mcp.json format)
// Exit code: 0 = nothing to block, 1 = a package to block (not found), 2 = review recommended.
// "incomplete" means a sub-check (e.g. OSV) could not be reached: treat it as you see fit.
// Deprecated (npm) and yanked (PyPI) versions are flagged too. Not covered: malware (this is not a malware scanner).
// No dependencies (Node 18+). Uses Presend's free API: https://presend.pages.dev/api (10 checks per minute).
import { readFileSync } from 'node:fs';

const API = process.env.PRESEND_API || 'https://presend.pages.dev';

// Returns { ecosystem, name, version } for an npx / bunx / uvx server, or null.
export function packageOf(server) {
  const cmd = (server.command || '').split('/').pop();
  const args = [...(server.args || [])];
  let eco;
  if (cmd === 'npx' || cmd === 'bunx') eco = 'npm';
  else if (cmd === 'uvx') eco = 'pypi';
  else return null;
  let name = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '-p' || a === '--package' || a === '--from') { name = args[i + 1]; break; }  // explicit package wins
    if (a.startsWith('--package=') || a.startsWith('--from=')) { name = a.split('=')[1]; break; }
    if (a.startsWith('-')) continue;                    // -y, --yes, --quiet...
    if (name === null) name = a;                       // first positional argument
  }
  if (!name || /^(git\+|https?:|file:|\.|\/)/.test(name)) return null;  // URLs and paths are not registry names
  let version = null;
  if (eco === 'npm') {
    const at = name.lastIndexOf('@');
    if (at > 0) { version = name.slice(at + 1); name = name.slice(0, at); }
  } else {
    const m = name.match(/^([A-Za-z0-9._-]+)(?:\[[^\]]*\])?(?:==([^,;]+))?/);
    if (m) { name = m[1]; version = m[2] || null; }
  }
  if (version === 'latest') version = null;
  return { ecosystem: eco, name, version };
}

export async function check(pkg) {
  const q = new URLSearchParams({ ecosystem: pkg.ecosystem, package: pkg.name });
  if (pkg.version) q.set('version', pkg.version);
  const r = await fetch(`${API}/api/supply-chain-check?${q}`);
  if (!r.ok) return { overall_risk: 'unavailable', http_status: r.status };
  return r.json();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node mcp-preflight.mjs mcp.json'); process.exit(64); }
  const config = JSON.parse(readFileSync(file, 'utf8'));
  const servers = config.mcpServers || config.servers || {};
  let block = false, review = false;
  for (const [id, server] of Object.entries(servers)) {
    const pkg = packageOf(server);
    if (!pkg) { console.log(`${id}: not an npx/uvx package, skipped`); continue; }
    const res = await check(pkg);
    const risk = res.overall_risk;
    const why = [res.registry_note, res.age_note, ...(res.flags || []),
      ...(res.unavailable_checks || []).map((c) => `${c} unavailable`)].filter(Boolean).join(' | ');
    console.log(`${id}: ${pkg.ecosystem} ${pkg.name}${pkg.version ? '@' + pkg.version : ''} -> ${risk}${why ? ' (' + why + ')' : ''}`);
    if (risk === 'package_not_found') block = true;
    else if (risk === 'review_recommended') review = true;
  }
  process.exit(block ? 1 : review ? 2 : 0);
}
