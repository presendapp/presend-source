
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
// GET /api/api-stats — lecture des compteurs d'usage par endpoint (agrégés par jour)

export async function onRequestGet(context) {
  const { env } = context;

  if (!env.PRESEND_ANALYTICS) {
    return new Response(JSON.stringify({
      total: null,
      endpoints: {},
      message: 'Usage tracking is not configured for this environment (no KV binding).',
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  try {
    const { keys } = await env.PRESEND_ANALYTICS.list({ prefix: 'api-visits:' });
    const stats = {};
    let total = 0;

    for (const key of keys) {
      const value = await env.PRESEND_ANALYTICS.get(key.name);
      const parts = key.name.split(':'); // api-visits:<endpoint>:<date>
      const endpoint = parts[1];
      const date = parts[2];
      const count = parseInt(value) || 0;

      if (!stats[endpoint]) stats[endpoint] = {};
      stats[endpoint][date] = count;
      total += count;
    }

    return new Response(JSON.stringify({
      total,
      endpoints: stats,
      message: 'Best-effort usage tracking, no cookies, no IP stored.',
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
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
