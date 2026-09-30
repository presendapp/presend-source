#!/usr/bin/env python3
"""
Soumission d'URLs à Bing via l'API officielle Bing Webmaster Tools
(SubmitUrlbatch) -- endpoint légitime, sans restriction de type de
contenu, contrairement à l'API Google Indexing (voir daily_seo.py).

Nécessite la variable d'environnement BING_API_KEY (jamais stockée
en dur dans ce fichier ni committée).

Lit dynamiquement les URLs depuis sitemap.xml.
"""
import xml.etree.ElementTree as ET
import json
import os
import sys
import urllib.request
import urllib.error

SITEMAP_FILE = "sitemap.xml"
SITE_URL = "https://presend.pages.dev"
BATCH_SIZE = 500  # limite officielle Bing par requête

def log(msg):
    print(msg, flush=True)

def load_sitemap_urls():
    tree = ET.parse(SITEMAP_FILE)
    root = tree.getroot()
    ns = {'ns': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
    return [loc.text for loc in root.findall('.//ns:loc', ns)]

def get_quota(api_key):
    url = f"https://ssl.bing.com/webmaster/api.svc/json/GetUrlSubmissionQuota?apikey={api_key}&siteUrl={urllib.parse.quote(SITE_URL)}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode('utf-8'))['d']

def submit_batch(api_key, urls):
    endpoint = f"https://ssl.bing.com/webmaster/api.svc/json/SubmitUrlbatch?apikey={api_key}"
    payload = {"siteUrl": SITE_URL, "urlList": urls}
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        endpoint, data=data,
        headers={'Content-Type': 'application/json; charset=utf-8'},
        method='POST'
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return True, None
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')
        return False, f"HTTP {e.code}: {body[:200]}"
    except Exception as e:
        return False, str(e)[:200]

def main():
    api_key = os.environ.get("BING_API_KEY")
    if not api_key:
        log("❌ Variable d'environnement BING_API_KEY absente. Rien à faire.")
        sys.exit(0)  # non-fatal : ne bloque pas le reste du pipeline

    log("=" * 60)
    log("📡 SOUMISSION BING WEBMASTER API")
    log("=" * 60)

    urls = load_sitemap_urls()
    log(f"📄 {len(urls)} URLs trouvées dans {SITEMAP_FILE}")

    try:
        quota = get_quota(api_key)
        log(f"📊 Quota Bing -- quotidien: {quota['DailyQuota']}, mensuel: {quota['MonthlyQuota']}")
    except Exception as e:
        log(f"⚠️ Impossible de lire le quota: {e}")
        quota = {"DailyQuota": BATCH_SIZE}

    daily_limit = min(quota.get("DailyQuota", BATCH_SIZE), BATCH_SIZE)
    to_submit = urls[:daily_limit]
    log(f"📤 Soumission de {len(to_submit)} URLs (limité par le quota quotidien)...")

    ok, err = submit_batch(api_key, to_submit)
    if ok:
        log(f"✅ Lot soumis avec succès ({len(to_submit)} URLs)")
    else:
        log(f"❌ Échec de la soumission: {err}")

    log("=" * 60)

if __name__ == "__main__":
    main()
