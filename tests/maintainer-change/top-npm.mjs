// Bruit de maintainer-change-check sur les paquets npm les plus utilises (npm-high-impact).
// Chaque paquet est evalue a 9 dates (aujourd'hui puis chaque trimestre sur 2 ans) grace au
// parametre "now" d'analyzeNpm, puis les evenements passent par classifyEstablishedPublishers
// (recherche registre, etat ACTUEL des publieurs). Rejoue event-stream au 2018-11-26 : doit etre detecte.
// Usage : node tests/maintainer-change/top-npm.mjs [N=200]   (reseau ; cache dans /tmp/mcc-cache)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
const N = Number(process.argv[2] || 200);
const root = new URL('../../', import.meta.url);
const tmp = `/tmp/mcc-under-test-${process.pid}.mjs`;
writeFileSync(tmp, readFileSync(new URL('functions/api/maintainer-change-check.js', root), 'utf8') + '\nexport { analyzeNpm, classifyEstablishedPublishers };\n');
const { analyzeNpm, classifyEstablishedPublishers } = await import(tmp);
const lib = '/tmp/nhi/node_modules/npm-high-impact/index.js';
if (!existsSync(lib)) execSync('mkdir -p /tmp/nhi && npm i -s --prefix /tmp/nhi npm-high-impact', { stdio: 'inherit' });
const m = await import(lib);
const names = (m.npmHighImpact ?? m.default).slice(0, N);
const CACHE = '/tmp/mcc-cache'; mkdirSync(CACHE, { recursive: true });
async function doc(name) {
  const file = `${CACHE}/${encodeURIComponent(name)}.json`;
  if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  const res = await fetch(`https://registry.npmjs.org/${name.replace('/', '%2F')}`, { headers: { 'User-Agent': 'presend-tests/1.0' } });
  if (!res.ok) return null;
  const txt = await res.text(); writeFileSync(file, txt); return JSON.parse(txt);
}
let done = 0; const docs = new Map(); const queue = [...names];
await Promise.all(Array.from({ length: 6 }, async () => {
  while (queue.length) { const n = queue.shift(); try { docs.set(n, await doc(n)); } catch { docs.set(n, null); } if (++done % 50 === 0) process.stderr.write(`  ${done}/${names.length}\n`); }
}));
const DAY = 86400000, now = Date.now();
const dates = Array.from({ length: 9 }, (_, i) => now - i * 91 * DAY);
let evals = 0; const hits = new Map();
for (const n of names) {
  const d = docs.get(n); if (!d) continue;
  for (const t of dates) {
    const r = analyzeNpm(d, t); if (r.error) continue; evals++;
    for (const e of r.flagged_events) hits.set(`${n}@${e.version}`, { n, e });
  }
}
// L'API de recherche du registre limite le debit (~10 requetes) : pause initiale, puis 6,5 s entre appels.
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
process.stderr.write('  pause 60 s (quota de l API de recherche)\n'); await pause(60000);
const es = analyzeNpm(await doc('event-stream'), Date.parse('2018-11-26'));
const esc = await classifyEstablishedPublishers(es, 'event-stream');
console.log(`Rejeu event-stream au 2018-11-26 : ${esc.suspicious ? 'DETECTE' : 'RATE'} (${esc.flagged_events.map((e) => `${e.version} par ${e.publisher}`).join(', ')})`);
console.log(`${docs.size} paquets, ${evals} evaluations sur 9 dates, ${hits.size} evenements bruts :`);
const remaining = new Set();
for (const { n, e } of [...hits.values()].sort((a, b) => a.e.published.localeCompare(b.e.published))) {
  await pause(6500);
  const c = await classifyEstablishedPublishers({ flagged_events: [e] }, n);
  if (c.flagged_events[0]?.publisher_check === 'unavailable') console.log('    (recherche indisponible : HTTP 429 ?)');
  const est = c.established_publisher_events[0];
  if (!est) remaining.add(n);
  console.log(`  ${e.published}  ${n.padEnd(24)} ${e.previous_publisher} -> ${e.publisher.padEnd(13)} ${est ? `reclasse (${est.publisher_other_package.package}, ${est.publisher_other_package.weekly_downloads.toLocaleString('fr-FR')}/sem)` : 'RESTE SIGNALE'}`);
}
let today = 0;
for (const n of names) { const d = docs.get(n); if (!d) continue; const r = analyzeNpm(d, now); if (r.error || !r.suspicious) continue; await pause(6500); if ((await classifyEstablishedPublishers(r, n)).suspicious) today++; }
console.log(`\nPaquets signales sur 2 ans : ${new Set([...hits.values()].map((h) => h.n)).size} -> ${remaining.size} apres reclassement. Signales aujourd'hui : ${today}/${docs.size}.`);
process.exit(esc.suspicious ? 0 : 1);
