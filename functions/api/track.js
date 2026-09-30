// POST /api/track  { "tool": "<nom>" } -- comptage anonyme des pages vues.
//
// Appelé au chargement de chaque page du site (336 pages). L'ancienne version
// faisait 2 écritures KV par page vue, sans échantillonnage -- or le plan
// gratuit Cloudflare limite KV à 1 000 écritures/jour, et cet espace KV est
// partagé avec les rate limits de toute l'API : quota épuisé = rate limits
// désactivés en silence. Désormais échantillonné comme les autres endpoints
// (~0,3 écriture par page vue). Les compteurs de visites sont des estimations.

const RATE_LIMIT = 20; // par minute et par IP (moyenne, écriture échantillonnée)

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const kv = env.PRESEND_ANALYTICS;
  const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

  let tool = 'unknown';
  try {
    const body = await request.json();
    if (body && typeof body.tool === 'string' && body.tool.length <= 100) tool = body.tool;
  } catch (e) { /* corps absent ou invalide : compté comme "unknown" */ }

  if (!kv) return jsonResponse({ tool, message: 'Tracked anonymously' });

  try {
    const now = Math.floor(Date.now() / 60000);
    const rateKey = `rate:${clientIP}:${now}`;
    const rateCount = parseInt((await kv.get(rateKey)) || '0', 10);
    if (rateCount >= RATE_LIMIT) {
      return jsonResponse({ error: `Rate limit exceeded. Max ${RATE_LIMIT} requests per minute.` }, 429);
    }
    // Écriture échantillonnée 1 sur 5 avec +5 : même limite en moyenne, 5x moins d'écritures.
    if (Math.random() < 1 / 5) await kv.put(rateKey, String(rateCount + 5), { expirationTtl: 120 });

    // Compteur de visites échantillonné 1 sur 10 avec +10 (comme api-visits).
    if (Math.random() < 1 / 10) {
      const date = new Date().toISOString().split('T')[0];
      const key = `visits:${tool}:${date}`;
      const count = parseInt((await kv.get(key)) || '0', 10);
      await kv.put(key, String(count + 10));
    }
  } catch (e) {
    // KV indisponible ou quota dépassé : le suivi est best-effort, jamais une erreur pour la page.
  }
  return jsonResponse({ tool, message: 'Tracked anonymously' });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
