
async function checkRateLimit(env, clientIP, bucket) {
  if (!env.PRESEND_ANALYTICS) return true;
  try {
    const now = Math.floor(Date.now() / 60000);
    const rateKey = `rate:${bucket}:${clientIP}:${now}`;
    let count = await env.PRESEND_ANALYTICS.get(rateKey);
    count = count ? parseInt(count) : 0;
    if (count >= 60) return false;
    // Écriture échantillonnée (1 sur 5) pour économiser le quota KV --
    // légèrement moins précis en rafale, mais protège toujours contre un abus soutenu.
    if (Math.random() < 1 / 5) {
      await env.PRESEND_ANALYTICS.put(rateKey, (count + 5).toString(), { expirationTtl: 120 });
    }
  } catch (e) {
    // KV en panne ou quota dépassé -- ne doit jamais faire planter la requête.
    return true;
  }
  return true;
}
export async function onRequestGet(context) {
  const { env, request } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
  const allowed = await checkRateLimit(env, clientIP, 'stats');
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
