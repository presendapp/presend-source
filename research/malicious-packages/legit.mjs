// Out-of-sample false positives: Presend's typosquat check on PyPI packages ranked 15,001-30,000 by last month's
// downloads (ClickHouse pypi.pypi_downloads_per_month), ranks never used to tune the check. Usage: node legit.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('../../', import.meta.url);
const tmp = `/tmp/typosquat-legit-${process.pid}.mjs`;
writeFileSync(tmp, readFileSync(new URL('functions/api/typosquat-check.js', root), 'utf8').replace(/from '\.\.\//g, "from '" + new URL('functions/', root).href) + '\nexport { analyzeName };\n');
const { analyzeName } = await import(tmp);
const d = new Date(Date.now() - 32 * 86400000); const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
const base = `SELECT SUM(count) AS download_count, project FROM pypi.pypi_downloads_per_month WHERE month = '${month}' GROUP BY project ORDER BY download_count DESC, project `;
const ranked = [];
for (let off = 0; off < 30000; off += 5000) {
  const r = await fetch('https://sql-clickhouse.clickhouse.com/?user=demo&default_format=JSON', { method: 'POST', body: base + `LIMIT 5000 OFFSET ${off}`, headers: { 'User-Agent': 'presend-measure' } });
  if (!r.ok) { console.error(`ClickHouse HTTP ${r.status}`); process.exit(2); }
  ranked.push(...(await r.json()).data.map((x) => x.project.toLowerCase().replace(/[-_.]+/g, '-')));
}
const c = ranked.slice(15000, 30000);
const flagged = c.filter((n) => analyzeName(n, 'PyPI').suspicious);
console.log(`PyPI ranks 15,001-30,000 (${month}): ${flagged.length} of ${c.length} flagged (${(100 * flagged.length / c.length).toFixed(1)}%)`);
writeFileSync('legit_flagged.json', JSON.stringify({ month, flagged }, null, 1));
