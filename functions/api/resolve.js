
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
  const allowed = await checkRateLimit(env, clientIP, 'resolve');
  if (!allowed) {
    return new Response('Rate limit exceeded', { status: 429 });
  }
  const url = new URL(request.url);
  const hash = url.searchParams.get('hash') || '';
  
  try {
    const value = await env.PRESEND_ANALYTICS.get('share:' + hash);
    if (!value) {
      return Response.redirect('https://presend.pages.dev/404.html', 302);
    }
    const data = JSON.parse(value);
    return Response.redirect('https://presend.pages.dev/tools/' + data.tool, 302);
  } catch (e) {
    return Response.redirect('https://presend.pages.dev/404.html', 302);
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
