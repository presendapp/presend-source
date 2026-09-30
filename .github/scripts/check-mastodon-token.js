// Vérifie que MASTODON_TOKEN est toujours valide.
// Sort avec un code d'erreur si le jeton est invalide/expiré -- fait échouer
// le workflow de façon VISIBLE, plutôt que de laisser le robot d'annonce
// échouer silencieusement dans un journal que personne ne consulte
// (exactement ce qui s'est passé le 12/09/2026 : jeton invalide pendant
// des heures avant d'être détecté par hasard).

const MASTODON_INSTANCE = process.env.MASTODON_INSTANCE || 'https://mastodon.social';
const MASTODON_TOKEN = process.env.MASTODON_TOKEN;

if (!MASTODON_TOKEN) {
  console.error('❌ MASTODON_TOKEN non défini.');
  process.exit(1);
}

const res = await fetch(`${MASTODON_INSTANCE}/api/v1/apps/verify_credentials`, {
  headers: { Authorization: `Bearer ${MASTODON_TOKEN}` },
});

if (!res.ok) {
  const body = await res.text();
  console.error(`❌ Jeton Mastodon invalide (HTTP ${res.status}): ${body}`);
  process.exit(1);
}

const data = await res.json();
console.log(`✅ Jeton valide -- application: "${data.name}"`);
process.exit(0);
