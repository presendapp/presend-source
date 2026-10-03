// Share of real malicious packages (OSV MAL-, withdrawn excluded) that Presend's typosquat check flags.
// Usage, from this directory after extract.py: node measure.mjs [DATA_DIR]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const root = new URL('../../', import.meta.url);
const dir = process.argv[2] || '.';
const tmp = `/tmp/typosquat-mal-${process.pid}.mjs`;
writeFileSync(tmp, readFileSync(new URL('functions/api/typosquat-check.js', root), 'utf8').replace(/from '\.\.\//g, "from '" + new URL('functions/', root).href) + '\nexport { analyzeName };\n');
const { analyzeName } = await import(tmp);
const out = {};
for (const [eco, file] of [['PyPI', 'mal_pypi.json'], ['npm', 'mal_npm.json']]) {
  const groups = {};
  for (const [name, v] of Object.entries(JSON.parse(readFileSync(join(dir, file), 'utf8')))) {
    if (v.withdrawn) continue;
    const g = eco === 'npm' ? (v.published.startsWith('2025') ? 'npm, published in 2025' : 'npm, other years') : 'PyPI';
    (groups[g] ||= []).push(name);
  }
  for (const [g, names] of Object.entries(groups)) {
    const flagged = names.filter((n) => analyzeName(eco === 'PyPI' ? n.toLowerCase() : n, eco).suspicious);
    out[g] = { total: names.length, flagged: flagged.length, percent: +(100 * flagged.length / names.length).toFixed(1) };
    console.log(`${g}: ${flagged.length} of ${names.length} flagged (${out[g].percent}%)`);
  }
}
writeFileSync(join(dir, 'results.json'), JSON.stringify({ date: new Date().toISOString().slice(0, 10), ...out }, null, 1));
