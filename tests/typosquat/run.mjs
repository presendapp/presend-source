// Jeu de test typosquat-check (reconstruit le 26 sept. 2026, lecon n°8 de PROJECT_CONTEXT.md).
// Usage : node tests/typosquat/run.mjs   -- code de sortie 1 si faux positif ou typosquat rate.
import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('../../', import.meta.url);
const src = readFileSync(new URL('functions/api/typosquat-check.js', root), 'utf8');
const tmp = `/tmp/typosquat-under-test-${process.pid}.mjs`;
writeFileSync(tmp, src + '\nexport { analyzeName, POPULAR };\n');
const { analyzeName, POPULAR } = await import(tmp);
const fx = JSON.parse(readFileSync(new URL('tests/typosquat/fixtures.json', import.meta.url.replace('run.mjs', '../../')), 'utf8'));
let failures = 0;
for (const eco of ['npm', 'PyPI']) {
  const list = POPULAR[eco];
  const dups = list.filter((n, i) => list.indexOf(n) !== i);
  console.log(`\n== ${eco} : ${list.length} noms dans la liste${dups.length ? ` (doublons : ${dups.join(', ')})` : ''}`);
  const legit = fx.legit[eco];
  const fp = legit.map((n) => analyzeName(n, eco)).filter((r) => r.suspicious);
  console.log(`  Legitimes : ${legit.length}, faux positifs : ${fp.length}`);
  for (const r of fp) console.log(`    FP  ${r.package} -> ${r.similar_to.map((m) => `${m.name} (d=${m.distance})`).join(', ')}`);
  const ts = Object.entries(fx.typosquats[eco]);
  const missed = ts.filter(([n, target]) => { const r = analyzeName(n, eco); return !r.suspicious || !r.similar_to.some((m) => m.name === target); });
  console.log(`  Typosquats : ${ts.length}, detectes : ${ts.length - missed.length}`);
  for (const [n, target] of missed) console.log(`    RATE  ${n} (cible ${target}${list.includes(target) ? '' : ', absente de la liste'})`);
  failures += fp.length + missed.length;
}
console.log('\n== Variantes de normalisation PyPI (PEP 503 : meme paquet, ne doivent PAS etre signalees) :');
for (const n of fx.normalization_variants_PyPI) { const r = analyzeName(n.toLowerCase(), 'PyPI'); if (r.suspicious) failures++; console.log(`  ${r.suspicious ? 'SIGNALE' : 'ok     '} ${n}${r.suspicious ? ' -> ' + r.similar_to.map((m) => m.name).join(', ') : ''}`); }
console.log(`\nResultat : ${failures === 0 ? 'OK' : failures + ' echec(s)'}`);
process.exit(failures === 0 ? 0 : 1);
