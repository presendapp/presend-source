// Limites de debit par appelant, compteur par minute dans KV (PRESEND_ANALYTICS).
// Module unique depuis le 2 oct. 2026 : remplace 53 copies locales de checkRateLimit,
// a comportement identique au commit e98e326c (verifie par tests/rate-limit/equivalence.mjs) :
//   - seuil par endpoint (options.limit, OBLIGATOIRE : pas de valeur par defaut silencieuse) ;
//   - ecriture echantillonnee 1 fois sur 5 avec +5, ou exacte (+1 a chaque appel) si options.exact ;
// Depuis le commit suivant : plus de comptage api-visits (lu seulement par api-stats, supprime ;
// la mesure d'usage est dans D1 api_usage), donc plus d'options trackVisits ni isTest.
// Une panne de KV ne bloque jamais la requete. KV est finalement coherent : en prod ces limites
// sont approximatives (lecon 66), ne jamais promettre publiquement une limite precise.

export async function checkRateLimit(env, clientIP, bucket, options) {
  const { limit, exact = false } = options || {};
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new TypeError("checkRateLimit(" + bucket + "): limit manquante ou invalide");
  }
  if (!env.PRESEND_ANALYTICS) return true;
  try {
    const now = Math.floor(Date.now() / 60000);
    const rateKey = `rate:${bucket}:${clientIP}:${now}`;
    let count = await env.PRESEND_ANALYTICS.get(rateKey);
    count = count ? parseInt(count) : 0;
    if (count >= limit) return false;
    if (exact) {
      await env.PRESEND_ANALYTICS.put(rateKey, (count + 1).toString(), { expirationTtl: 120 });
    } else if (Math.random() < 1 / 5) {
      await env.PRESEND_ANALYTICS.put(rateKey, (count + 5).toString(), { expirationTtl: 120 });
    }
  } catch (e) {
    // KV en panne ou quota depasse : ne doit jamais faire echouer la requete.
    return true;
  }

  return true;
}
