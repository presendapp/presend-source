// Calls another API endpoint in-process, as the original caller (same CF-Connecting-IP).
// A fetch to our own origin leaves from our Worker: every caller would share one rate-limit
// bucket (the Cloudflare egress IP), and the call would be counted again in api_usage
// without a User-Agent. The headers are built here, server-side, so they cannot be spoofed.
export function callInternal(handler, { url, method = "GET", body = null, clientIP, userAgent, env, waitUntil }) {
  const headers = new Headers();
  headers.set("CF-Connecting-IP", clientIP || "unknown");
  if (userAgent) headers.set("User-Agent", userAgent);
  if (body !== null) headers.set("Content-Type", "application/json");
  const request = new Request(url, { method, headers, body });
  return handler({
    request, env, params: {}, data: {},
    waitUntil: waitUntil || (() => {}),
    next: async () => new Response(null, { status: 404 }),
  });
}
