import { checkRateLimit } from '../_shared/rate-limit.js';

const MAX_DATA_LENGTH = 5000;

export async function onRequestPost(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

  const allowed = await checkRateLimit(env, clientIP, 'share', { limit: 10 });
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 10 shares per minute.' }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  try {
    const body = await request.json();
    const tool = String(body.tool || 'home').slice(0, 100);
    const data = ""; // body.data is ignored: no page sends it, and storing arbitrary content for 30 days would only consume the shared KV write quota (lesson 10).

    if (data.length > MAX_DATA_LENGTH) {
      return new Response(JSON.stringify({ error: `Data too long (max ${MAX_DATA_LENGTH} chars)` }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    const hash = Array.from(crypto.getRandomValues(new Uint8Array(6)))
      .map(b => b.toString(36).padStart(2, '0'))
      .join('')
      .slice(0, 8);

    const key = `share:${hash}`;
    const value = JSON.stringify({ tool, data, created: Date.now() });

    await env.PRESEND_ANALYTICS.put(key, value, { expirationTtl: 2592000 });

    return new Response(JSON.stringify({
      success: true,
      hash,
      shortUrl: `https://presend.pages.dev/s/${hash}`,
      message: "Share link created!"
    }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
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
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}
