// Shared URLhaus (abuse.ch) reputation check logic. Used by
// /api/url-reputation, /api/security-scan, and /api/qr-scan.
export async function checkReputation(targetUrl, env) {
  if (!env.URLHAUS_AUTH_KEY) return { checked: false, malicious: null, error: 'Reputation check temporarily unavailable' };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch('https://urlhaus-api.abuse.ch/v1/url/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Auth-Key': env.URLHAUS_AUTH_KEY },
      body: 'url=' + encodeURIComponent(targetUrl),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`URLhaus API error: HTTP ${res.status}`);
    const data = await res.json();

    if (data.query_status === 'no_results') {
      return { checked: true, malicious: false, status: 'not_found' };
    }
    if (data.query_status === 'ok') {
      return { checked: true, malicious: true, status: data.url_status, threat: data.threat, tags: data.tags || [] };
    }
    return { checked: true, malicious: null, status: data.query_status };
  } catch (e) {
    clearTimeout(timeout);
    return { checked: false, malicious: null, error: e.name === 'AbortError' ? 'Request timed out' : e.message };
  }
}
