#!/usr/bin/env bash
# Resynchronise la collection Postman publique "Presend API" depuis openapi.json.
# Usage : bash scripts/postman-sync.sh   (depuis la racine du dépôt)
# Clé API Postman : générée pour l'occasion (Settings -> API keys), saisie sans
# affichage, jamais écrite sur disque ; à RÉVOQUER après usage.
set -euo pipefail
CID="57808683-783f3f64-0f9f-433e-95f6-518520d14ccf"
API="https://api.getpostman.com/collections/$CID"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"; unset PMKEY' EXIT

npx --yes openapi-to-postmanv2 -s openapi.json -o "$TMP/new.json" -p >/dev/null
read -rsp "Clé API Postman (rien ne s'affiche) : " PMKEY; echo
curl -sf "$API" -H "X-Api-Key: $PMKEY" -o "$TMP/live.json" || { echo "Lecture de la collection impossible (clé ?)"; exit 1; }

python3 - "$TMP/live.json" "$TMP/new.json" <<'EOF'
import json, sys
def load(p):
    d = json.load(open(p, encoding="utf-8")); return d.get("collection", d)
def reqs(c):
    out = {}
    for f in c.get("item", []):
        for it in (f["item"] if "item" in f else [f]):
            r = it.get("request", {}); u = r.get("url", {})
            out[(r.get("method"), "/" + "/".join(u.get("path", [])))] = json.dumps(r.get("description"), sort_keys=True)
    return out
live, new = reqs(load(sys.argv[1])), reqs(load(sys.argv[2]))
print(f"En ligne : {len(live)} requêtes | Nouvelle : {len(new)} requêtes")
print("Ajoutées :", sorted(set(new) - set(live)) or "aucune")
print("Retirées :", sorted(set(live) - set(new)) or "aucune")
print("Descriptions modifiées :", sorted(p for k, p in [(k, k[1]) for k in set(live) & set(new)] if live[k] != new[k]) or "aucune")
EOF

read -rp "Envoyer cette version vers Postman ? (o/N) " r
[ "$r" = "o" ] || { echo "Annulé."; exit 0; }
python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); json.dump({"collection": d.get("collection", d)}, open(sys.argv[2], "w"))' "$TMP/new.json" "$TMP/put.json"
curl -sf -X PUT "$API" -H "X-Api-Key: $PMKEY" -H "Content-Type: application/json" --data @"$TMP/put.json" >/dev/null
curl -sf "$API" -H "X-Api-Key: $PMKEY" -o "$TMP/after.json"
python3 - "$TMP/after.json" "$TMP/new.json" <<'EOF'
import json, sys
def count(p):
    d = json.load(open(p, encoding="utf-8")); c = d.get("collection", d)
    return sum(len(f["item"]) if "item" in f else 1 for f in c["item"])
a, n = count(sys.argv[1]), count(sys.argv[2])
print(f"Relu depuis Postman : {a} requêtes (attendu {n}) -> {'OK' if a == n else 'ECART'}")
sys.exit(0 if a == n else 1)
EOF
echo "Terminé. Pense à RÉVOQUER la clé API dans Postman (Settings -> API keys)."
