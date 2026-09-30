#!/usr/bin/env python3
"""
Soumission automatique IndexNow — toutes les URLs du sitemap
À exécuter quotidiennement via cron
"""
import xml.etree.ElementTree as ET
import urllib.request
import json
import sys
from datetime import datetime

HOST = "presend.pages.dev"
KEY = "b04d97f5d6544ed29ea5991346a1105c2d8095452d21b1b00fb0dea6115dc288"
SITEMAP = "sitemap.xml"
BATCH_SIZE = 10000  # IndexNow accepte jusqu'à 10 000 URLs

def load_urls():
    tree = ET.parse(SITEMAP)
    root = tree.getroot()
    ns = {'ns': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
    return [loc.text for loc in root.findall('.//ns:loc', ns)]

def submit_batch(urls):
    payload = {
        "host": HOST,
        "key": KEY,
        "keyLocation": f"https://{HOST}/{KEY}.txt",
        "urlList": urls
    }
    
    req = urllib.request.Request(
        "https://api.indexnow.org/indexnow",
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return response.status
    except urllib.error.HTTPError as e:
        return e.code
    except Exception as e:
        print(f"Erreur: {e}")
        return 0

def main():
    urls = load_urls()
    print(f"[{datetime.now()}] {len(urls)} URLs à soumettre")
    
    # IndexNow accepte 10 000 URLs max par requête
    for i in range(0, len(urls), BATCH_SIZE):
        batch = urls[i:i+BATCH_SIZE]
        status = submit_batch(batch)
        print(f"  Batch {i//BATCH_SIZE + 1}: HTTP {status} ({len(batch)} URLs)")
    
    print(f"[{datetime.now()}] Soumission terminée")

if __name__ == "__main__":
    main()
