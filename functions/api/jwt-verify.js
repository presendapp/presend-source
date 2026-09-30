// POST /api/jwt-verify
// Body: {"token": "...", "secret": "..."} for HS256/384/512
//    or {"token": "...", "jwk": {...}} for RS/ES/PS with a known public key
//    or {"token": "...", "jwks_url": "https://.../jwks.json"} to fetch and
//       match by "kid" -- the common case for verifying tokens issued by
//       Google, Auth0, Firebase, Azure AD, etc.
//
// Unlike /api/jwt-decode (which only decodes header/payload, no crypto),
// this actually verifies the cryptographic signature using the Workers-
// native Web Crypto API (crypto.subtle) -- no library needed. Also checks
// exp/nbf claims when present.

async function checkRateLimit(env, clientIP, bucket, isTest = false) {
  if (!env.PRESEND_ANALYTICS) return true;
  try {
    const now = Math.floor(Date.now() / 60000);
    const rateKey = `rate:${bucket}:${clientIP}:${now}`;
    let count = await env.PRESEND_ANALYTICS.get(rateKey);
    count = count ? parseInt(count) : 0;
    if (count >= 20) return false;
    // Écriture échantillonnée (1 sur 5) pour économiser le quota KV --
    // légèrement moins précis en rafale, mais protège toujours contre un abus soutenu.
    if (Math.random() < 1 / 5) {
      await env.PRESEND_ANALYTICS.put(rateKey, (count + 5).toString(), { expirationTtl: 120 });
    }
  } catch (e) {
    // KV en panne ou quota dépassé -- ne doit jamais faire planter la requête.
    return true;
  }

  try {
    if (!isTest && Math.random() < 0.1) {
      const today = new Date().toISOString().split('T')[0];
      const visitKey = `api-visits:${bucket}:${today}`;
      const visits = await env.PRESEND_ANALYTICS.get(visitKey);
      await env.PRESEND_ANALYTICS.put(visitKey, ((visits ? parseInt(visits) : 0) + 10).toString());
    }
  } catch (e) { /* tracking best-effort */ }

  return true;
}

function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...extra,
  };
}

function base64UrlToBytes(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
}

function base64UrlDecodeText(str) {
  return new TextDecoder().decode(base64UrlToBytes(str));
}

// Maps a JWT "alg" header value to the Web Crypto parameters needed to
// import a key and run crypto.subtle.verify().
const ALG_MAP = {
  HS256: { kind: 'hmac', hash: 'SHA-256' },
  HS384: { kind: 'hmac', hash: 'SHA-384' },
  HS512: { kind: 'hmac', hash: 'SHA-512' },
  RS256: { kind: 'rsassa', hash: 'SHA-256' },
  RS384: { kind: 'rsassa', hash: 'SHA-384' },
  RS512: { kind: 'rsassa', hash: 'SHA-512' },
  PS256: { kind: 'rsapss', hash: 'SHA-256', saltLength: 32 },
  PS384: { kind: 'rsapss', hash: 'SHA-384', saltLength: 48 },
  PS512: { kind: 'rsapss', hash: 'SHA-512', saltLength: 64 },
  ES256: { kind: 'ecdsa', hash: 'SHA-256', namedCurve: 'P-256' },
  ES384: { kind: 'ecdsa', hash: 'SHA-384', namedCurve: 'P-384' },
  ES512: { kind: 'ecdsa', hash: 'SHA-512', namedCurve: 'P-521' },
};

async function verifyHmac(signingInput, signatureBytes, secret, hash) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash }, false, ['verify']
  );
  return crypto.subtle.verify('HMAC', key, signatureBytes, new TextEncoder().encode(signingInput));
}

async function importPublicJwk(jwk, algConfig) {
  let algorithm;
  if (algConfig.kind === 'rsassa') algorithm = { name: 'RSASSA-PKCS1-v1_5', hash: algConfig.hash };
  else if (algConfig.kind === 'rsapss') algorithm = { name: 'RSA-PSS', hash: algConfig.hash };
  else if (algConfig.kind === 'ecdsa') algorithm = { name: 'ECDSA', namedCurve: algConfig.namedCurve, hash: algConfig.hash };
  else throw new Error('Unsupported algorithm kind for key import.');

  return crypto.subtle.importKey('jwk', jwk, algorithm, false, ['verify']);
}

