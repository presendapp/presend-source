// POST /api/file-type
// Detects a file's REAL type from its binary signature ("magic bytes"),
// regardless of filename or claimed Content-Type. Flags a mismatch if the
// declared Content-Type doesn't match what the bytes actually are -- a
// common technique for disguising malicious files as harmless ones
// (e.g. an .exe renamed to photo.jpg) to slip past naive upload filters.

async function checkRateLimit(env, clientIP, bucket, isTest = false) {
  if (!env.PRESEND_ANALYTICS) return true;
  try {
    const now = Math.floor(Date.now() / 60000);
    const rateKey = `rate:${bucket}:${clientIP}:${now}`;
    let count = await env.PRESEND_ANALYTICS.get(rateKey);
    count = count ? parseInt(count) : 0;
    if (count >= 30) return false;
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

const MAX_SIZE = 20 * 1024 * 1024;

// Each signature: bytes to match at a given offset. Checked in order;
// first match wins. Not exhaustive -- covers the formats most relevant
// to upload-security use cases (images, documents, archives, executables).
const SIGNATURES = [
  { mime: 'application/pdf', ext: 'pdf', offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] },
  { mime: 'image/png', ext: 'png', offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/jpeg', ext: 'jpg', offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/gif', ext: 'gif', offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'image/bmp', ext: 'bmp', offset: 0, bytes: [0x42, 0x4d] },
  { mime: 'image/webp', ext: 'webp', offset: 0, bytes: [0x52, 0x49, 0x46, 0x46], offset2: { pos: 8, bytes: [0x57, 0x45, 0x42, 0x50] } },
  { mime: 'application/wasm', ext: 'wasm', offset: 0, bytes: [0x00, 0x61, 0x73, 0x6d] },
  { mime: 'application/gzip', ext: 'gz', offset: 0, bytes: [0x1f, 0x8b] },
  { mime: 'application/x-rar-compressed', ext: 'rar', offset: 0, bytes: [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07] },
  { mime: 'application/x-7z-compressed', ext: '7z', offset: 0, bytes: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c] },
  // ZIP-based formats (docx/xlsx/pptx/jar/apk are all ZIP containers, so
  // this reports the container format, not the specific document type).
  { mime: 'application/zip', ext: 'zip', offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] },
  { mime: 'application/zip', ext: 'zip', offset: 0, bytes: [0x50, 0x4b, 0x05, 0x06] },
  { mime: 'application/vnd.sqlite3', ext: 'sqlite', offset: 0, bytes: [0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00] },
  { mime: 'application/x-ole-compound', ext: 'doc', label: 'Legacy Office document (doc/xls/ppt)', offset: 0, bytes: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] },
  { mime: 'application/rtf', ext: 'rtf', offset: 0, bytes: [0x7b, 0x5c, 0x72, 0x74, 0x66] },
  { mime: 'application/x-msdownload', ext: 'exe', label: 'Windows executable (PE/EXE/DLL)', offset: 0, bytes: [0x4d, 0x5a] },
  { mime: 'application/x-elf', ext: 'elf', label: 'Linux/ELF executable', offset: 0, bytes: [0x7f, 0x45, 0x4c, 0x46] },
];

function bytesMatch(bytes, sig, offset) {
  for (let i = 0; i < sig.bytes.length; i++) {
    if (bytes[offset + i] !== sig.bytes[i]) return false;
  }
  if (sig.offset2) {
    for (let i = 0; i < sig.offset2.bytes.length; i++) {
      if (bytes[sig.offset2.pos + i] !== sig.offset2.bytes[i]) return false;
    }
  }
  return true;
}

function detectType(bytes) {
  for (const sig of SIGNATURES) {
    if (bytesMatch(bytes, sig, sig.offset)) {
      return { mime: sig.mime, extension: sig.ext, label: sig.label || null };
    }
  }
  return null;
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestGet() {
  return new Response(JSON.stringify({
    usage: 'POST raw bytes; the Content-Type header you send (if any) is treated as the "claimed" type and compared against the real detected type.',
    example: 'curl -X POST --data-binary @suspicious.jpg -H "Content-Type: image/jpeg" https://presend.pages.dev/api/file-type',
    note: 'Checks binary signatures ("magic bytes"), not filename or extension. Covers common image/document/archive/executable formats -- not exhaustive.',
  }, null, 2), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
  const isTest = request.headers.get('X-Presend-Test') === '1';

  const allowed = await checkRateLimit(env, clientIP, 'filetype', isTest);
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 30 requests per minute.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const claimedType = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase() || null;
  const contentLength = parseInt(request.headers.get('content-length') || '0', 10);
  if (contentLength > MAX_SIZE) {
    return new Response(JSON.stringify({ error: `File too large. Max ${MAX_SIZE / (1024 * 1024)}MB.` }), {
      status: 413, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  try {
    const buffer = await request.arrayBuffer();
    if (buffer.byteLength === 0) {
      return new Response(JSON.stringify({ error: 'Empty request body.' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
    if (buffer.byteLength > MAX_SIZE) {
      return new Response(JSON.stringify({ error: `File too large. Max ${MAX_SIZE / (1024 * 1024)}MB.` }), {
        status: 413, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    const bytes = new Uint8Array(buffer);
    const detected = detectType(bytes);

    // Only flag a mismatch if we actually detected a known type AND a claim
    // was given AND they genuinely differ (and the claim wasn't the generic
    // application/octet-stream, which just means "unspecified").
    let mismatch = false;
    const NO_REAL_CLAIM = new Set(['application/octet-stream', 'application/x-www-form-urlencoded']);
    if (detected && claimedType && !NO_REAL_CLAIM.has(claimedType) && claimedType !== detected.mime) {
      mismatch = true;
    }

    return new Response(JSON.stringify({
      size_bytes: bytes.length,
      claimed_type: claimedType,
      detected: detected ? { mime: detected.mime, extension: detected.extension, label: detected.label } : null,
      mismatch,
      warning: mismatch
        ? `Claimed type "${claimedType}" does not match the file's actual signature (detected: "${detected.mime}"). This can indicate a disguised or mislabeled file.`
        : (detected ? null : 'Could not identify this file\'s type from its signature (may be a format outside our supported list, or the file is corrupted/truncated).'),
    }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders() },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Could not process this file.', detail: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
}
