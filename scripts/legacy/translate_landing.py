#!/usr/bin/env python3
import subprocess
import json
import re
from pathlib import Path

def translate(text, target_lang):
    """Traduire un texte via l'API Google Translate gratuite"""
    if not text or len(text.strip()) < 2:
        return text
    
    # Échapper les caractères spéciaux pour l'URL
    import urllib.parse
    encoded = urllib.parse.quote(text)
    
    try:
        result = subprocess.run(
            ['curl', '-s', f'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl={target_lang}&dt=t&q={encoded}'],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode == 0:
            data = json.loads(result.stdout)
            if data and data[0]:
                translated = ''.join([item[0] for item in data[0] if item[0]])
                return translated
    except Exception as e:
        print(f"Erreur traduction: {e}")
    
    return text  # Fallback

# Langues cibles
LANGS = {
    "de": "German",
    "es": "Spanish", 
    "fr": "French",
    "ja": "Japanese",
    "pt": "Portuguese"
}

# Landings EN à traduire
en_landings = sorted(Path("tools/landings").glob("*.html"))

print(f"Landings EN à traduire: {len(en_landings)}")
print(f"Langues cibles: {list(LANGS.keys())}")
print(f"Total landings à créer: {len(en_landings) * len(LANGS)}")
print("\nExemple de traduction (test):")
print(f"  EN: 'Remove GPS from Photo'")
for lang, name in LANGS.items():
    tr = translate("Remove GPS from Photo", lang)
    print(f"  {lang}: '{tr}'")
