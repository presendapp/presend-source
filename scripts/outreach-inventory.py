#!/usr/bin/env python3
"""Inventaire en LECTURE SEULE des conversations ouvertes de presendapp (hors ses depots)
sans aucune reponse humaine : endpoints proposes, age, etoiles, activite du depot depuis
notre message (actif = push apres notre message : le mainteneur travaille mais n'a pas repondu).
Usage : python3 scripts/outreach-inventory.py"""
import json, re, subprocess, datetime, collections

def gh(*a):
    r = subprocess.run(["gh", "api", *a], capture_output=True, text=True)
    return json.loads(r.stdout) if r.returncode == 0 and r.stdout.strip() else None

eps = sorted((p.strip("/") for p in json.load(open("openapi.json"))["paths"]), key=len, reverse=True)
items = []
for page in (1, 2):
    res = gh(f"search/issues?q=author:presendapp+is:open+-user:presendapp&per_page=100&page={page}")
    items += (res or {}).get("items", [])
now = datetime.datetime.now(datetime.timezone.utc)
rows, by_ep = [], collections.Counter()
for it in items:
    repo = it["repository_url"].split("/repos/")[1]; n = it["number"]
    coms = gh(f"repos/{repo}/issues/{n}/comments?per_page=100") or []
    humans = [c for c in coms if c["user"]["login"] != "presendapp" and c["user"]["type"] != "Bot" and not c["user"]["login"].endswith("[bot]")]
    if it.get("pull_request"):
        humans += [r for r in (gh(f"repos/{repo}/pulls/{n}/reviews") or []) if r["user"]["login"] != "presendapp" and r["user"]["type"] != "Bot"]
    if humans:
        continue
    body = (it.get("body") or "") + " " + it["title"]
    found = [e for e in eps if re.search(rf"\b{re.escape(e)}\b", body)]
    found = [e for e in found if not any(e != o and e in o for o in found)]
    by_ep.update(found)
    info = gh(f"repos/{repo}") or {}
    created = datetime.datetime.fromisoformat(it["created_at"].replace("Z", "+00:00"))
    pushed = info.get("pushed_at")
    active = pushed and datetime.datetime.fromisoformat(pushed.replace("Z", "+00:00")) > created
    rows.append((it["created_at"][:10], "PR" if it.get("pull_request") else "iss", f"{repo}#{n}", info.get("stargazers_count", "?"), "actif" if active else "inactif", (now - created).days, ",".join(found) or "-", it["title"][:55]))
rows.sort()
print(f"{len(rows)} conversations ouvertes sans reponse humaine\n")
print(f"{'date':10} {'type':4} {'conversation':45} {'etoiles':>7} {'depot':8} {'age':>4}  endpoints proposes | titre")
for r in rows:
    print(f"{r[0]:10} {r[1]:4} {r[2]:45} {str(r[3]):>7} {r[4]:8} {r[5]:>4}  {r[6]} | {r[7]}")
print("\nendpoints proposes :", ", ".join(f"{e} x{c}" for e, c in by_ep.most_common()))
print("depots actifs depuis notre message :", sum(r[4] == "actif" for r in rows), "/", len(rows))
