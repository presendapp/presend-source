// Faux positifs sur les paquets PyPI populaires (top 15 000, jeu de donnees de Hugo van Kemenade).
// Echoue si un paquet populaire est signale sans figurer dans fixtures.json > reviewed_flagged_PyPI.
// Le jeu de donnees change chaque mois : un echec peut aussi signaler un nouveau paquet a examiner.
// Usage : node tests/typosquat/top-pypi.mjs   (acces reseau requis)
import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('../../', import.meta.url);
const tmp = `/tmp/typosquat-top-${process.pid}.mjs`;
writeFileSync(tmp, readFileSync(new URL('functions/api/typosquat-check.js', root), 'utf8') + '\nexport { analyzeName };\n');
const { analyzeName } = await import(tmp);
const reviewed = new Set(JSON.parse(readFileSync(new URL('tests/typosquat/fixtures.json', root), 'utf8')).reviewed_flagged_PyPI);
const res = await fetch('https://hugovk.dev/top-pypi-packages/top-pypi-packages-30-days.min.json');
if (!res.ok) { console.error(`Telechargement impossible : HTTP ${res.status}`); process.exit(2); }
const rows = (await res.json()).rows;
const flagged = rows.map((r, i) => ({ rank: i + 1, r: analyzeName(r.project.toLowerCase(), 'PyPI') })).filter((x) => x.r.suspicious);
const unexpected = flagged.filter((x) => !reviewed.has(x.r.package));
console.log(`${rows.length} paquets PyPI populaires, ${flagged.length} signales dont ${flagged.length - unexpected.length} deja revus (signalement voulu).`);
for (const x of unexpected) console.log(`  A EXAMINER  #${x.rank}  ${x.r.package} -> ${x.r.similar_to.map((m) => `${m.name} (d=${m.distance})`).join(', ')}`);
const gone = [...reviewed].filter((n) => !flagged.some((x) => x.r.package === n));
if (gone.length) console.log(`  (revus mais plus signales ou plus dans le top : ${gone.join(', ')})`);
console.log(unexpected.length === 0 ? 'Resultat : OK' : `Resultat : ${unexpected.length} faux positif(s) potentiel(s)`);
process.exit(unexpected.length === 0 ? 0 : 1);
