#!/usr/bin/env python3
import subprocess
import json
import re
import urllib.parse
from pathlib import Path
import time

def translate(text, target_lang):
    """Traduire un texte via l'API Google Translate"""
    if not text or len(text.strip()) < 2:
        return text
    
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
    except Exception:
        pass
    
    return text

def translate_html(html, lang):
    """Traduire les éléments textuels d'une page HTML"""
    # Traduire le title
    def replace_title(m):
        return f'<title>{translate(m.group(1), lang)}</title>'
    html = re.sub(r'<title>(.*?)</title>', replace_title, html, flags=re.S)
    
    # Traduire meta description
    def replace_desc(m):
        prefix = m.group(1)
        text = m.group(2)
        suffix = m.group(3)
        return prefix + translate(text, lang) + suffix
    html = re.sub(r'(<meta[^>]*name=["\']description["\'][^>]*content=["\'])([^"\']*)(["\'])', replace_desc, html, flags=re.I)
    html = re.sub(r'(<meta[^>]*content=["\'])([^"\']*)(["\'][^>]*name=["\']description["\'])', replace_desc, html, flags=re.I)
    
    # Traduire meta keywords si présent
    def replace_kw(m):
        prefix = m.group(1)
        text = m.group(2)
        suffix = m.group(3)
        return prefix + translate(text, lang) + suffix
    html = re.sub(r'(<meta[^>]*name=["\']keywords["\'][^>]*content=["\'])([^"\']*)(["\'])', replace_kw, html, flags=re.I)
    
    # Traduire H1
    def replace_h1(m):
        inner = m.group(1)
        # Traduire le texte mais garder les balises internes
        text_only = re.sub(r'<[^>]+>', '', inner)
        translated = translate(text_only, lang)
        return f'<h1>{translated}</h1>'
    html = re.sub(r'<h1[^>]*>(.*?)</h1>', replace_h1, html, flags=re.S)
    
    # Traduire H2
    def replace_h2(m):
        inner = m.group(1)
        text_only = re.sub(r'<[^>]+>', '', inner)
        translated = translate(text_only, lang)
        return f'<h2>{translated}</h2>'
    html = re.sub(r'<h2[^>]*>(.*?)</h2>', replace_h2, html, flags=re.S)
    
    # Traduire les paragraphes (sauf ceux dans les scripts/styles)
    def replace_p(m):
        inner = m.group(1)
        # Ne pas traduire si contient du code ou des balises complexes
        if '<script' in inner or '<style' in inner or 'data-' in inner:
            return m.group(0)
        text_only = re.sub(r'<[^>]+>', '', inner)
        if len(text_only.strip()) > 5:
            translated = translate(text_only, lang)
            return f'<p>{translated}</p>'
        return m.group(0)
    
    # Traduire seulement les paragraphes courts (éviter les gros blocs)
    for m in re.finditer(r'<p>(.*?)</p>', html, re.S):
        inner = m.group(1)
        text_only = re.sub(r'<[^>]+>', '', inner)
        if 10 < len(text_only.strip()) < 200:
            translated = translate(text_only, lang)
            html = html.replace(m.group(0), f'<p>{translated}</p>', 1)
            time.sleep(0.1)  # Rate limiting
    
    # Traduire les liens texte (anchor text)
    def replace_a(m):
        inner = m.group(1)
        text_only = re.sub(r'<[^>]+>', '', inner)
        if len(text_only.strip()) > 3 and not text_only.startswith('http'):
            translated = translate(text_only, lang)
            return f'<a{translate(m.group(2), lang)}>{translated}</a>'
        return m.group(0)
    
    return html

# Configuration
LANGS = ["de", "es", "fr", "ja", "pt"]
en_landings = sorted(Path("tools/landings").glob("*.html"))

created = 0
errors = 0

for lang in LANGS:
    lang_dir = Path(f"{lang}/tools/landings")
    lang_dir.mkdir(parents=True, exist_ok=True)
    
    for landing in en_landings:
        target = lang_dir / landing.name
        
        # Skip if already exists
        if target.exists():
            continue
        
        try:
            html = landing.read_text(encoding="utf-8", errors="ignore")
            translated = translate_html(html, lang)
            target.write_text(translated, encoding="utf-8")
            created += 1
            print(f"✅ {lang}/{landing.name}")
            time.sleep(0.5)  # Rate limiting API
        except Exception as e:
            errors += 1
            print(f"❌ {lang}/{landing.name}: {e}")

print(f"\n=== RÉSULTAT ===")
print(f"Landings créées: {created}")
print(f"Erreurs: {errors}")
