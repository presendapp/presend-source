#!/usr/bin/env python3
"""
Traduit les 8 nouvelles landings dans les 7 langues via Google Translate API.
"""
import subprocess
import json
import re
from pathlib import Path

# ─── CONFIG ─────────────────────────────────────────────────────────
LANGS = {
    "fr": {"name": "French", "locale": "fr_FR"},
    "es": {"name": "Spanish", "locale": "es_ES"},
    "de": {"name": "German", "locale": "de_DE"},
    "pt": {"name": "Portuguese", "locale": "pt_BR"},
    "ja": {"name": "Japanese", "locale": "ja_JP"},
    "ru": {"name": "Russian", "locale": "ru_RU"},
    "hi": {"name": "Hindi", "locale": "hi_IN"},
}

NEW_LANDINGS = [
    "scan-qr-code-image",
    "remove-audio-metadata",
    "check-password-breach",
    "speech-to-text-transcription",
    "text-to-speech-converter",
    "compress-video-online",
    "remove-image-background",
    "extract-text-from-image",
]

# ─── FONCTION DE TRADUCTION ─────────────────────────────────────────
def translate_text(text, target_lang):
    if not text or len(text.strip()) < 2:
        return text
    # Ne pas traduire les URLs, chemins, codes, commentaires
    stripped = text.strip()
    if stripped.startswith('http') or stripped.startswith('/') or stripped.startswith('<!--') or stripped.startswith('<') or stripped.startswith('{'):
        return text
    
    import urllib.parse
    encoded = urllib.parse.quote(text)
    
    try:
        result = subprocess.run(
            ['curl', '-s', f'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl={target_lang}&dt=t&q={encoded}'],
            capture_output=True, text=True, timeout=15
        )
        if result.returncode == 0:
            data = json.loads(result.stdout)
            if data and data[0]:
                translated = ''.join([item[0] for item in data[0] if item[0]])
                return translated
    except Exception as e:
        print(f"  ⚠️ Erreur: {e}")
    
    return text

# ─── TRADUCTION HTML ────────────────────────────────────────────────
def translate_html(html, lang_code, lang_info):
    # Remplacements globaux
    html = html.replace('<html lang="en">', f'<html lang="{lang_code}">')
    html = html.replace('href="https://presend.pages.dev/tools/', f'href="https://presend.pages.dev/{lang_code}/tools/')
    html = html.replace('href="/tools/', f'href="/{lang_code}/tools/')
    html = html.replace('href="/"', f'href="/{lang_code}/"')
    html = html.replace('content="en_US"', f'content="{lang_info["locale"]}"')
    html = html.replace('href="../../style.min.css"', 'href="../../../style.min.css"')
    html = html.replace('>All tools<', f'>Tous les outils<' if lang_code == 'fr' else f'>All tools<')
    html = html.replace('>← Back<', f'>← Retour<' if lang_code == 'fr' else f'>← Back<')
    
    # Parser simple : traduire le texte entre balises
    result = []
    i = 0
    while i < len(html):
        if html[i] == '<':
            # Trouver la fin de la balise
            end = html.find('>', i)
            if end == -1:
                result.append(html[i:])
                break
            result.append(html[i:end+1])
            i = end + 1
        else:
            # C'est du texte, trouver la prochaine balise
            end = html.find('<', i)
            if end == -1:
                text = html[i:]
                result.append(translate_text(text, lang_code))
                break
            text = html[i:end]
            result.append(translate_text(text, lang_code))
            i = end
    
    return ''.join(result)

# ─── MAIN ───────────────────────────────────────────────────────────
def main():
    total = len(NEW_LANDINGS) * len(LANGS)
    current = 0
    
    print(f"🌍 Traduction de {len(NEW_LANDINGS)} landings dans {len(LANGS)} langues")
    print(f"   Total: {total} fichiers\n")
    
    for landing in NEW_LANDINGS:
        en_path = Path(f"tools/landings/{landing}.html")
        if not en_path.exists():
            print(f"❌ Landing source manquante: {en_path}")
            continue
            
        html = en_path.read_text(encoding='utf-8')
        
        for lang_code, lang_info in LANGS.items():
            current += 1
            print(f"[{current}/{total}] {landing} → {lang_code}... ", end='', flush=True)
            
            out_dir = Path(f"{lang_code}/tools/landings")
            out_dir.mkdir(parents=True, exist_ok=True)
            
            translated = translate_html(html, lang_code, lang_info)
            out_path = out_dir / f"{landing}.html"
            out_path.write_text(translated, encoding='utf-8')
            
            print(f"✅ ({len(translated)} chars)")
    
    print(f"\n🎉 Terminé ! {total} landings traduites.")

if __name__ == "__main__":
    main()
