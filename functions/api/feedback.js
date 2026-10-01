const JSON_HEADERS = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };
const TOOL_RE = /^[a-z0-9][a-z0-9-]{0,59}$/; // same rule as track (lesson 53)

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: JSON_HEADERS });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  try {
    const tool = typeof body.tool === "string" && TOOL_RE.test(body.tool) ? body.tool : "general";
    const message = typeof body.message === "string" ? body.message : "";
    const turnstileToken = typeof body.turnstileToken === "string" ? body.turnstileToken : "";

    if (!turnstileToken) return json({ error: "Turnstile token missing" }, 400);

    const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `secret=${encodeURIComponent(env.TURNSTILE_SECRET_KEY)}&response=${encodeURIComponent(turnstileToken)}`,
    });
    const verifyData = await verifyRes.json();
    if (!verifyData.success) return json({ error: "Turnstile verification failed" }, 403);

    if (!message || message.length < 3) return json({ error: "Message too short (min 3 chars)" }, 400);
    if (message.length > 2000) return json({ error: "Message too long (max 2000 chars)" }, 400);

    await env.DB.prepare("INSERT INTO feedback (tool, message) VALUES (?, ?)").bind(tool, message).run();
    return json({ success: true, message: "Feedback saved. Thank you!" });
  } catch {
    // Never echo internal error details to the client.
    return json({ error: "Your feedback could not be saved. Please try again later." }, 500);
  }
}

// Constant-time comparison of SHA-256 digests: no early exit on the first differing
// character, and both inputs are 32 bytes, so the key length does not leak either.
async function sameSecret(provided, expected) {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(provided)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

// Admin-only: requires the X-Admin-Key header to match the FEEDBACK_ADMIN_KEY
// secret (set via `wrangler pages secret put FEEDBACK_ADMIN_KEY`). Without
// this check, anyone could read every visitor's submitted feedback message.
export async function onRequestGet(context) {
  const { request, env } = context;
  const providedKey = request.headers.get("X-Admin-Key") || "";
  const expectedKey = env.FEEDBACK_ADMIN_KEY || "";
  if (!expectedKey || !providedKey || !(await sameSecret(providedKey, expectedKey))) {
    return json({ error: "Unauthorized" }, 401);
  }
  try {
    const { results } = await env.DB.prepare("SELECT * FROM feedback ORDER BY created_at DESC LIMIT 50").all();
    return json({ feedback: results, count: results.length });
  } catch {
    return json({ error: "Could not read feedback." }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
