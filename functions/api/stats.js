import { checkRateLimit } from '../_shared/rate-limit.js';



export async function onRequestGet(context) {
  const { env, request } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
  const allowed = await checkRateLimit(env, clientIP, 'stats', { limit: 60 });
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded.' }), {
      status: 429, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  try {
    const { keys } = await env.PRESEND_ANALYTICS.list({ prefix: "visits:" });
    const stats = {};
    let total = 0;
    
    for (const key of keys) {
      const value = await env.PRESEND_ANALYTICS.get(key.name);
      const parts = key.name.split(":");
      const tool = parts[1];
      const date = parts[2];
      // Seules les clés de la forme écrite par track.js (outil validé, date ISO) sont publiées.
      if (parts.length !== 3 || !/^[a-z0-9][a-z0-9-]{0,59}$/.test(tool) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      if (!Number.isFinite(parseInt(value))) continue;
      
      if (!stats[tool]) stats[tool] = {};
      stats[tool][date] = parseInt(value);
      total += parseInt(value);
    }
    
    return new Response(JSON.stringify({
      total,
      tools: stats,
      message: "Privacy-first analytics (no cookies, no IP)"
    }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}
