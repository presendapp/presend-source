#!/usr/bin/env python3
"""
Génération automatique du sitemap.xml à partir des fichiers HTML présents.
À exécuter avant chaque déploiement.
"""
import os
import re
import subprocess
from datetime import datetime

HOST = "https://presend.pages.dev"
EXCLUDE_DIRS = {'.git', 'node_modules', '__pycache__', '.wrangler', 'venv', 'vendor', 'css', 'js', 'functions', 'stats'}
EXCLUDE_FILES = {'404.html', 'embed.html', 'admin.html', 'template.html'}
EXCLUDE_PATTERNS = [r'\.backup-']

# Priorités par type de page
PRIORITIES = {
    'index.html': 1.0,
    'blog/': 0.9,  # Blog = haute priorité (contenu frais)
    'tools/': 0.8,
    'guides/': 0.7,
    'landings/': 0.6,
    'about.html': 0.5,
    'faq.html': 0.5,
    'privacy.html': 0.3,
    'alternatives.html': 0.4,
}

# Changefreq par type
CHANGEFREQ = {
    'index.html': 'weekly',
    'blog/': 'weekly',  # Blog mis à jour régulièrement
    'tools/': 'weekly',
    'guides/': 'monthly',
    'landings/': 'monthly',
    'about.html': 'monthly',
    'faq.html': 'monthly',
    'privacy.html': 'yearly',
    'alternatives.html': 'monthly',
}

def should_exclude(path):
    for excl in EXCLUDE_DIRS:
        if f'/{excl}/' in path or path.startswith(f'{excl}/'):
            return True
    
    basename = os.path.basename(path)
    if basename in EXCLUDE_FILES:
        return True
    
    for pattern in EXCLUDE_PATTERNS:
        if re.search(pattern, path):
            return True
    
    if not path.endswith('.html'):
        return True
    
    return False

def get_priority(path):
    if path == 'index.html':
        return 1.0
    for key, val in PRIORITIES.items():
        if key == 'index.html':
            continue
        if key.endswith('/') and key in path:
            return val
        if key in path:
            return val
    return 0.5

def get_changefreq(path):
    for key, val in CHANGEFREQ.items():
        if key.endswith('/') and key in path:
            return val
        if key in path:
            return val
    return 'monthly'

def get_lastmod(filepath):
    # Le mtime du système de fichiers ne vaut rien en CI : git checkout
    # remet tous les fichiers à l'heure du clone, pas à leur vraie date
    # de dernière modification. L'historique git est la seule source fiable.
    try:
        result = subprocess.run(
            ['git', 'log', '-1', '--format=%cd', '--date=short', '--', filepath],
            capture_output=True, text=True, timeout=5,
        )
        date = result.stdout.strip()
        if date:
            return date
    except Exception:
        pass
    # Repli : fichier non suivi par git (nouveau, pas encore commité)
    try:
        mtime = os.path.getmtime(filepath)
        return datetime.fromtimestamp(mtime).strftime('%Y-%m-%d')
    except Exception:
        return datetime.now().strftime('%Y-%m-%d')

def path_to_url(relpath):
    url_path = relpath.replace('\\', '/')
    if url_path.startswith('./'):
        url_path = url_path[2:]
    if url_path.endswith('.html'):
        url_path = url_path[:-5]
    
    if url_path == 'index':
        return HOST + '/'
    if url_path.endswith('/index'):
        url_path = url_path[:-5]
        if not url_path.endswith('/'):
            url_path += '/'
        return HOST + '/' + url_path
    
    return HOST + '/' + url_path

def generate_sitemap():
    urls = []
    
    for root, dirs, files in os.walk('.'):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS and not d.startswith('.')]
        
        for file in files:
            filepath = os.path.join(root, file)
            relpath = os.path.relpath(filepath, '.')
            
            if should_exclude(relpath):
                continue
            
            url = path_to_url(relpath)
            priority = get_priority(relpath)
            changefreq = get_changefreq(relpath)
            lastmod = get_lastmod(filepath)
            
            urls.append({
                'loc': url,
                'lastmod': lastmod,
                'changefreq': changefreq,
                'priority': priority
            })
    
    # Supprimer les doublons
    seen = set()
    unique_urls = []
    for u in urls:
        if u['loc'] not in seen:
            seen.add(u['loc'])
            unique_urls.append(u)
    
    # Trier : index d'abord, puis blog, puis par priorité décroissante
    def sort_key(u):
        is_root = u['loc'] == HOST + '/'
        is_blog = '/blog/' in u['loc'] and not u['loc'].endswith('/blog/')
        is_blog_index = u['loc'] == HOST + '/blog/'
        return (-int(is_root), -int(is_blog_index), -int(is_blog), -u['priority'], u['loc'])
    
    unique_urls.sort(key=sort_key)
    
    xml_lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    
    for url in unique_urls:
        xml_lines.append('  <url>')
        xml_lines.append(f'    <loc>{url["loc"]}</loc>')
        xml_lines.append(f'    <lastmod>{url["lastmod"]}</lastmod>')
        xml_lines.append(f'    <changefreq>{url["changefreq"]}</changefreq>')
        xml_lines.append(f'    <priority>{url["priority"]}</priority>')
        xml_lines.append('  </url>')
    
    xml_lines.append('</urlset>')
    
    sitemap_content = '\n'.join(xml_lines) + '\n'
    
    with open('sitemap.xml', 'w', encoding='utf-8') as f:
        f.write(sitemap_content)
    
    return len(unique_urls)

def main():
    print("=" * 60)
    print("🗺️  GÉNÉRATION DU SITEMAP.XML")
    print("=" * 60)
    
    count = generate_sitemap()
    
    print(f"\n✅ Sitemap généré : {count} URLs")
    print(f"   📄 Fichier : sitemap.xml")
    print(f"   🌐 Host : {HOST}")
    
    # Répartition
    print("\n📊 Répartition :")
    
    categories = {
        'Pages principales (/)': 0,
        'Blog (/blog/)': 0,
        'Outils (/tools/)': 0,
        'Guides (/guides/)': 0,
        'Landings (/landings/)': 0,
        'Pages traduites (/fr/, /de/, etc.)': 0,
        'Autres': 0,
    }
    
    with open('sitemap.xml', 'r') as f:
        content = f.read()
    
    for line in content.split('\n'):
        if '<loc>' not in line:
            continue
        url = line.replace('<loc>', '').replace('</loc>', '').strip()
        
        if '/blog/' in url:
            categories['Blog (/blog/)'] += 1
        elif '/tools/landings/' in url:
            categories['Landings (/landings/)'] += 1
        elif '/tools/' in url:
            categories['Outils (/tools/)'] += 1
        elif '/guides/' in url:
            categories['Guides (/guides/)'] += 1
        elif any(f'/{lang}/' in url for lang in ['fr', 'de', 'es', 'pt', 'ru', 'ja', 'hi']):
            categories['Pages traduites (/fr/, /de/, etc.)'] += 1
        elif url == HOST + '/' or url.endswith(('/about', '/faq', '/privacy', '/alternatives')):
            categories['Pages principales (/)'] += 1
        else:
            categories['Autres'] += 1
    
    for cat, num in categories.items():
        if num > 0:
            print(f"   • {cat}: {num}")
    
    print("\n" + "=" * 60)

if __name__ == "__main__":
    main()