async function verifyAsymmetric(signingInput, signatureBytes, jwk, algConfig) {
  const key = await importPublicJwk(jwk, algConfig);
  let verifyAlgorithm;
  if (algConfig.kind === 'rsassa') verifyAlgorithm = 'RSASSA-PKCS1-v1_5';
  else if (algConfig.kind === 'rsapss') verifyAlgorithm = { name: 'RSA-PSS', saltLength: algConfig.saltLength };
  else if (algConfig.kind === 'ecdsa') verifyAlgorithm = { name: 'ECDSA', hash: algConfig.hash };

  return crypto.subtle.verify(verifyAlgorithm, key, signatureBytes, new TextEncoder().encode(signingInput));
}

async function fetchJwk(jwksUrl, kid) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(jwksUrl, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`JWKS fetch failed: HTTP ${res.status}`);
    const data = await res.json();
    const keys = data.keys || [];
    if (keys.length === 0) throw new Error('JWKS has no keys.');
    const match = kid ? keys.find((k) => k.kid === kid) : keys[0];
    if (!match) throw new Error(`No key with kid "${kid}" found in JWKS.`);
    return match;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

function checkTimeClaims(payload) {
  const now = Math.floor(Date.now() / 1000);
  const issues = [];
  if (typeof payload.exp === 'number' && payload.exp < now) {
    issues.push(`Token expired ${now - payload.exp}s ago (exp claim).`);
  }
  if (typeof payload.nbf === 'number' && payload.nbf > now) {
    issues.push(`Token not yet valid for ${payload.nbf - now}s (nbf claim).`);
  }
  return issues;
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestGet() {
  return new Response(JSON.stringify({
    usage: 'POST JSON body: {"token": "<jwt>", "secret": "..."} for HS256/384/512, or {"token": "<jwt>", "jwk": {...}} / {"token": "<jwt>", "jwks_url": "https://.../jwks.json"} for RS/ES/PS.',
    supported_algorithms: Object.keys(ALG_MAP),
    note: 'Actually verifies the cryptographic signature via the Workers-native Web Crypto API -- unlike /api/jwt-decode, which only decodes without verifying.',
  }, null, 2), { headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
  const isTest = request.headers.get('X-Presend-Test') === '1';

  const allowed = await checkRateLimit(env, clientIP, 'jwtverify', isTest);
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 20 requests per minute.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Expected a JSON body.' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const token = (body.token || '').trim();
  if (!token) {
    return new Response(JSON.stringify({ error: 'Missing "token" field.' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return new Response(JSON.stringify({ error: 'Not a valid JWT (expected 3 dot-separated parts).' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  let header, payload;
  try {
    header = JSON.parse(base64UrlDecodeText(parts[0]));
    payload = JSON.parse(base64UrlDecodeText(parts[1]));
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Could not decode token.', detail: e.message }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const algConfig = ALG_MAP[header.alg];
  if (!algConfig) {
    return new Response(JSON.stringify({
      header, payload, valid: false,
      error: `Unsupported or unrecognized algorithm: "${header.alg}". Supported: ${Object.keys(ALG_MAP).join(', ')}.`,
    }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders() } });
  }

  const signingInput = parts[0] + '.' + parts[1];
  const signatureBytes = base64UrlToBytes(parts[2]);
  const timeIssues = checkTimeClaims(payload);

  try {
    let valid;
    if (algConfig.kind === 'hmac') {
      if (!body.secret) {
        return new Response(JSON.stringify({ error: `Algorithm "${header.alg}" requires a "secret" field.` }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        });
      }
      valid = await verifyHmac(signingInput, signatureBytes, body.secret, algConfig.hash);
    } else {
      let jwk = body.jwk;
      if (!jwk && body.jwks_url) {
        jwk = await fetchJwk(body.jwks_url, header.kid);
      }
      if (!jwk) {
        return new Response(JSON.stringify({ error: `Algorithm "${header.alg}" requires a "jwk" (public key) or "jwks_url" field.` }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        });
      }
      valid = await verifyAsymmetric(signingInput, signatureBytes, jwk, algConfig);
    }

    return new Response(JSON.stringify({
      header,
      payload,
      algorithm: header.alg,
      valid,
      time_issues: timeIssues.length > 0 ? timeIssues : null,
    }, null, 2), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders() },
    });
  } catch (e) {
    return new Response(JSON.stringify({
      header, payload, valid: false,
      error: 'Could not verify signature.', detail: e.message,
    }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
}
