// Non-regression on real malware: every malicious package (OSV MAL-) that typosquat-check flagged on 3 Oct 2026
// must still be flagged. Offline, a few seconds. Fails (exit 1) and lists the names that are no longer flagged.
// Usage: node tests/typosquat/osv-malicious.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('../../', import.meta.url);
const tmp = `/tmp/typosquat-osv-${process.pid}.mjs`;
writeFileSync(tmp, readFileSync(new URL('functions/api/typosquat-check.js', root), 'utf8').replace(/from '\.\.\//g, "from '" + new URL('functions/', root).href) + '\nexport { analyzeName };\n');
const { analyzeName } = await import(tmp);
const F = JSON.parse(readFileSync(new URL('tests/typosquat/osv-malicious.json', root), 'utf8'));
let lost = 0;
for (const eco of ['PyPI', 'npm']) {
  const missed = F[eco].filter((n) => !analyzeName(n, eco).suspicious);
  lost += missed.length;
  console.log(`${eco}: ${F[eco].length - missed.length} of ${F[eco].length} real malicious names still flagged`);
  for (const n of missed) console.log(`  NO LONGER FLAGGED  ${n}`);
}
console.log(lost === 0 ? 'Resultat : OK' : `Resultat : ${lost} malware(s) no longer flagged`);
process.exit(lost === 0 ? 0 : 1);
