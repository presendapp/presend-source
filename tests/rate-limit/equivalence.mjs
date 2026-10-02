// Test d'equivalence du refactor checkRateLimit (2 oct. 2026) : 53 copies locales -> functions/_shared/rate-limit.js.
// Pour chaque site d'appel, compare l'ancienne fonction + l'ancien appel (lus dans git a la reference donnee)
// au nouveau module + nouvel appel : memes resultats ET meme journal KV (get/put), operation par operation,
// avec la meme suite pseudo-aleatoire et une horloge figee. Hors ligne.
// Usage : node tests/rate-limit/equivalence.mjs <ref-git-avant-refactor>   (defaut : HEAD)
// Preuve du commit e98e326c. Ne s'applique plus apres la suppression volontaire du comptage api-visits
// (commit suivant, 2 oct.) : pour la rejouer, se placer sur e98e326c et lancer avec la reference e98e326c^.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const REF = process.argv[2] || 'HEAD';
const modSrc = readFileSync('functions/_shared/rate-limit.js', 'utf8');
const { checkRateLimit: newCheck } = await import('data:text/javascript,' + encodeURIComponent(modSrc));

function seeded(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
let rnd = seeded(1);
Math.random = () => rnd();
const FIXED = Date.UTC(2026, 9, 2, 12, 0, 30);
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...a) { super(...(a.length ? a : [FIXED])); }
  static now() { return FIXED; }
};

function findCalls(text) {
  const out = []; let i = 0;
  for (;;) {
    const j = text.indexOf('checkRateLimit(', i);
    if (j < 0) return out;
    if (text.slice(Math.max(0, j - 9), j) === 'function ') { i = j + 1; continue; }
    let k = j + 'checkRateLimit('.length, depth = 1, quote = null;
    while (depth) {
      const ch = text[k];
      if (quote) { if (ch === quote) quote = null; }
      else if ("'\"`".includes(ch)) quote = ch;
      else if (ch === '(') depth++;
      else if (ch === ')') depth--;
      k++;
    }
    out.push(text.slice(j, k)); i = k;
  }
}

function makeKV(mode, log) {
  const store = new Map();
  return {
    async get(k) { log.push(['get', k]); if (mode === 'get-fail') throw new Error('kv'); return store.has(k) ? store.get(k) : null; },
    async put(k, v, o) { log.push(['put', k, v, JSON.stringify(o || null)]); if (mode === 'put-fail') throw new Error('kv'); store.set(k, v); },
  };
}

async function run(fn, callText, sc) {
  const log = [], results = [];
  rnd = seeded(sc.seed);
  const env = sc.mode === 'no-kv' ? {} : { PRESEND_ANALYTICS: makeKV(sc.mode, log) };
  const request = { headers: { get: (h) => (h === 'X-Presend-Test' && sc.test ? '1' : null) } };
  const call = new Function('checkRateLimit', 'env', 'clientIP', 'request', 'isTest', 'return ' + callText + ';');
  for (let n = 0; n < 150; n++) {
    try { results.push(await call(fn, env, '203.0.113.7', request, sc.test)); }
    catch (e) { results.push('THROW:' + e.message); }
  }
  return JSON.stringify({ results, log });
}

const SCENARIOS = [];
for (const seed of [1, 2, 3, 42, 1234]) for (const test of [false, true]) SCENARIOS.push({ seed, test, mode: 'ok' });
for (const mode of ['get-fail', 'put-fail', 'no-kv']) SCENARIOS.push({ seed: 7, test: false, mode });

const files = execFileSync('git', ['diff', '--name-only', REF, '--', 'functions/api/'], { encoding: 'utf8' })
  .trim().split('\n').filter(Boolean);
let sites = 0, runs = 0, fail = 0, firstPair = null;
for (const f of files) {
  let oldText;
  try { oldText = execFileSync('git', ['show', REF + ':' + f], { encoding: 'utf8' }); } catch { continue; }
  const def = oldText.match(/(export\s+)?async function checkRateLimit\([\s\S]*?\n\}\n/);
  if (!def) continue;
  const oldFn = new Function(def[0].replace(/^export\s+/, '') + '\nreturn checkRateLimit;')();
  const oldCalls = findCalls(oldText.replace(def[0], ''));
  const newText = readFileSync(f, 'utf8');
  const newCalls = findCalls(newText);
  if (oldCalls.length !== newCalls.length) { console.log('NOMBRE D APPELS DIFFERENT', f, oldCalls.length, newCalls.length); fail++; continue; }
  if (oldCalls.length === 0) { console.log('(definition morte, aucun appel)', f); continue; }
  for (let c = 0; c < oldCalls.length; c++) {
    sites++;
    if (!firstPair) firstPair = [f, oldFn, oldCalls[c], newCalls[c]];
    for (const sc of SCENARIOS) {
      runs++;
      const a = await run(oldFn, oldCalls[c], sc), b = await run(newCheck, newCalls[c], sc);
      if (a !== b) {
        fail++;
        console.log('DIVERGENCE', f, '| appel', c, '|', JSON.stringify(sc));
        console.log('   ancien :', oldCalls[c]); console.log('   nouveau:', newCalls[c]);
        break;
      }
    }
  }
}
console.log('sites compares :', sites, '| executions :', runs, '| divergences :', fail);

// Contre-epreuve : un seuil faux (+1) doit etre detecte, sinon le test ne prouve rien.
const [cf, cOld, cOldCall, cNewCall] = firstPair;
const broken = cNewCall.replace(/limit: (\d+)/, (_, n) => 'limit: ' + (Number(n) + 1));
const ca = await run(cOld, cOldCall, SCENARIOS[0]), cb = await run(newCheck, broken, SCENARIOS[0]);
const detected = ca !== cb;
console.log('contre-epreuve (seuil +1 sur ' + cf + ') :', detected ? 'DETECTEE' : 'NON DETECTEE, TEST INVALIDE');
process.exit(fail === 0 && sites > 0 && detected ? 0 : 1);
