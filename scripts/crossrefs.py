#!/usr/bin/env python3
"""References externes a nos conversations (angle mort decouvert le 27 sept. avec simstudioai/sim#8355).

1. Issues/PR de tiers qui mentionnent @presendapp (une recherche).
2. Evenements "cross-referenced" dans la chronologie de nos issues/PR ouvertes et de celles de
   watch.txt : attrape un simple "Closes #N" sans mention.
Une reference absente de watch.txt est affichee NON SUIVIE."""
import json, re, subprocess
from pathlib import Path

ME = "presendapp"

def gh(args):
    r = subprocess.run(["gh", "api"] + args, capture_output=True, text=True)
    if r.returncode:
        return None
    try:
        return json.loads(r.stdout)
    except ValueError:
        return None

def search(q):
    items, page = [], 1
    while True:
        d = gh(["-X", "GET", "search/issues", "-f", "q=" + q, "-f", "per_page=100", "-f", "page=" + str(page)])
        if not d or not d.get("items"):
            break
        items += d["items"]
        if len(items) >= d.get("total_count", 0):
            break
        page += 1
    return items

def ref_of(url):
    m = re.search(r"repos/([^/]+/[^/]+)/(?:issues|pulls)/(\d+)", url)
    return m.group(1) + "#" + m.group(2) if m else url

watch = set()
for line in Path(__file__).with_name("watch.txt").read_text().splitlines():
    if line.strip() and not line.startswith("#"):
        watch.add(line.split()[0])

targets = {ref_of(i["url"]) for i in search("author:" + ME + " is:open")} | watch
found = {}
for it in search("mentions:" + ME + " -author:" + ME):
    found[ref_of(it["url"])] = (it["title"], it["state"], it["user"]["login"], "mention @" + ME)

for t in sorted(targets):
    repo, num = t.split("#")
    events = gh(["repos/" + repo + "/issues/" + num + "/timeline?per_page=100"])
    if not isinstance(events, list):
        continue
    for e in events:
        if e.get("event") != "cross-referenced":
            continue
        src = (e.get("source") or {}).get("issue") or {}
        who = (src.get("user") or {}).get("login", "?")
        if who == ME or not src.get("url"):
            continue
        r = ref_of(src["url"])
        if r != t:
            found.setdefault(r, (src.get("title", ""), src.get("state", "?"), who, "cite " + t))

if not found:
    print("  aucune reference externe")
for r, (title, state, who, via) in sorted(found.items()):
    tag = "suivie" if r in watch else "NON SUIVIE -> lire en entier et ajouter a watch.txt"
    print(f"  {r:40s} [{state}] {who[:16]:16s} {via} | {title[:45]} | {tag}")
print(f"  ({len(targets)} conversations examinees)")
