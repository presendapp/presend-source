export async function onRequestPost(context) {
  const { request, env } = context;
  
  try {
    const body = await request.json();
    const tool = body.tool || "general";
    const message = body.message || "";
    const turnstileToken = body.turnstileToken || "";
    
    // Validate Turnstile token
    if (!turnstileToken) {
      return new Response(JSON.stringify({ error: "Turnstile token missing" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }
    
    const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `secret=${encodeURIComponent(env.TURNSTILE_SECRET_KEY)}&response=${encodeURIComponent(turnstileToken)}`
    });
    
    const verifyData = await verifyRes.json();
    if (!verifyData.success) {
      return new Response(JSON.stringify({ error: "Turnstile verification failed" }), {
        status: 403,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }
    
    if (!message || message.length < 3) {
      return new Response(JSON.stringify({ error: "Message too short (min 3 chars)" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }
    
    if (message.length > 2000) {
      return new Response(JSON.stringify({ error: "Message too long (max 2000 chars)" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }
    
    await env.DB.prepare("INSERT INTO feedback (tool, message) VALUES (?, ?)").bind(tool, message).run();
    
    return new Response(JSON.stringify({ success: true, message: "Feedback saved. Thank you!" }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
}

// Admin-only: requires the X-Admin-Key header to match the FEEDBACK_ADMIN_KEY
// secret (set via `wrangler pages secret put FEEDBACK_ADMIN_KEY`). Without
// this check, anyone could read every visitor's submitted feedback message.
export async function onRequestGet(context) {
  const { request, env } = context;

  const providedKey = request.headers.get("X-Admin-Key") || "";
  const expectedKey = env.FEEDBACK_ADMIN_KEY || "";
  if (!expectedKey || providedKey !== expectedKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  try {
    const { results } = await env.DB.prepare("SELECT * FROM feedback ORDER BY created_at DESC LIMIT 50").all();
    return new Response(JSON.stringify({ feedback: results, count: results.length }), {
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
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}
