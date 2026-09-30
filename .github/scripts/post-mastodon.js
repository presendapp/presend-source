// Exécuté par .github/workflows/announce.yml à chaque push sur main.
// Reçoit les commits du push via COMMITS_JSON, ne publie que ceux qui
// suivent nos conventions de message ("Add new API endpoint:",
// "Add new tool:"). Maximum 3 toots par exécution pour éviter le
// bruit en cas de gros push groupé.

const commits = JSON.parse(process.env.COMMITS_JSON || '[]');
const MASTODON_INSTANCE = process.env.MASTODON_INSTANCE || 'https://mastodon.social';
const TOKEN = process.env.MASTODON_TOKEN;

if (!TOKEN) {
  console.log('MASTODON_TOKEN absent, rien à publier.');
  process.exit(0);
}

const PATTERNS = [
  { re: /^Add new API endpoint: GET \/api\/([a-z-]+)/, label: (m) => `New free API endpoint just shipped: /api/${m[1]}\n\nFree, no signup, no API key — like the rest of Presend's API.\n\nhttps://presend.pages.dev/api` },
  { re: /^Add new tool: (.+?)(\n|$)/, label: (m) => `New free browser tool just shipped: ${m[1]}\n\nRuns entirely client-side. No upload, no account.\n\nhttps://presend.pages.dev` },
];

function matchCommit(message) {
  const firstLine = message.split('\n')[0];
  for (const p of PATTERNS) {
    const m = firstLine.match(p.re) || message.match(p.re);
    if (m) return p.label(m);
  }
  return null;
}

async function postToot(text) {
  const res = await fetch(`${MASTODON_INSTANCE}/api/v1/statuses`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: text, visibility: 'public' }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Mastodon API error ${res.status}: ${body}`);
  }
  const data = await res.json();
  console.log(`✅ Publié: ${data.url}`);
}

async function main() {
  const toPost = [];
  for (const commit of commits) {
    const text = matchCommit(commit.message);
    if (text) toPost.push(text);
  }
  const limited = toPost.slice(0, 3);
  console.log(`${limited.length} toot(s) à publier sur ${commits.length} commit(s) du push.`);
  for (const text of limited) {
    await postToot(text);
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (limited.length === 0) {
    console.log('Aucun commit correspondant aux conventions, rien à publier.');
  }
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
