#!/usr/bin/env python3
"""
Traduit le bloc FAQPage (JSON-LD) des landings EN vers les langues manquantes,
avec délai + retry pour éviter le rate-limit de l'API Google Translate.
"""
import json
import re
import subprocess
import sys
import time
import urllib.parse
from pathlib import Path

LANGS = ["es", "de", "pt", "ja", "ru", "hi"]

TOOLS = [
    "qr-code-scanner", "audio-metadata-remover", "password-breach-checker",
    "speech-to-text", "text-to-speech", "video-compressor",
    "background-remover", "screenshot-to-text",
]

FAQ_BLOCK_RE = re.compile(
    r'(<script type="application/ld\+json">\s*\n?)(\{[^<]*?"@type":\s*"FAQPage"[^<]*?\})(\s*\n?</script>)',
    re.DOTALL
)

def translate_text(text, target_lang, retries=4):
    if not text or not text.strip():
        return text
    encoded = urllib.parse.quote(text)
    url = f'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl={target_lang}&dt=t&q={encoded}'
    for attempt in range(retries):
        try:
            result = subprocess.run(['curl', '-s', url], capture_output=True, text=True, timeout=15)
            if result.returncode == 0 and result.stdout.strip():
                data = json.loads(result.stdout)
                if data and data[0]:
                    return ''.join(item[0] for item in data[0] if item[0])
        except Exception as e:
            print(f"    ⚠️  tentative {attempt+1}/{retries} échouée: {e}")
        time.sleep(2 * (attempt + 1))  # backoff progressif
    raise RuntimeError(f"Échec de traduction après {retries} tentatives: {text[:50]}...")

def translate_faq_json(faq_obj, target_lang):
    for item in faq_obj["mainEntity"]:
        item["name"] = translate_text(item["name"], target_lang)
        time.sleep(1.5)
        item["acceptedAnswer"]["text"] = translate_text(item["acceptedAnswer"]["text"], target_lang)
        time.sleep(1.5)
    return faq_obj

def main():
    total = len(TOOLS) * len(LANGS)
    current = 0
    failures = []

    for lang in LANGS:
        for tool in TOOLS:
            current += 1
            en_path = Path(f"tools/{tool}.html")
            out_path = Path(f"{lang}/tools/{tool}.html")
            print(f"[{current}/{total}] {lang}/{tool}... ", end='', flush=True)

            if not out_path.exists():
                print("⚠️  fichier cible absent, ignoré")
                continue

            en_text = en_path.read_text(encoding='utf-8')
            m = FAQ_BLOCK_RE.search(en_text)
            if not m:
                print("❌ pas de bloc FAQPage trouvé dans la source EN")
                failures.append((lang, tool))
                continue

            try:
                faq_obj = json.loads(m.group(2))
                translated_obj = translate_faq_json(faq_obj, lang)
                new_json = json.dumps(translated_obj, ensure_ascii=False, indent=2)
            except Exception as e:
                print(f"❌ {e}")
                failures.append((lang, tool))
                continue

            out_text = out_path.read_text(encoding='utf-8')
            m_out = FAQ_BLOCK_RE.search(out_text)
            if not m_out:
                print("❌ pas de bloc FAQPage trouvé dans le fichier cible")
                failures.append((lang, tool))
                continue

            new_out_text = out_text[:m_out.start(2)] + new_json + out_text[m_out.end(2):]
            out_path.write_text(new_out_text, encoding='utf-8')
            print(f"✅ ({len(translated_obj['mainEntity'])} questions)")

    print(f"\n🎉 Terminé. {total - len(failures)}/{total} réussis.")
    if failures:
        print("Échecs :")
        for lang, tool in failures:
            print(f"  - {lang}/{tool}")

if __name__ == "__main__":
    main()
