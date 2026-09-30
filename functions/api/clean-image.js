// POST une image JPEG ou PNG en binaire brut, reçois la même image avec
// tous les segments/chunks de métadonnées (EXIF, GPS, XMP, IPTC, commentaires)
// retirés, sans jamais ré-encoder les pixels.
// Usage: curl -X POST --data-binary @photo.jpg -H "Content-Type: image/jpeg" https://presend.pages.dev/api/clean-image -o clean.jpg

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

const MAX_SIZE = 20 * 1024 * 1024;

function corsHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...extra,
  };
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestGet() {
  return new Response(JSON.stringify({
    usage: 'POST raw bytes (Content-Type: image/jpeg or image/png)',
    example: 'curl -X POST --data-binary @photo.jpg -H "Content-Type: image/jpeg" https://presend.pages.dev/api/clean-image -o clean.jpg',
    supported_formats: ['image/jpeg', 'image/png'],
    max_size_bytes: MAX_SIZE,
    note: 'Metadata segments/chunks are removed by direct binary parsing — pixel data is never re-encoded, so image quality is untouched.',
  }, null, 2), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

// --- JPEG: walk the marker stream, drop APP1 (EXIF/XMP), APP2 (FlashPix,
// but this simple version also strips it — no ICC profile preservation
// needed for a privacy tool), APP12 (Ducky), APP13 (IPTC/Photoshop), and
// COM (comment) segments. Stop at SOS (0xFFDA): everything after that is
// compressed image data, never metadata, and must be copied untouched.
function stripJpegMetadata(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) {
    throw new Error('Not a valid JPEG (missing SOI marker).');
  }
  const STRIP_MARKERS = new Set([0xE1, 0xE2, 0xEC, 0xED, 0xFE]); // APP1, APP2, APP12, APP13, COM
  const out = [0xFF, 0xD8]; // keep SOI
  let pos = 2;

  while (pos < bytes.length - 1) {
    if (bytes[pos] !== 0xFF) {
      // Not a marker where we expected one — bail out and copy the rest
      // verbatim rather than risk corrupting the file.
      for (let i = pos; i < bytes.length; i++) out.push(bytes[i]);
      return new Uint8Array(out);
    }
    const marker = bytes[pos + 1];

    // SOS (Start of Scan): metadata is over, copy everything remaining as-is.
    if (marker === 0xDA) {
      for (let i = pos; i < bytes.length; i++) out.push(bytes[i]);
      return new Uint8Array(out);
    }
    // Markers with no length field (standalone).
    if (marker === 0xD8 || marker === 0xD9 || (marker >= 0xD0 && marker <= 0xD7)) {
      out.push(0xFF, marker);
      pos += 2;
      continue;
    }

    const segLength = (bytes[pos + 2] << 8) | bytes[pos + 3];
    if (STRIP_MARKERS.has(marker)) {
      // Skip this segment entirely (marker + length + payload).
      pos += 2 + segLength;
      continue;
    }
    // Keep every other segment (SOF, DHT, DQT, DRI, etc.) untouched.
    for (let i = 0; i < 2 + segLength; i++) out.push(bytes[pos + i]);
    pos += 2 + segLength;
  }

  return new Uint8Array(out);
}

// --- PNG: walk the chunk stream, drop ancillary metadata chunks
// (tEXt, zTXt, iTXt, eXIf, tIME) while keeping every critical/rendering
// chunk (IHDR, PLTE, IDAT, IEND, etc.) byte-for-byte identical.
const PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
const STRIP_PNG_CHUNKS = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);

function stripPngMetadata(bytes) {
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) throw new Error('Not a valid PNG (bad signature).');
  }
  const out = Array.from(bytes.slice(0, 8));
  let pos = 8;

  while (pos < bytes.length) {
    if (pos + 8 > bytes.length) break; // truncated, stop copying safely
    const length = (bytes[pos] << 24) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3];
    const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
    const chunkTotalLength = 4 + 4 + length + 4; // length + type + data + CRC

    if (STRIP_PNG_CHUNKS.has(type)) {
      pos += chunkTotalLength;
      continue;
    }
    for (let i = 0; i < chunkTotalLength; i++) out.push(bytes[pos + i]);
    pos += chunkTotalLength;
    if (type === 'IEND') break;
  }

  return new Uint8Array(out);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

  const allowed = await checkRateLimit(env, clientIP, 'clean-image', request.headers.get('X-Presend-Test') === '1');
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 30 requests per minute.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const contentType = (request.headers.get('content-type') || '').toLowerCase();
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
    let cleaned;
    let outputType;

    if (contentType.includes('png') || (bytes[0] === 0x89 && bytes[1] === 0x50)) {
      cleaned = stripPngMetadata(bytes);
      outputType = 'image/png';
    } else if (contentType.includes('jpeg') || contentType.includes('jpg') || (bytes[0] === 0xFF && bytes[1] === 0xD8)) {
      cleaned = stripJpegMetadata(bytes);
      outputType = 'image/jpeg';
    } else {
      return new Response(JSON.stringify({ error: 'Unsupported format. Only JPEG and PNG are supported.' }), {
        status: 415, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    return new Response(cleaned, {
      headers: {
        'Content-Type': outputType,
        'Cache-Control': 'no-store',
        'X-Original-Bytes': String(bytes.length),
        'X-Output-Bytes': String(cleaned.length),
        ...corsHeaders(),
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Could not process this image.', detail: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
}
