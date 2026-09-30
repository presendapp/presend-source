#!/bin/bash
cd "$(dirname "$0")/.." || exit 1
echo "=== Etat verifie du projet Presend ($(date '+%Y-%m-%d')) ==="
echo ""
echo "Endpoints API (openapi.json):"
python3 -c "import json; print(' ', len(json.load(open('openapi.json'))['paths']))"
echo ""
echo "Outils navigateur (tools/):"
echo "  $(ls tools/*.html 2>/dev/null | wc -l)"
echo ""
echo "Outils MCP (functions/mcp.js):"
python3 -c "
import re
content = open('functions/mcp.js').read()
tools = set(re.findall(r\"name: '(\w+)'\", content))
tools.discard('presend_mcp')
print(' ', len(tools))
"
echo ""
echo "=== Conversations suivies (scripts/watch.txt) ==="
# Compteur = commentaires d'issue (meme sens que dans watch.txt). NOUVEAU aussi si revue, commentaire de ligne,
# fusion ou fermeture posterieurs au dernier commit de watch.txt (= fin de la session precedente). Lecon 34.
python3 - <<'PYEOF'
import json, os, subprocess
from datetime import datetime
def api(path):
    r = subprocess.run(["gh", "api", path], capture_output=True, text=True)
    return json.loads(r.stdout) if r.returncode == 0 else None
def dt(x): return datetime.fromisoformat(x.replace("Z", "+00:00"))
w = os.path.realpath("scripts/watch.txt"); root = os.path.dirname(os.path.dirname(w))
since = os.environ.get("SESSION_CHECK_SINCE") or subprocess.run(["git", "-C", root, "log", "-1", "--format=%cI", "--", "scripts/watch.txt"], capture_output=True, text=True).stdout.strip()
print(f"  (evenement recent = posterieur au dernier commit de watch.txt : {since or 'inconnu'})")
for line in open("scripts/watch.txt", encoding="utf-8"):
    parts = line.rstrip("\n").split(" ", 2)
    if not parts[0] or parts[0].startswith("#"): continue
    ref = parts[0]; base = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0
    note = parts[2] if len(parts) > 2 else ""
    repo, num = ref.rsplit("#", 1)
    it = api(f"repos/{repo}/issues/{num}")
    if it is None:
        print(f"  ERREUR   {ref}"); continue
    count, state = it["comments"], it["state"]
    com = api(f"repos/{repo}/issues/{num}/comments?per_page=100") or []
    last = com[-1]["user"]["login"] if com else "-"
    times = [c["created_at"] for c in com if c["user"]["login"] != "presendapp"]
    extra = ""
    if it.get("pull_request"):
        pr = api(f"repos/{repo}/pulls/{num}") or {}
        if pr.get("merged_at"):
            state = "merged"; times.append(pr["merged_at"])
        revs = api(f"repos/{repo}/pulls/{num}/reviews?per_page=100") or []
        lines = api(f"repos/{repo}/pulls/{num}/comments?per_page=100") or []
        times += [r["submitted_at"] for r in revs if r.get("submitted_at") and r["user"]["login"] != "presendapp"]
        times += [c["created_at"] for c in lines if c["user"]["login"] != "presendapp"]
        if revs: extra = f" | revue: {revs[-1]['user']['login']}={revs[-1]['state']}"
        extra += f" | revues {len(revs)}, lignes {len(lines)}"
    if it.get("closed_at") and state == "closed": times.append(it["closed_at"])
    recent = bool(since) and any(dt(x) > dt(since) for x in times)
    flag = "NOUVEAU " if (count > base or recent) else "        "
    print(f"  {flag}{state:<7} {count:>3}/{base:<3} dernier: {last:<22} {ref}{extra}\n           {note}")
PYEOF
echo ""
echo "=== Cibles de demarchage GitHub (issues + PR de presendapp) ==="
data=$(gh search issues --author=presendapp --include-prs --json repository,number,state,commentsCount,updatedAt,isPullRequest --limit 300) || { echo "  ERREUR: recherche GitHub"; exit 1; }
GH_DATA="$data" python3 - <<'EOF'
import json, os, subprocess
ME = 'presendapp'
data = json.loads(os.environ['GH_DATA'])
prs = [d for d in data if d['isPullRequest']]
print(f'  Total: {len(data)} ({len(data) - len(prs)} issues, {len(prs)} PR)')

watch = {}
for line in open('scripts/watch.txt'):
    line = line.strip()
    if not line or line.startswith('#'): continue
    parts = line.split(' ', 2)
    watch[parts[0]] = parts[2] if len(parts) > 2 else ''

def api(path):
    out = subprocess.run(['gh', 'api', '--paginate', path, '--jq',
                          '.[] | [.user.login, (.submitted_at // .created_at // "")] | @tsv'],
                         capture_output=True, text=True)
    if out.returncode != 0:
        raise RuntimeError(out.stderr.strip()[:80])
    return [l.split('\t') for l in out.stdout.splitlines() if l]

def events(d):
    repo, num = d['repository']['nameWithOwner'], d['number']
    ev = api(f'repos/{repo}/issues/{num}/comments?per_page=100')
    if d['isPullRequest']:
        ev += api(f'repos/{repo}/pulls/{num}/reviews?per_page=100')
        ev += api(f'repos/{repo}/pulls/{num}/comments?per_page=100')
    return [e for e in ev if len(e) == 2 and e[1]]

def ref(d): return f"{d['repository']['nameWithOwner']}#{d['number']}"
def is_bot(u): return u.endswith('[bot]')

print()
print('  >>> A NOUS D AGIR (watch.txt) :')
todo = [(r, n) for r, n in watch.items() if n.startswith('[A NOUS')]
for r, n in todo: print(f'      {r}  {n}')
if not todo: print('      aucune')

waiting, bots, engaged, silent, errors = [], [], [], 0, []
for d in [d for d in data if d['state'] == 'open']:
    try: ev = events(d)
    except RuntimeError as e: errors.append((d, str(e))); continue
    humans = [e for e in ev if e[0] != ME and not is_bot(e[0])]
    last = max(ev, key=lambda e: e[1]) if ev else None
    if last and last[0] != ME:
        (bots if is_bot(last[0]) else waiting).append((d, last))
    if humans:
        mine = [e for e in ev if e[0] == ME]
        engaged.append((d, max(humans, key=lambda e: e[1]), max(mine, key=lambda e: e[1])[1] if mine else '-'))
    else:
        silent += 1

print()
print(f"  Ouvertes, dernier mot a quelqu'un d'autre: {len(waiting)}")
for d, (who, when) in sorted(waiting, key=lambda x: x[1][1], reverse=True):
    print(f'    {when[:10]}  {who:20s} {ref(d)}')
if bots: print('  Dernier mot = bot: ' + ', '.join(f'{ref(d)} ({w})' for d, (w, _) in bots))

print()
print(f'  Ouvertes AVEC reponse humaine (toutes): {len(engaged)}  -- tour selon watch.txt')
for d, (who, when), mine in sorted(engaged, key=lambda x: x[1][1], reverse=True):
    note = watch.get(ref(d))
    tag = note.split(']')[0] + ']' if note and note.startswith('[') else ('suivie, SANS marqueur' if note is not None else 'NON SUIVIE -> ajouter a watch.txt')
    print(f'    {ref(d):42s} eux: {who[:16]:16s} {when[:10]} | nous: {mine[:10]:10s} | {tag}')
print(f'  Ouvertes SANS aucune reponse humaine: {silent}')
for d, msg in errors: print(f'  ERREUR {ref(d)}: {msg}')
EOF

echo
echo "=== References externes (mentions, issues/PR de tiers qui nous citent) ==="
python3 "$(dirname "$0")/crossrefs.py"
