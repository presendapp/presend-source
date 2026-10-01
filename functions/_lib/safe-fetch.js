// functions/_lib/safe-fetch.js
//
// SSRF-safe fetch for Presend's URL-fetching endpoints (redirect-trace,
// scrape, security-scan, favicon, security-headers).
//
// The problem this fixes: checking a URL's HOSTNAME STRING against a
// blocklist (e.g. rejecting "127.0.0.1") does NOT protect against DNS
// rebinding -- an attacker-controlled domain can resolve to a public IP
// at validation time and a private/internal IP at the moment fetch()
// actually connects, since standard fetch() re-resolves DNS on its own.
// The hostname-string check and the actual connection are two separate
// DNS lookups with a race window between them (TOCTOU).
//
// What this does: resolve the hostname ourselves via DNS-over-HTTPS and
// validate every resolved IP (not just the hostname string) against the
// blocklist, at every redirect hop (safeFetchFollowingRedirects).
//
// What it does NOT do (corrected 2026-10-01): pin the connection. Until then
// this file passed the validated IP as `cf.resolveOverride`, but Cloudflare
// only honours that option when both the URL host and the override are
// hostnames in our own zone (Workers docs, Request > cf.resolveOverride);
// for third-party hosts it was ignored and fetch() did its own DNS lookup.
// So a DNS-rebinding window between validation and connection remains. What
// limits it in practice is Cloudflare refusing connections from Workers to
// private/reserved addresses (observed 2026-10-01: 403 for 127.0.0.1 and
// 169.254.169.254 behind a redirect, public targets reached).
//
// The rebinding test domain once used here (7f000001.08080808.rbndr.us) was
// rejected by the validation step; it never tested pinning.

const BLOCKED_PATTERNS = [
  /^localhost$/i, /^127\./, /^10\./, /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./, /^0\.0\.0\.0$/,
  /^\[?::1\]?$/, /^\[?fc00:/i, /^\[?fe80:/i,
  /\.local$/i, /^metadata\./i,
  // Defense-in-depth, low-cost addition (found reading Countly's
  // ssrf-protection.js): .internal is GCP's internal-DNS TLD, and
  // kubernetes.default(.svc) is the standard in-cluster API server
  // name. Neither is publicly resolvable via Cloudflare's own DoH
  // resolver in our setup -- we're likely already fail-closed on
  // these via "could not resolve hostname" -- but naming them
  // explicitly costs nothing and doesn't depend on that behavior
  // staying true.
  /\.internal$/i, /^kubernetes(\.default(\.svc)?)?$/i,
];

function isBlocked(value) {
  if (BLOCKED_PATTERNS.some((re) => re.test(value))) return true;
  // Adresse IPv6 mappee en IPv4, forme decimale a points
  // (::ffff:x.x.x.x ou ::ffff:0:x.x.x.x). Trouve en lisant Countly's
  // ssrf-protection.js.
  const v4MappedMatch = value.match(/^\[?::ffff:(?:0:)?(\d+\.\d+\.\d+\.\d+)\]?$/i);
  if (v4MappedMatch) {
    return BLOCKED_PATTERNS.some((re) => re.test(v4MappedMatch[1]));
  }
  // Meme chose, mais forme hexadecimale (::ffff:7f00:1 == 127.0.0.1) --
  // un deuxieme contournement reel, trouve en lisant urlSecurity.js de
  // RunOnFlux/flux, qui gere les deux formes alors qu'on ne gerait que
  // la premiere.
  const v4MappedHexMatch = value.match(/^\[?::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})\]?$/i);
  if (v4MappedHexMatch) {
    const high = parseInt(v4MappedHexMatch[1], 16);
    const low = parseInt(v4MappedHexMatch[2], 16);
    const decoded = `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
    return BLOCKED_PATTERNS.some((re) => re.test(decoded));
  }
  return false;
}

async function queryDns(hostname, type) {
  const res = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`,
    { headers: { Accept: 'application/dns-json' } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  const recordType = type === 'AAAA' ? 28 : 1;
  return (data.Answer || []).filter((a) => a.type === recordType).map((a) => a.data);
}

async function resolveHostname(hostname) {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.includes(':')) {
    return [hostname];
  }
  const [ipv4, ipv6] = await Promise.all([
    queryDns(hostname, 'A'),
    queryDns(hostname, 'AAAA'),
  ]);
  return [...ipv4, ...ipv6];
}

export async function validateAndResolve(hostname) {
  if (isBlocked(hostname)) {
    throw new Error(`Blocked hostname: ${hostname}`);
  }
  const ips = await resolveHostname(hostname);
  if (ips.length === 0) {
    throw new Error(`Could not resolve hostname: ${hostname}`);
  }
  const blockedIp = ips.find((ip) => isBlocked(ip));
  if (blockedIp) {
    throw new Error(`Hostname resolves to a blocked address: ${blockedIp}`);
  }
  return ips[0];
}

export async function safeFetch(url, options = {}) {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Blocked protocol: ${parsed.protocol}`);
  }
  await validateAndResolve(parsed.hostname);
  return fetch(url, options);
}

export { isBlocked as isBlockedHostname };

// Suit une chaine de redirections en validant chaque saut
// manuellement, renvoie la reponse finale -- reutilisable par tout
// endpoint qui veut juste "le resultat final, en toute securite" sans
// reimplementer la boucle lui-meme.
export async function safeFetchFollowingRedirects(url, options = {}, maxHops = 10) {
  let currentUrl = url;
  for (let i = 0; i < maxHops; i++) {
    const parsed = new URL(currentUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`Blocked protocol: ${parsed.protocol}`);
    }
    await validateAndResolve(parsed.hostname);
    const res = await fetch(currentUrl, { ...options, redirect: 'manual' });
    const isRedirect = res.status >= 300 && res.status < 400;
    const location = res.headers.get('Location');
    if (!isRedirect || !location) {
      return res;
    }
    currentUrl = new URL(location, currentUrl).toString();
  }
  throw new Error(`Stopped after ${maxHops} redirect hops (possible loop)`);
}
