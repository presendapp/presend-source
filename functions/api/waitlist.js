// Internal endpoint (not in openapi.json): waitlist for the "Presend for teams" demand test.
// Stores only what the visitor typed (no IP, no User-Agent). Same-origin only: no CORS headers.
const TEAM_SIZES = ["1", "2-10", "11-50", "51+"];
const ECOSYSTEMS = ["npm", "pypi", "both", "other"];
const WOULD_PAY = ["yes", "maybe", "no"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  const str = (v) => (typeof v === "string" ? v.trim() : "");
  const email = str(body.email).toLowerCase();
  const teamSize = str(body.team_size);
  const ecosystem = str(body.ecosystem);
  const wouldPay = str(body.would_pay);
  const note = str(body.note);
  const token = str(body.turnstileToken);

  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return json({ error: "Please enter a valid email address." }, 400);
  }
  if (!TEAM_SIZES.includes(teamSize) || !ECOSYSTEMS.includes(ecosystem) || !WOULD_PAY.includes(wouldPay)) {
    return json({ error: "Please answer the three questions." }, 400);
  }
  if (note.length > 1000) {
    return json({ error: "The comment is too long (1000 characters max)." }, 400);
  }
  if (!token) {
    return json({ error: "Please complete the anti-spam check." }, 400);
  }

  try {
    const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `secret=${encodeURIComponent(env.TURNSTILE_SECRET_KEY)}&response=${encodeURIComponent(token)}`,
    });
    const verifyData = await verifyRes.json();
    if (!verifyData.success) {
      return json({ error: "The anti-spam check failed. Please try again." }, 403);
    }
  } catch {
    return json({ error: "The anti-spam check is unavailable. Please try again later." }, 503);
  }

  try {
    // Same answer whether or not the address was already on the list (no way to probe who signed up).
    await env.DB.prepare(
      "INSERT OR IGNORE INTO waitlist (email, team_size, ecosystem, would_pay, note) VALUES (?, ?, ?, ?, ?)"
    ).bind(email, teamSize, ecosystem, wouldPay, note || null).run();
  } catch {
    return json({ error: "Your entry could not be saved. Please try again later." }, 500);
  }
  return json({ success: true });
}
