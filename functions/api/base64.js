import { checkRateLimit } from '../_shared/rate-limit.js';

// GET /api/base64?action=encode&text=hello  ou  ?action=decode&text=aGVsbG8=

function corsHeaders(extra = {}) {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', ...extra };
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

  const allowed = await checkRateLimit(env, clientIP, 'base64', { limit: 60, isTest: request.headers.get('X-Presend-Test') === '1', trackVisits: true });
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 60 requests per minute.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'encode';
  const text = searchParams.get('text');

  if (!text) {
    return new Response(JSON.stringify({
      usage: 'GET /api/base64?action=encode|decode&text=...',
      example: 'https://presend.pages.dev/api/base64?action=encode&text=hello',
    }, null, 2), { headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }
  if (text.length > 10000) {
    return new Response(JSON.stringify({ error: 'Text too long (max 10000 chars). Use the browser tool for larger inputs.' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  try {
    let result;
    if (action === 'decode') {
      result = new TextDecoder().decode(Uint8Array.from(atob(text), c => c.charCodeAt(0)));
    } else {
      result = btoa(new TextEncoder().encode(text).reduce((s, b) => s + String.fromCharCode(b), ''));
    }
    return new Response(JSON.stringify({ action, input: text, result }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders() },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid input for ' + action, detail: e.message }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
}
