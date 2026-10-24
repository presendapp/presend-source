// node tests/mcp/get-sse.test.mjs  -- GET on the MCP endpoints (no network).
// A client asking for an SSE stream must get 405 (spec), not a 200 JSON body that makes it reconnect in a loop.
import * as full from '../../functions/mcp.js';
import * as deps from '../../functions/mcp-deps.js';

let fail = 0;
function check(label, ok, detail) { if (!ok) fail++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : ' -> ' + detail}`); }
for (const [name, mod] of [['/mcp', full], ['/mcp-deps', deps]]) {
  const sse = await mod.onRequestGet({ request: new Request('https://x/mcp', { headers: { Accept: 'text/event-stream' } }) });
  check(`${name} GET Accept: text/event-stream -> 405`, sse.status === 405 && sse.headers.get('Allow') === 'POST, OPTIONS', `${sse.status} ${sse.headers.get('Allow')}`);
  const both = await mod.onRequestGet({ request: new Request('https://x/mcp', { headers: { Accept: 'application/json, text/event-stream' } }) });
  check(`${name} GET Accept: application/json, text/event-stream -> 405`, both.status === 405, both.status);
  const page = await mod.onRequestGet({ request: new Request('https://x/mcp', { headers: { Accept: 'text/html' } }) });
  const j = await page.json();
  check(`${name} GET from a browser -> 200 description`, page.status === 200 && Array.isArray(j.tools), page.status);
  const bare = await mod.onRequestGet({ request: new Request('https://x/mcp') });
  check(`${name} GET without Accept -> 200`, bare.status === 200, bare.status);
}
process.exit(fail ? 1 : 0);
