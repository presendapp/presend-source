#!/usr/bin/env python3
"""Aligne <lang>/api.html sur api.html : insere les unites absentes (rubriques h2, sections
d'endpoint, cartes d'outils, note Python) apres l'unite qui les precede en anglais, et traduit
via un JSON {"texte anglais exact": "traduction", "__h2__": {"titre cible": "titre anglais"}}.
Usage : python3 scripts/i18n-api-sync.py <lang> [traductions.json] [--write]
Sans --write : rien n'est modifie ; affiche le plan et ecrit /tmp/i18n_<lang>_todo.json
(textes anglais encore sans traduction, y compris ceux deja presents non traduits)."""
import json, re, sys

START = re.compile(r'<h2\b|<h3 id="|class="tool-card"|id="python-user-agent"')
TEXT = re.compile(r'<(p|li|h2|span)\b[^>]*>(.*?)</(?:p|li|h2|span)>', re.S)

def units(lines):
    idx = [i for i, l in enumerate(lines) if START.search(l)]
    return [(i, idx[n + 1] if n + 1 < len(idx) else len(lines)) for n, i in enumerate(idx)]

LANG_PREFIX = re.compile(r'^/(?:fr|de|es|hi|ja|pt|ru)(?=/)')

def keyed(lines, h2map):
    """[(cle, debut, fin)] ; une carte est identifiee par son lien sans prefixe de langue."""
    out, seen = [], {}
    for i, j in units(lines):
        line = lines[i]
        m = re.search(r'<h2[^>]*>(.*?)</h2>', line)
        c = re.search(r'class="tool-card" href="([^"]*)"', line)
        if m:
            t = m.group(1).strip(); k = "h2:" + h2map.get(t, t)
        elif c:
            href = LANG_PREFIX.sub("", c.group(1)); seen[href] = seen.get(href, 0) + 1
            k = f"card:{href}#{seen[href]}"
        elif re.search(r'id="([^"]+)"', line):
            k = "id:" + re.search(r'id="([^"]+)"', line).group(1)
        else:
            k = "?:" + line.strip()[:50]
        out.append((k, i, j))
    return out

def strings(block):
    out = []
    for m in TEXT.finditer(block):
        s = m.group(2).strip()
        plain = re.sub(r"<[^>]+>", "", s).strip()
        if plain and re.search(r"[A-Za-z]{3}", plain) and not re.fullmatch(r"[\w./:@-]+", plain):
            out.append(s)
    return out

def translate(block, tr):
    for en in sorted(tr, key=len, reverse=True):
        if tr[en]:
            block = block.replace(en, tr[en])
    return block

def main():
    lang = sys.argv[1]
    tr_path = next((a for a in sys.argv[2:] if a.endswith(".json")), None)
    write = "--write" in sys.argv
    tr = json.load(open(tr_path, encoding="utf-8")) if tr_path else {}
    h2map = tr.pop("__h2__", {})
    en = open("api.html", encoding="utf-8").read().splitlines(keepends=True)
    path = f"{lang}/api.html"
    tg = open(path, encoding="utf-8").read().splitlines(keepends=True)
    tkeys = {}
    for k, i, j in keyed(tg, h2map):
        tkeys.setdefault(k, (i, j))
    print(f"== {lang} : titres h2 de la cible :", [re.sub(r"<[^>]+>", "", tg[i]).strip() for k, i, j in keyed(tg, h2map) if k.startswith("h2:")])
    inserts, todo, existing, anchor = {}, {}, {}, None
    en_strings = set()
    for k, i, j in keyed(en, {}):
        block = "".join(en[i:j])
        en_strings.update(strings(block))
        if k in tkeys:
            anchor = tkeys[k][1]
            continue
        if anchor is None:
            sys.exit(f"ERREUR : aucune unite connue avant {k}")
        for x in strings(block):
            if not tr.get(x):
                todo[x] = ""
        if k.startswith("card:"):
            block = re.sub(r'href="/(?!/)', f'href="/{lang}/', block)
        inserts.setdefault(anchor, []).append(translate(block, tr))
        print(f"  + {k:45} avant la ligne {anchor + 1} : {tg[anchor].strip()[:60] if anchor < len(tg) else '(fin)'}")
    for x in strings("".join(tg)):
        if x in en_strings and not tr.get(x):
            todo[x] = ""; existing[x] = ""
    for x in existing:
        print("  [deja present, reste en anglais] " + x)
    print(f"  {sum(len(v) for v in inserts.values())} unite(s) a inserer ; {len(todo)} texte(s) sans traduction ({sum(len(s) for s in todo)} caracteres)")
    json.dump(todo, open(f"/tmp/i18n_{lang}_todo.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    if not write:
        return
    if todo:
        sys.exit("REFUS d'ecrire : des textes n'ont pas de traduction (voir le fichier todo).")
    out = []
    for n, line in enumerate(tg):
        out += inserts.get(n, [])
        out.append(line)
    out += inserts.get(len(tg), [])
    text = translate("".join(out), tr)
    ids_en = re.findall(r'id="((?:GET|POST)-api-[^"]+)"', "".join(en))
    ids_tg = re.findall(r'id="((?:GET|POST)-api-[^"]+)"', text)
    assert ids_tg == ids_en, "ordre ou nombre des ancres different de l'anglais"
    open(path, "w", encoding="utf-8").write(text)
    print(f"  ECRIT : {path} ({len(ids_tg)} ancres, meme ordre que l'anglais)")

main()
