// node tests/nextjs-check/detect.test.mjs  -- pure functions of /api/nextjs-check (no network).
import { isNextHtml, scriptUrls, findVersion, target, summarize } from '../../functions/api/nextjs-check.js';

let fail = 0;
function check(label, ok, detail) { if (!ok) fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : ' -> ' + detail}`); }

const html = `<html><head><script src="/_next/static/chunks/webpack-abc.js?dpl=dpl_1" async></script>
<link rel="preload" href="https://cdn.example.com/_next/static/chunks/main-app-9.js" as="script"></head>
<body><script>self.__next_f.push([1,"1:I[\\"7270\\",[\\"static/chunks/08ttfj81-47mu.js\\"]"])</script></body></html>`;
check('detects a Next.js page', isNextHtml(html), 'false');
check('ignores a plain page', !isNextHtml('<html><script src="/app.js"></script></html>'), 'true');
const urls = scriptUrls(html, 'https://site.test/');
check('script with ?dpl= query', urls.includes('https://site.test/_next/static/chunks/webpack-abc.js?dpl=dpl_1'), urls.join(' '));
check('script on asset CDN', urls.includes('https://cdn.example.com/_next/static/chunks/main-app-9.js'), urls.join(' '));
check('script named in RSC payload', urls.includes('https://site.test/_next/static/chunks/08ttfj81-47mu.js'), urls.join(' '));
check('main/webpack scripts first', /webpack|main-app/.test(urls[0]) && /webpack|main-app/.test(urls[1]), urls.join(' '));

check('app router 16 (window.next)', findVersion('a();window.next={version:"16.3.0",appDir:!0},b()') === '16.3.0', 'miss');
check('app router 15', findVersion('x.version="15.5.28";window.next={version:"15.5.28",appDir:!0}') === '15.5.28', 'miss');
check('pages router (mitt emitter)', findVersion('let H="13.5.6",X=(0,P.default)(),Y') === '13.5.6', 'miss');
check('no version in unrelated code', findVersion('var version="1.2.3";') === null, 'false positive');

check('target 14 -> major 16.4.6', target('14.2.35').kind === 'major' && target('14.2.35').version === '16.4.6', JSON.stringify(target('14.2.35')));
check('target 15 -> 15.5.29', target('15.5.9').version === '15.5.29', JSON.stringify(target('15.5.9')));
check('target 16 -> 16.4.6', target('16.1.6').version === '16.4.6', JSON.stringify(target('16.1.6')));

const s = summarize([
  { id: 'GHSA-low', database_specific: { severity: 'LOW' }, summary: 'l', affected: [] },
  { id: 'GHSA-2xp9-vwfh-vxw4', aliases: ['CVE-2026-1'], database_specific: { severity: 'CRITICAL' }, summary: 'rce',
    affected: [{ package: { name: 'next' }, ranges: [{ events: [{ introduced: '0' }, { fixed: '15.5.24' }] }, { events: [{ fixed: '16.3.3' }] }] }] },
  { id: 'PYSEC-1', aliases: ['GHSA-mod1'], database_specific: { severity: 'MODERATE' }, summary: 'm', affected: [] },
]);
check('counts by severity', s.total === 3 && s.counts.critical === 1 && s.counts.moderate === 1 && s.counts.low === 1, JSON.stringify(s.counts));
check('critical sorted first, with CVE and fixes', s.advisories[0].id === 'GHSA-2xp9-vwfh-vxw4' && s.advisories[0].cve === 'CVE-2026-1' && s.advisories[0].fixed.join() === '15.5.24,16.3.3', JSON.stringify(s.advisories[0]));
check('GHSA alias preferred over other ids', s.advisories.some((a) => a.id === 'GHSA-mod1'), JSON.stringify(s.advisories.map((a) => a.id)));
process.exit(fail ? 1 : 0);
