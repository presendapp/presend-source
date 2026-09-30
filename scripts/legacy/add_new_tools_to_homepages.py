#!/usr/bin/env python3
"""
Ajoute les 9 outils manquants (lot 1 + disposable-email-checker) aux homepages
traduites (fr/es/de/pt/ja/ru/hi), en réutilisant les traductions déjà présentes
dans <lang>/tools/<slug>.html (h1 + meta description). Aucun appel API.
"""
import re
from pathlib import Path

LANGS = ["fr", "es", "de", "pt", "ja", "ru", "hi"]

SECTION_TITLES = {
    "fr": "Nouveaux outils", "es": "Nuevas herramientas", "de": "Neue Tools",
    "pt": "Novas ferramentas", "ja": "新しいツール", "ru": "Новые инструменты",
    "hi": "नए उपकरण",
}
OPEN_LABEL = {
    "fr": "Ouvrir →", "es": "Abrir →", "de": "Öffnen →",
    "pt": "Abrir →", "ja": "開く →", "ru": "Открыть →", "hi": "खोलें →",
}

TOOLS = [
    ("qr-code-scanner", 23), ("audio-metadata-remover", 24),
    ("password-breach-checker", 25), ("speech-to-text", 26),
    ("text-to-speech", 27), ("video-compressor", 28),
    ("background-remover", 29), ("screenshot-to-text", 30),
    ("disposable-email-checker", 31),
]

H1_RE = re.compile(r'<h1[^>]*>([^<]*)</h1>')
DESC_RE = re.compile(r'<meta name="description" content="([^"]*)"')

def get_translated_title_desc(lang, slug):
    f = Path(lang) / "tools" / f"{slug}.html"
    if not f.exists():
        return None, None
    text = f.read_text(encoding="utf-8")
    h1 = H1_RE.search(text)
    desc = DESC_RE.search(text)
    title = h1.group(1).strip() if h1 else slug
    description = desc.group(1).strip() if desc else ""
    # Coupe la description si trop longue pour une carte
    if len(description) > 110:
        description = description[:107].rsplit(' ', 1)[0] + "..."
    return title, description

def build_section(lang):
    cards = []
    for slug, _ in TOOLS:
        title, desc = get_translated_title_desc(lang, slug)
        if title is None:
            print(f"  ⚠️  {lang}/{slug} : fichier traduit introuvable, ignoré")
            continue
        cards.append(
            f'<a class="tool-card" href="/{lang}/tools/{slug}">\n'
            f'<div><h3>{title}</h3><p>{desc}</p></div>\n'
            f'<span class="go">{OPEN_LABEL[lang]}</span>\n'
            f'</a>'
        )
    cards_html = "\n".join(cards)
    return (
        f'<section class="wrap">\n'
        f'<h2 style="font-family: var(--font-display); font-size:1.25rem; margin: 2.5rem 0 1rem;">{SECTION_TITLES[lang]}</h2>\n'
        f'<div class="tool-grid">\n{cards_html}\n</div>\n'
        f'</section>\n'
    )

def update_itemlist(text, lang):
    # Trouve la dernière position existante dans le ItemList
    positions = [int(m) for m in re.findall(r'"position":(\d+)', text)]
    if not positions:
        print(f"  ⚠️  Pas de ItemList trouvé pour {lang}")
        return text
    last_pos = max(positions)

    # Trouve la dernière entrée ListItem pour insérer après (ajout d'une virgule)
    last_item_re = re.compile(r'(\{"@type":"ListItem","position":' + str(last_pos) + r'[^}]*\})(\s*\n\s*\])')
    m = last_item_re.search(text)
    if not m:
        print(f"  ⚠️  Impossible de localiser la dernière entrée ListItem pour {lang}")
        return text

    new_entries = []
    pos = last_pos
    for slug, _ in TOOLS:
        title, _ = get_translated_title_desc(lang, slug)
        if title is None:
            continue
        pos += 1
        new_entries.append(f'    {{"@type":"ListItem","position":{pos},"url":"https://presend.pages.dev/{lang}/tools/{slug}","name":"{title}"}}')

    replacement = m.group(1) + ",\n" + ",\n".join(new_entries) + m.group(2)
    return text[:m.start()] + replacement + text[m.end():]

def main():
    for lang in LANGS:
        print(f"[{lang}]")
        f = Path(lang) / "index.html"
        text = f.read_text(encoding="utf-8")

        anchor = '<section class="wrap" id="how-it-works">'
        if anchor not in text:
            print(f"  ❌ Point d'insertion introuvable dans {f}")
            continue
        if SECTION_TITLES[lang] in text:
            print(f"  ⏭️  Section déjà présente, ignoré")
            continue

        section_html = build_section(lang)
        text = text.replace(anchor, section_html + anchor, 1)
        text = update_itemlist(text, lang)

        f.write_text(text, encoding="utf-8")
        print(f"  ✅ {f} mis à jour")

    print("\n🎉 Terminé.")

if __name__ == "__main__":
    main()
