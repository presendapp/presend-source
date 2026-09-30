// GET ?url=<url> pour une seule URL, ou POST { urls: [...] } pour un batch (max 100).

const TRACKING_PARAMS = [
  'utm_source','utm_medium','utm_campaign','utm_term','utm_content','utm_id','utm_source_platform','utm_creative_format','utm_marketing_tactic',
  'fbclid','gclid','dclid','wbraid','gbraid','ttclid','igshid','si','ref','referrer','source','medium','campaign',
  'yclid','msclkid','li_fat_id','mc_cid','mc_eid','mkt_tok','trk_contact','trk_msg','trk_module','trk_sid',
  'ef_id','epik','pk_campaign','pk_kwd','pk_keyword','piwik_campaign','piwik_kwd','mtm_source','mtm_medium','mtm_campaign','mtm_keyword','mtm_content','mtm_cid','mtm_group','mtm_placement','mtm_source_platform',
  'sccid','rb_clickid','irclickid','irgwc','clickid','affiliate','aff_id','aff_sub','aff_sub2','aff_sub3','aff_sub4','aff_sub5','subid','subid2','subid3',
  'wickedid','twclid','liid','scid','rbid','pd_rd_r','pd_rd_w','pd_rd_wg','pf_rd_r','pf_rd_p','pf_rd_s','pf_rd_t','pf_rd_i','pd_rd_i','pd_rd_m',
  'spJobID','spMailingID','spUserID','spReportId','cvid','oicd','srsltid','gs_lcrp','gs_lp','gs_lcp','mibextid','sxsrf'
];


async function checkRateLimit(env, clientIP, bucket, isTest = false) {
  if (!env.PRESEND_ANALYTICS) return true;
  try {
    const now = Math.floor(Date.now() / 60000);
    const rateKey = `rate:${bucket}:${clientIP}:${now}`;
    let count = await env.PRESEND_ANALYTICS.get(rateKey);
    count = count ? parseInt(count) : 0;
    if (count >= 60) return false; // aligné sur le message "Max 60 requests per minute" (était 30)
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
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...extra,
  };
}

function cleanUrl(raw) {
  raw = (raw || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    let removed = 0;
    TRACKING_PARAMS.forEach((p) => {
      if (url.searchParams.has(p)) { url.searchParams.delete(p); removed++; }
    });
    const search = url.searchParams.toString();
    url.search = search ? '?' + search : '';
    return { original: raw, clean: url.toString(), removed, valid: true };
  } catch (e) {
    return { original: raw, clean: raw, removed: 0, valid: false };
  }
}

export async function onRequestOptions() {
  return new Response(null, { headers: corsHeaders() });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
  const allowed = await checkRateLimit(env, clientIP, 'urlclean', request.headers.get('X-Presend-Test') === '1');
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 60 requests per minute.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return new Response(JSON.stringify({
      usage: 'GET /api/url-clean?url=<url>  —  ou POST { "urls": ["...", "..."] } pour 100 max.',
      example: 'https://presend.pages.dev/api/url-clean?url=https://example.com/?utm_source=x',
      tracking_params_removed: TRACKING_PARAMS.length,
    }, null, 2), { headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
  }

  const result = cleanUrl(url);
  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400', ...corsHeaders() },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
  const allowed = await checkRateLimit(env, clientIP, 'urlclean', request.headers.get('X-Presend-Test') === '1');
  if (!allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Max 60 requests per minute.' }), {
      status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
  try {
    const body = await request.json();
    const urls = Array.isArray(body.urls) ? body.urls : null;

    if (!urls || urls.length === 0) {
      return new Response(JSON.stringify({ error: 'Envoie un JSON: { "urls": ["https://...", ...] }' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
    if (urls.length > 100) {
      return new Response(JSON.stringify({ error: 'Max 100 URLs par requête.' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    const results = urls.map(cleanUrl).filter(Boolean);
    const totalRemoved = results.reduce((sum, r) => sum + r.removed, 0);

    return new Response(JSON.stringify({
      count: results.length,
      total_tracking_params_removed: totalRemoved,
      results,
    }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders() },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'JSON invalide.', detail: e.message }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
}
