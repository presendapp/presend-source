// Age des paquets populaires (bruit du futur signal « paquet neuf »), sur les VRAIES donnees des registres
// et la VRAIE fonction (functions/_shared/package-age.js). Echantillon aleatoire reproductible (graine fixe).
// Usage : node tests/package-age/measure.mjs [N par liste, defaut 1000]   (reseau requis ; npm installe dans /tmp/nhi)
import { existsSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { firstPublished, ageInDays } from '../../functions/_shared/package-age.js';

const N = Number(process.argv[2] || 1000);
const UA = { 'User-Agent': 'presend-measure/1 (+https://github.com/presendapp/presend-source)' };
const now = Date.now();

function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function sample(list, n, seed) { const a = [...list], r = rng(seed); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); }

async function pool(items, size, fn) {
  const out = []; let i = 0, done = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); if (++done % 100 === 0) process.stderr.write(`  ${done}/${items.length}\n`); }
  }));
  return out;
}

async function measure(eco, names, urlOf) {
  const res = await pool(names, 8, async (name) => {
    try {
      const r = await fetch(urlOf(name), { headers: UA, signal: AbortSignal.timeout(30000) });
      if (!r.ok) return { name, error: `HTTP ${r.status}` };
      const iso = firstPublished(eco, await r.json());
      return { name, first: iso, days: ageInDays(iso, now) };
    } catch (e) { return { name, error: e.name }; }
  });
  const ok = res.filter((x) => !x.error && x.days !== null);
  const count = (d) => ok.filter((x) => x.days < d).length;
  console.log(`\n=== ${eco} : ${names.length} paquets, ${ok.length} dates lues, ${res.filter((x) => x.error).length} erreurs, ${res.filter((x) => !x.error && x.days === null).length} sans date ===`);
  console.log(`  < 7 j : ${count(7)} | < 30 j : ${count(30)} | < 90 j : ${count(90)} | < 365 j : ${count(365)}`);
  for (const x of ok.filter((x) => x.days < 90).sort((a, b) => a.days - b.days)) console.log(`  ${x.days} j  ${x.first.slice(0, 10)}  ${x.name}`);
  for (const x of res.filter((x) => x.error).slice(0, 10)) console.log(`  ERREUR ${x.error}  ${x.name}`);
  writeFileSync(`/tmp/package-age-${eco}.json`, JSON.stringify(res, null, 1));
  return res;
}

const show = (res, name) => { const x = res.find((r) => r.name === name); console.log(`  temoin ${name} : ${x ? (x.error || `${x.first && x.first.slice(0, 10)} (${x.days} j)`) : 'absent'}`); };

// PyPI : top 15 000 (meme source que tests/typosquat/top-pypi.mjs)
const top = await (await fetch('https://hugovk.dev/top-pypi-packages/top-pypi-packages-30-days.min.json', { headers: UA })).json();
const pypiAll = (top.rows || top).map((r) => r.project);
const pypiNames = [...new Set(['tmol', 'requests', ...sample(pypiAll, N, 42)])];
const pypi = await measure('pypi', pypiNames, (n) => `https://pypi.org/pypi/${encodeURIComponent(n)}/json`);
show(pypi, 'tmol'); show(pypi, 'requests');

// npm : npm-high-impact (meme source que tests/typosquat/top-npm.mjs)
const lib = '/tmp/nhi/node_modules/npm-high-impact/index.js';
if (!existsSync(lib)) execSync('mkdir -p /tmp/nhi && npm i -s --prefix /tmp/nhi npm-high-impact', { stdio: 'inherit' });
const m = await import(lib);
const npmAll = m.npmHighImpact || m.default;
const npmNames = [...new Set(['express', ...sample(npmAll, N, 42)])];
const npm = await measure('npm', npmNames, (n) => `https://registry.npmjs.org/${n.startsWith('@') ? '@' + encodeURIComponent(n.slice(1)) : encodeURIComponent(n)}`);
show(npm, 'express');
console.log(`\nListes : PyPI ${pypiAll.length}, npm ${npmAll.length}. Details : /tmp/package-age-pypi.json, /tmp/package-age-npm.json`);
