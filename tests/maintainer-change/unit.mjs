// Tests hors ligne d'analyzeNpm sur des historiques synthetiques. Usage : node tests/maintainer-change/unit.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('../../', import.meta.url);
const tmp = `/tmp/mcc-unit-${process.pid}.mjs`;
writeFileSync(tmp, readFileSync(new URL('functions/api/maintainer-change-check.js', root), 'utf8') + '\nexport { analyzeNpm };\n');
const { analyzeNpm } = await import(tmp);
const DAY = 86400000, now = Date.parse('2026-09-26');
function doc(newPublisher, { trusted = false, version = '2.0.0' } = {}) {
  const t0 = now - 900 * DAY, t1 = now - 800 * DAY, t2 = now - 400 * DAY + 400 * DAY - 30 * DAY;
  const user = { name: newPublisher, email: 'x@example.com', ...(trusted ? { trustedPublisher: { id: 'github', oidcConfigId: 'oidc:test' } } : {}) };
  return { name: 'pkg', maintainers: [{ name: 'alice' }],
    time: { created: new Date(t0).toISOString(), '1.0.0': new Date(t0).toISOString(), '1.1.0': new Date(t1).toISOString(), [version]: new Date(t2).toISOString() },
    versions: { '1.0.0': { _npmUser: { name: 'alice' } }, '1.1.0': { _npmUser: { name: 'alice' } }, [version]: { _npmUser: user } } };
}
const cases = [
  ['nom de bot SANS trusted publishing -> signale', doc('foo-release'), (r) => r.suspicious === true && r.ci_publisher_events.length === 0],
  ['trusted publishing -> evenement CI, non signale', doc('GitHub Actions', { trusted: true }), (r) => r.suspicious === false && r.ci_publisher_events[0]?.trusted_publisher === 'github'],
  ['humain inconnu apres dormance -> signale', doc('mallory'), (r) => r.suspicious === true],
  ['pre-version -> non signale', doc('mallory', { version: '2.0.0-beta.1' }), (r) => r.suspicious === false && r.prerelease_events.length === 1],
];
let fail = 0;
for (const [label, d, ok] of cases) { const r = analyzeNpm(d, now); const pass = ok(r); fail += !pass; console.log(`${pass ? 'OK   ' : 'ECHEC'} ${label}`); }
process.exit(fail ? 1 : 0);
