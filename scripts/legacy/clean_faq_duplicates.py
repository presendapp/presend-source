#!/usr/bin/env python3
"""
Nettoie les fichiers HTML des landings :
1. Supprime le bloc FAQPage dupliqué (l'ancien, non traduit, compact).
2. Corrige les balises <script type="application/ld+json">> cassées (double >).
"""
import re
import sys
from pathlib import Path

SCRIPT_BLOCK_RE = re.compile(
    r'<script type="application/ld\+json">>?\s*\n?(.*?)</script>\s*\n?(<!--seo-faq-->\s*\n?)?',
    re.DOTALL
)

def clean_file(path: Path, dry_run: bool):
    text = path.read_text(encoding='utf-8')
    original = text

    matches = list(SCRIPT_BLOCK_RE.finditer(text))
    faq_matches = [m for m in matches if '"FAQPage"' in m.group(1) or "'FAQPage'" in m.group(1)]

    removed = 0
    if len(faq_matches) > 1:
        # On garde le premier (bien formaté), on supprime les suivants
        for m in faq_matches[1:]:
            text = text.replace(m.group(0), '', 1)
            removed += 1

    # Corrige les balises cassées restantes (double >)
    fixed_tags = text.count('application/ld+json">>')
    text = text.replace('application/ld+json">>', 'application/ld+json">')

    changed = text != original
    if changed and not dry_run:
        path.write_text(text, encoding='utf-8')

    return removed, fixed_tags, changed

def main():
    dry_run = '--apply' not in sys.argv
    tools = ["qr-code-scanner", "audio-metadata-remover", "password-breach-checker",
             "speech-to-text", "text-to-speech", "video-compressor",
             "background-remover", "screenshot-to-text"]
    langs = ["", "fr", "es", "de", "pt", "ja", "ru", "hi"]  # "" = EN (tools/)

    total_changed = 0
    for lang in langs:
        base = Path(lang) / "tools" if lang else Path("tools")
        for tool in tools:
            f = base / f"{tool}.html"
            if not f.exists():
                continue
            removed, fixed_tags, changed = clean_file(f, dry_run)
            if changed:
                total_changed += 1
                tag = "[DRY-RUN] " if dry_run else ""
                print(f"{tag}{f} : {removed} bloc(s) FAQPage dupliqué(s) supprimé(s), {fixed_tags} balise(s) corrigée(s)")

    print(f"\n{'[DRY-RUN] ' if dry_run else ''}Total: {total_changed} fichier(s) {'à modifier' if dry_run else 'modifiés'}.")
    if dry_run:
        print("Relance avec --apply pour appliquer réellement les changements.")

if __name__ == "__main__":
    main()
