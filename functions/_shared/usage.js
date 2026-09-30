// Helpers for the API usage counter (functions/api/_middleware.js).
// Only the first token of the User-Agent is kept (e.g. "python-requests",
// "node", "curl", "mozilla"): enough to spot an integration, never a full
// fingerprint. No IP address is ever stored.

const MAX_LEN = 40;

export function uaFamily(ua) {
  if (!ua || !ua.trim()) return "(none)";
  const first = ua.trim().split(/[\s/;(]/)[0].toLowerCase();
  const clean = first.replace(/[^a-z0-9._-]/g, "").slice(0, MAX_LEN);
  return clean || "(other)";
}

export function endpointOf(pathname) {
  const m = /^\/api\/([a-z0-9-]+)/i.exec(pathname);
  return m ? m[1].toLowerCase() : "(root)";
}
