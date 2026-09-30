// Faux positifs sur les paquets npm a fort impact (liste npm-high-impact de Titus Wormer, ~17 000 noms).
// Echoue si un paquet est signale sans figurer dans fixtures.json > reviewed_flagged_npm.
// Usage : node tests/typosquat/top-npm.mjs   (acces reseau requis ; installe npm-high-impact dans /tmp/nhi)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
const root = new URL('../../', import.meta.url);
const lib = '/tmp/nhi/node_modules/npm-high-impact/index.js';
if (!existsSync(lib)) execSync('mkdir -p /tmp/nhi && npm i -s --prefix /tmp/nhi npm-high-impact', { stdio: 'inherit' });
const m = await import(lib);
const names = m.npmHighImpact ?? m.default;
const tmp = `/tmp/typosquat-topnpm-${process.pid}.mjs`;
writeFileSync(tmp, readFileSync(new URL('functions/api/typosquat-check.js', root), 'utf8') + '\nexport { analyzeName };\n');
const { analyzeName } = await import(tmp);
const reviewed = new Set(JSON.parse(readFileSync(new URL('tests/typosquat/fixtures.json', root), 'utf8')).reviewed_flagged_npm);
const flagged = names.map((n, i) => ({ rank: i + 1, r: analyzeName(n.toLowerCase(), 'npm') })).filter((x) => x.r.suspicious);
const unexpected = flagged.filter((x) => !reviewed.has(x.r.package));
console.log(`${names.length} paquets npm a fort impact, ${flagged.length} signales dont ${flagged.length - unexpected.length} deja revus (signalement voulu).`);
for (const x of unexpected) console.log(`  A EXAMINER  #${x.rank}  ${x.r.package} -> ${x.r.similar_to.map((t) => `${t.name} (d=${t.distance})`).join(', ')}`);
console.log(unexpected.length === 0 ? 'Resultat : OK' : `Resultat : ${unexpected.length} faux positif(s) potentiel(s)`);
process.exit(unexpected.length === 0 ? 0 : 1);
