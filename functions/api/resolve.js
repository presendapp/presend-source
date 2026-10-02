import { checkRateLimit } from '../_shared/rate-limit.js';



export async function onRequestGet(context) {
  const { env, request } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
  const allowed = await checkRateLimit(env, clientIP, 'resolve', { limit: 60 });
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
