// node tests/nextjs-check/endpoint.test.mjs  -- /api/nextjs-check end to end, with fetch mocked (no network).
import { onRequestGet } from '../../functions/api/nextjs-check.js';

let fail = 0;
function check(label, ok, detail) { if (!ok) fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : ' -> ' + detail}`); }

const seen = [];
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  seen.push(url);
  const u = new URL(url);
  if (u.hostname === 'cloudflare-dns.com') {
    const name = u.searchParams.get('name'); const type = u.searchParams.get('type');
    const ip = name === 'internal.test' ? '10.0.0.5' : '93.184.216.34';
    return new Response(JSON.stringify({ Answer: type === 'A' ? [{ type: 1, data: ip }] : [] }));
  }
  if (u.hostname === 'api.osv.dev') {
    const body = JSON.parse(init.body);
    const vulns = body.version === '14.2.35' ? [{ id: 'GHSA-2xp9-vwfh-vxw4', database_specific: { severity: 'CRITICAL' }, summary: 'rce',
      affected: [{ package: { name: 'next' }, ranges: [{ events: [{ fixed: '15.5.24' }] }] }] }] : [];
    return new Response(JSON.stringify(vulns.length ? { vulns } : {}));
  }
  if (u.hostname === 'old.test' && u.pathname === '/') return new Response('<script src="/_next/static/chunks/main-1.js"></script>', { status: 200 });
  if (u.hostname === 'old.test' && u.pathname.endsWith('main-1.js')) return new Response('let H="14.2.35",X=(0,P.default)()');
  if (u.hostname === 'plain.test') return new Response('<html><script src="/app.js"></script></html>');
  if (u.hostname === 'redir.test') return new Response(null, { status: 301, headers: { Location: 'http://internal.test/' } });
  return new Response('not found', { status: 404 });
};

const call = async (q) => {
  const r = await onRequestGet({ request: new Request('https://presend.pages.dev/api/nextjs-check?url=' + encodeURIComponent(q), { headers: { 'CF-Connecting-IP': '1.2.3.4' } }), env: {} });
  return [r.status, await r.json()];
};

let [st, j] = await call('https://old.test/');
check('old Next.js site: version and advisories', st === 200 && j.version === '14.2.35' && j.counts.critical === 1 && j.recommended.kind === 'major', st + ' ' + JSON.stringify(j));
[st, j] = await call('old.test');
check('address without https:// is accepted', st === 200 && j.version === '14.2.35', st + ' ' + JSON.stringify(j));
[st, j] = await call('https://plain.test/');
check('non-Next.js site', st === 200 && j.nextjs === false, st + ' ' + JSON.stringify(j));
[st, j] = await call('http://127.0.0.1/');
check('loopback refused', st === 400, st);
[st, j] = await call('http://internal.test/');
check('private IP refused', st === 400, st);
const before = seen.filter((s) => s.startsWith('http://internal.test')).length;
[st, j] = await call('https://redir.test/');
check('redirect to private IP not followed', st === 502 && seen.filter((s) => s.startsWith('http://internal.test')).length === before, st + ' ' + JSON.stringify(j));
[st, j] = await call('file:///etc/passwd');
check('file: URL refused', st === 400, st);
process.exit(fail ? 1 : 0);
