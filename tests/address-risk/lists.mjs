// Fails if the OFAC list source publishes a per-asset list that address-risk does not search
// (possible false negatives), or if ALL_LISTS names a list that no longer exists (every
// negative lookup would then fail closed with 502).
// Run: node tests/address-risk/lists.mjs   (network)
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../../functions/api/address-risk.js', import.meta.url), 'utf8');
const m = src.match(/const ALL_LISTS = \[([^\]]*)\]/);
if (!m) { console.error('ALL_LISTS introuvable'); process.exit(2); }
const ours = new Set([...m[1].matchAll(/'([A-Z0-9]+)'/g)].map((x) => x[1]));

const res = await fetch('https://api.github.com/repos/0xB10C/ofac-sanctioned-digital-currency-addresses/contents?ref=lists', {
  headers: { 'User-Agent': 'presend-tests' },
});
if (!res.ok) { console.error('GitHub API: HTTP', res.status); process.exit(2); }
const theirs = new Set((await res.json())
  .map((f) => (f.name.match(/^sanctioned_addresses_([A-Z0-9]+)\.txt$/) || [])[1])
  .filter(Boolean));

const missing = [...theirs].filter((t) => !ours.has(t));
const gone = [...ours].filter((t) => !theirs.has(t));
console.log(`source: ${theirs.size} listes | address-risk: ${ours.size} listes`);
if (missing.length) console.log('PUBLIEES MAIS NON CHERCHEES (faux negatifs possibles):', missing.join(', '));
if (gone.length) console.log('DANS ALL_LISTS MAIS PLUS PUBLIEES (chaque negatif renverrait 502):', gone.join(', '));
if (!missing.length && !gone.length) console.log('OK');
process.exit(missing.length || gone.length ? 1 : 0);
