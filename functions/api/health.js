export async function onRequest(context) {
  return new Response(JSON.stringify({
    status: "ok",
    project: "presend",
    timestamp: new Date().toISOString(),
    message: "Cloudflare Pages Functions is active!"
  }), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
