#!/usr/bin/env python3
"""
Traduit tools/disposable-email-checker.html dans les 7 langues.
Réutilise la logique de translate_new_landings.py avec délai anti rate-limit.
"""
import subprocess
import json
import time
from pathlib import Path

LANGS = {
    "fr": {"name": "French", "locale": "fr_FR"},
    "es": {"name": "Spanish", "locale": "es_ES"},
    "de": {"name": "German", "locale": "de_DE"},
    "pt": {"name": "Portuguese", "locale": "pt_BR"},
    "ja": {"name": "Japanese", "locale": "ja_JP"},
    "ru": {"name": "Russian", "locale": "ru_RU"},
    "hi": {"name": "Hindi", "locale": "hi_IN"},
}

SLUG = "disposable-email-checker"

def translate_text(text, target_lang, retries=4):
    if not text or len(text.strip()) < 2:
        return text
    stripped = text.strip()
    if stripped.startswith('http') or stripped.startswith('/') or stripped.startswith('<!--') or stripped.startswith('<') or stripped.startswith('{'):
        return text

    import urllib.parse
    encoded = urllib.parse.quote(text)

    for attempt in range(retries):
        try:
            result = subprocess.run(
                ['curl', '-s', f'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl={target_lang}&dt=t&q={encoded}'],
                capture_output=True, text=True, timeout=15
            )
            if result.returncode == 0 and result.stdout.strip():
                data = json.loads(result.stdout)
                if data and data[0]:
                    return ''.join(item[0] for item in data[0] if item[0])
        except Exception as e:
            print(f"    ⚠️  tentative {attempt+1}/{retries}: {e}")
        time.sleep(1.5 * (attempt + 1))
    print(f"    ❌ échec définitif pour: {text[:40]}...")
    return text

def translate_html(html, lang_code, lang_info):
    html = html.replace('<html lang="en">', f'<html lang="{lang_code}">')
    html = html.replace(f'href="https://presend.pages.dev/tools/{SLUG}"', f'href="https://presend.pages.dev/{lang_code}/tools/{SLUG}"')
    html = html.replace(f'https://presend.pages.dev/tools/{SLUG}', f'https://presend.pages.dev/{lang_code}/tools/{SLUG}')
    html = html.replace('href="/tools/', f'href="/{lang_code}/tools/')
    html = html.replace("href='/'", f"href='/{lang_code}/'")
    html = html.replace('href="../style.min.css"', 'href="../../style.min.css"')
    html = html.replace('href="/"', f'href="/{lang_code}/"')

    result = []
    i = 0
    n = len(html)
    while i < n:
        if html[i] == '<':
            end = html.find('>', i)
            if end == -1:
                result.append(html[i:])
                break
            result.append(html[i:end+1])
            i = end + 1
        else:
            end = html.find('<', i)
            if end == -1:
                text = html[i:]
                result.append(translate_text(text, lang_code))
                break
            text = html[i:end]
            result.append(translate_text(text, lang_code))
            i = end
    return ''.join(result)

def main():
    en_path = Path(f"tools/{SLUG}.html")
    html = en_path.read_text(encoding='utf-8')

    for lang_code, lang_info in LANGS.items():
        print(f"[{lang_code}] traduction en cours...", flush=True)
        out_dir = Path(f"{lang_code}/tools")
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / f"{SLUG}.html"

        translated = translate_html(html, lang_code, lang_info)
        out_path.write_text(translated, encoding='utf-8')
        print(f"  ✅ {out_path} ({len(translated)} chars)")

    print("\n🎉 Terminé.")

if __name__ == "__main__":
    main()
