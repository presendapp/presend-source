#!/usr/bin/env python3
"""
Vérifie que toutes les URLs du sitemap.xml retournent un code HTTP valide
(200-399). Signale les liens morts (404, 5xx, timeout, erreur réseau).

Usage: python3 check_broken_links.py
Sortie non-zéro si des liens cassés sont trouvés (pour intégration CI).
"""
import xml.etree.ElementTree as ET
import sys
import time
import urllib.request
import urllib.error
import concurrent.futures

SITEMAP_FILE = "sitemap.xml"
TIMEOUT = 10
MAX_WORKERS = 10
USER_AGENT = "Presend-LinkChecker/1.0 (+https://presend.pages.dev)"

def load_sitemap_urls():
    tree = ET.parse(SITEMAP_FILE)
    root = tree.getroot()
    ns = {'ns': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
    return [loc.text for loc in root.findall('.//ns:loc', ns)]

def check_url(url):
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT}, method='HEAD')
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return url, resp.status, None
    except urllib.error.HTTPError as e:
        if e.code == 405:  # certaines routes refusent HEAD, retenter en GET
            try:
                req2 = urllib.request.Request(url, headers={'User-Agent': USER_AGENT}, method='GET')
                with urllib.request.urlopen(req2, timeout=TIMEOUT) as resp2:
                    return url, resp2.status, None
            except urllib.error.HTTPError as e2:
                return url, e2.code, str(e2)
            except Exception as e2:
                return url, None, str(e2)
        return url, e.code, str(e)
    except Exception as e:
        return url, None, str(e)

def main():
    urls = load_sitemap_urls()
    print(f"🔗 Vérification de {len(urls)} URLs du sitemap...\n")

    broken = []
    checked = 0

    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(check_url, url): url for url in urls}
        for future in concurrent.futures.as_completed(futures):
            url, status, error = future.result()
            checked += 1
            if status is None or status >= 400:
                broken.append((url, status, error))
                print(f"  ❌ {url} -> {status or 'ERREUR'} {error or ''}")
            if checked % 100 == 0:
                print(f"  ... {checked}/{len(urls)} vérifiées")

    print(f"\n{'=' * 60}")
    print(f"📊 Résultat: {len(urls) - len(broken)}/{len(urls)} OK, {len(broken)} cassées")
    print(f"{'=' * 60}")

    if broken:
        print("\nDétail des liens cassés:")
        for url, status, error in broken:
            print(f"  - {url} ({status or 'erreur réseau'}: {error or ''})")
        sys.exit(1)
    else:
        print("✅ Aucun lien mort trouvé")
        sys.exit(0)

if __name__ == "__main__":
    main()
