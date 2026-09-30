#!/usr/bin/env python3
"""
Traduit les 8 nouveaux outils dans toutes les langues supportées.
Approche : parser le HTML, traduire le texte entre balises, préserver le code.
"""
import subprocess
import json
import re
import os
from pathlib import Path
from html.parser import HTMLParser

# ─── CONFIG ─────────────────────────────────────────────────────────
LANGS = {
    "fr": {"name": "French", "locale": "fr_FR", "back": "← Retour", "all_tools": "Tous les outils"},
    "es": {"name": "Spanish", "locale": "es_ES", "back": "← Volver", "all_tools": "Todas las herramientas"},
    "de": {"name": "German", "locale": "de_DE", "back": "← Zurück", "all_tools": "Alle Tools"},
    "pt": {"name": "Portuguese", "locale": "pt_BR", "back": "← Voltar", "all_tools": "Todas as ferramentas"},
    "ja": {"name": "Japanese", "locale": "ja_JP", "back": "← 戻る", "all_tools": "すべてのツール"},
    "ru": {"name": "Russian", "locale": "ru_RU", "back": "← Назад", "all_tools": "Все инструменты"},
    "hi": {"name": "Hindi", "locale": "hi_IN", "back": "← वापस", "all_tools": "सभी टूल्स"},
}

# Les 8 nouveaux outils à traduire
NEW_TOOLS = [
    "qr-code-scanner",
    "audio-metadata-remover", 
    "password-breach-checker",
    "speech-to-text",
    "text-to-speech",
    "video-compressor",
    "background-remover",
    "screenshot-to-text",
]

# ─── FONCTION DE TRADUCTION ─────────────────────────────────────────
def translate_text(text, target_lang):
    """Traduire un texte via l'API Google Translate gratuite"""
    if not text or len(text.strip()) < 2:
        return text
    if text.strip().startswith('http') or text.strip().startswith('/') or text.strip().startswith('<!--'):
        return text  # Ne pas traduire les URLs, chemins, commentaires HTML
    
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
        print(f"  ⚠️ Erreur traduction: {e}")
    
    return text

# ─── PARSER HTML POUR EXTRAIRE LE TEXTE ─────────────────────────────
class HTMLTextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.current_tag = None
        self.in_script = False
        self.in_style = False
        
    def handle_starttag(self, tag, attrs):
        self.current_tag = tag
        attrs_str = ' '.join([f'{k}="{v}"' for k, v in attrs])
        self.parts.append(('tag_start', f'<{tag} {attrs_str}>'.strip() + '>' if attrs_str else f'<{tag}>'))
        if tag in ('script', 'style'):
            self.in_script = (tag == 'script')
            self.in_style = (tag == 'style')
            
    def handle_endtag(self, tag):
        self.parts.append(('tag_end', f'</{tag}>'))
        if tag in ('script', 'style'):
            self.in_script = False
            self.in_style = False
            
    def handle_data(self, data):
        if self.in_script or self.in_style:
            self.parts.append(('code', data))
        else:
            self.parts.append(('text', data))
            
    def handle_comment(self, data):
        self.parts.append(('comment', f'<!--{data}-->'))

def translate_html(html_content, lang_code, lang_info):
    """Traduit le HTML en préservant la structure"""
    # Changer lang="en" → lang="xx"
    html_content = html_content.replace('<html lang="en">', f'<html lang="{lang_code}">')
    
    # Changer les liens canoniques et URLs
    html_content = html_content.replace('href="https://presend.pages.dev/tools/', f'href="https://presend.pages.dev/{lang_code}/tools/')
    html_content = html_content.replace('href="/tools/', f'href="/{lang_code}/tools/')
    html_content = html_content.replace('href="/"', f'href="/{lang_code}/"')
    html_content = html_content.replace('content="en_US"', f'content="{lang_info["locale"]}"')
    html_content = html_content.replace('href="../style.min.css"', 'href="../../style.min.css"')
    
    # Changer les textes de navigation
    html_content = html_content.replace('>All tools<', f'>{lang_info["all_tools"]}<')
    html_content = html_content.replace('>← Back<', f'>{lang_info["back"]}<')
    
    # Parser et traduire le texte
    parser = HTMLTextExtractor()
    try:
        parser.feed(html_content)
    except:
        # Fallback si le parsing échoue
        return html_content
    
    result = []
    for part_type, content in parser.parts:
        if part_type == 'text' and content.strip():
            # Traduire le texte
            translated = translate_text(content, lang_code)
            result.append(translated)
        else:
            result.append(content)
    
    return ''.join(result)

# ─── MAIN ───────────────────────────────────────────────────────────
def main():
    total = len(NEW_TOOLS) * len(LANGS)
    current = 0
    
    print(f"🌍 Traduction de {len(NEW_TOOLS)} outils dans {len(LANGS)} langues")
    print(f"   Total: {total} fichiers à créer\n")
    
    for tool in NEW_TOOLS:
        en_path = Path(f"tools/{tool}.html")
        if not en_path.exists():
            print(f"❌ Fichier source manquant: {en_path}")
            continue
            
        html = en_path.read_text(encoding='utf-8')
        
        for lang_code, lang_info in LANGS.items():
            current += 1
            print(f"[{current}/{total}] {tool} → {lang_code} ({lang_info['name']})... ", end='', flush=True)
            
            # Créer le dossier si nécessaire
            out_dir = Path(f"{lang_code}/tools")
            out_dir.mkdir(parents=True, exist_ok=True)
            
            # Traduire
            translated = translate_html(html, lang_code, lang_info)
            
            # Sauvegarder
            out_path = out_dir / f"{tool}.html"
            out_path.write_text(translated, encoding='utf-8')
            
            print(f"✅ ({len(translated)} chars)")
    
    print(f"\n🎉 Terminé ! {total} fichiers traduits.")

if __name__ == "__main__":
    main()
