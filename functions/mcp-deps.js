// Focused MCP server: only the dependency checks an agent needs before installing a package.
// Same tools, same code path and same rate limits as /mcp (handleRequest from mcp.js), with 5 tools instead of 40.
import { TOOLS, PROTOCOL_VERSION, corsHeaders, jsonRpcError, handleRequest } from './mcp.js';

const DEPS = ['supply_chain_check', 'typosquat_check', 'maintainer_change_check', 'vulnerability_check', 'repo_health_check'];
const DEPS_TOOLS = TOOLS.filter((t) => DEPS.includes(t.name));

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestGet() {
  return new Response(JSON.stringify({
    name: 'Presend dependency checks (MCP)',
    description: 'Check an npm or PyPI package before an AI agent installs it: typosquats, names that do not exist, new packages, publisher changes (npm), known vulnerabilities of the version, repository health.',
    protocol: 'Model Context Protocol (Streamable HTTP)',
    protocolVersion: PROTOCOL_VERSION,
    tool_count: DEPS_TOOLS.length,
    tools: DEPS_TOOLS.map((t) => t.name),
    full_server: 'https://presend.pages.dev/mcp',
    usage: 'POST JSON-RPC 2.0 requests to this same URL.',
  }, null, 2), { headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
}

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.json();
  } catch (e) {
    return new Response(JSON.stringify(jsonRpcError(null, -32700, 'Parse error')), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
  const result = await handleRequest(body, context, DEPS_TOOLS, 'presend-deps', '1.0.0');
  if (result === null) return new Response(null, { status: 202, headers: corsHeaders() });
  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
}
