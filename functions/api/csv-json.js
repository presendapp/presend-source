// GET  /api/csv-json?direction=json-to-csv&data=<JSON encodé>
// POST /api/csv-json  { "direction": "json-to-csv"|"csv-to-json", "data": "..." }
// Note: les objets imbriqués ne sont PAS aplatis (String() direct) — même comportement que l'outil client.

const MAX_INPUT_LENGTH = 500000; // 500KB, raisonnable pour un endpoint edge

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

  // Tracking d'usage échantillonné (1 requête sur 10, multiplié par 10) pour économiser
  // le quota d'écritures KV — best-effort, ne bloque jamais la requête si ça échoue.
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
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', ...extra };
}

function escapeCsv(val) {
  const s = String(val == null ? '' : val);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function jsonToCsv(jsonText) {
  let data;
  try {
    data = JSON.parse(jsonText);
  } catch (e) {
    throw new Error('Invalid JSON: ' + e.message);
  }
  if (!Array.isArray(data)) {
    if (typeof data === 'object' && data !== null) data = [data];
    else throw new Error('JSON must be an array of objects or a single object.');
  }
  if (data.length === 0) return { csv: '', rows: 0, cols: 0 };
  const keys = Array.from(new Set(data.flatMap(Object.keys)));
  const lines = [keys.map(escapeCsv).join(',')];
  data.forEach((row) => {
    lines.push(keys.map((k) => escapeCsv(row[k])).join(','));
  });
  return { csv: lines.join('\n'), rows: data.length, cols: keys.length };
}

function csvToJson(csvText) {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('CSV needs at least a header row and one data row.');
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = [];
    let current = '';
    let inQuotes = false;
    for (let j = 0; j < lines[i].length; j++) {
      const ch = lines[i][j];
      if (ch === '"') {
        if (inQuotes && lines[i][j + 1] === '"') { current += '"'; j++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    values.push(current.trim());
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = values[idx] !== undefined ? values[idx].replace(/^"|"$/g, '').replace(/""/g, '"') : ''; });
    rows.push(obj);
  }
  return { json: JSON.stringify(rows, null, 2), rows: rows.length, cols: headers.length };
}

function convert(direction, data) {
  if (data.length > MAX_INPUT_LENGTH) {
    throw new Error(`Input too large (max ${MAX_INPUT_LENGTH} chars). Use the browser tool for larger files.`);
  }
  if (direction === 'json-to-csv') {
    const r = jsonToCsv(data);
    return { result: r.csv, rows: r.rows, cols: r.cols };
  } else if (direction === 'csv-to-json') {
    const r = csvToJson(data);
    return { result: r.json, rows: r.rows, cols: r.cols };
  }
  throw new Error('direction must be "json-to-csv" or "csv-to-json"');
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

  const allowed = await checkRateLimit(env, clientIP, 'csvjson', request.headers.get('X-Presend-Test') === '1');
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 30 requests per minute.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const { searchParams } = new URL(request.url);
  const direction = searchParams.get('direction');
  const data = searchParams.get('data');

  if (!direction || !data) {
    return new Response(JSON.stringify({
      usage: 'GET /api/csv-json?direction=json-to-csv|csv-to-json&data=<url-encoded text>  —  or POST { "direction": "...", "data": "..." }',
    }, null, 2), { headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  try {
    const out = convert(direction, data);
    return new Response(JSON.stringify(out), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders() },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

  const allowed = await checkRateLimit(env, clientIP, 'csvjson', request.headers.get('X-Presend-Test') === '1');
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 30 requests per minute.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  try {
    const body = await request.json();
    const out = convert(body.direction, String(body.data || ''));
    return new Response(JSON.stringify(out), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders() },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
}
