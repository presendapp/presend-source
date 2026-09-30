#!/usr/bin/env python3
"""
Script unifié de soumission SEO :
- IndexNow (Bing, Yandex, Seznam, Naver, Yep)
- Ping sitemap (Yandex uniquement -- Google/Bing ont désactivé leurs
  endpoints de ping en 2022/2023, cf. audit du 29/08/2026)

Lit dynamiquement les URLs depuis sitemap.xml

NOTE (29/08/2026) : l'appel à l'API Google Indexing a été retiré. Cette API
est officiellement restreinte au contenu JobPosting/BroadcastEvent (aucun
sur ce site) et son usage pour du contenu générique risque une révocation
d'accès depuis la clarification de l'équipe Search Relations de Google
(mai 2025). sitemap.xml + IndexNow couvrent l'indexation légitimement.
"""
import xml.etree.ElementTree as ET
import json
import urllib.request
import urllib.error
import urllib.parse
import sys
import os
import time
from datetime import datetime
import pickle

# ─── CONFIG ─────────────────────────────────────────────────────────
SERVICE_ACCOUNT_FILE = "google-service-account.json"
SITEMAP_FILE = "sitemap.xml"
HOST = "presend.pages.dev"
SITE_URL = f"https://{HOST}"
INDEXNOW_KEY = "b04d97f5d6544ed29ea5991346a1105c2d8095452d21b1b00fb0dea6115dc288"

INDEXNOW_ENDPOINTS = [
    "https://api.indexnow.org/indexnow",
    "https://www.bing.com/indexnow",
    "https://yandex.com/indexnow",
]

QUOTA_FILE = ".indexing_quota_state.pkl"
GOOGLE_DAILY_LIMIT = 200
GOOGLE_DELAY = 3.0  # secondes entre chaque requête
GOOGLE_MAX_RETRIES = 3

# ─── UTILITAIRES ────────────────────────────────────────────────────
def load_sitemap_urls():
    try:
        tree = ET.parse(SITEMAP_FILE)
        root = tree.getroot()
        ns = {'ns': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
        urls = [loc.text for loc in root.findall('.//ns:loc', ns)]
        return urls
    except Exception as e:
        print(f"❌ Erreur lecture sitemap: {e}")
        sys.exit(1)

def load_quota_state():
    if not os.path.exists(QUOTA_FILE):
        return {"date": None, "urls": set(), "count": 0}
    try:
        with open(QUOTA_FILE, 'rb') as f:
            state = pickle.load(f)
        today = datetime.now().strftime('%Y-%m-%d')
        if state.get("date") != today:
            return {"date": today, "urls": set(), "count": 0}
        return state
    except:
        return {"date": datetime.now().strftime('%Y-%m-%d'), "urls": set(), "count": 0}

def save_quota_state(state):
    with open(QUOTA_FILE, 'wb') as f:
        pickle.dump(state, f)

def get_access_token():
    try:
        from google.oauth2 import service_account
        from google.auth.transport.requests import Request
        
        credentials = service_account.Credentials.from_service_account_file(
            SERVICE_ACCOUNT_FILE,
            scopes=['https://www.googleapis.com/auth/indexing']
        )
        credentials.refresh(Request())
        return credentials.token
    except ImportError:
        print("❌ Module google-auth non installé")
        print("   pip install google-auth google-auth-oauthlib")
        return None
    except Exception as e:
        print(f"❌ Erreur authentification: {e}")
        return None

# ─── GOOGLE INDEXING API ────────────────────────────────────────────
def submit_single_url(url, access_token, retry_count=0):
    """Soumet une URL avec retry et backoff exponentiel"""
    api_url = "https://indexing.googleapis.com/v3/urlNotifications:publish"
    payload = {"url": url, "type": "URL_UPDATED"}
    data = json.dumps(payload).encode('utf-8')
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {access_token}'
    }
    
    try:
        req = urllib.request.Request(api_url, data=data, headers=headers, method='POST')
        with urllib.request.urlopen(req, timeout=30) as response:
            return True, None
    except urllib.error.HTTPError as e:
        error = e.read().decode('utf-8')
        if e.code == 429 and retry_count < GOOGLE_MAX_RETRIES:
            # Backoff exponentiel : 5s, 10s, 20s
            wait = 5 * (2 ** retry_count)
            print(f"      ⚠️ 429 sur {url[:50]}... — retry dans {wait}s ({retry_count+1}/{GOOGLE_MAX_RETRIES})")
            time.sleep(wait)
            return submit_single_url(url, access_token, retry_count + 1)
        elif "Permission denied" in error:
            return False, "Permission denied (vérifiez Search Console)"
        else:
            return False, f"HTTP {e.code}"
    except Exception as e:
        return False, str(e)[:60]

def submit_to_google(urls, access_token):
    quota = load_quota_state()
    today = datetime.now().strftime('%Y-%m-%d')
    
    if quota["date"] != today:
        quota = {"date": today, "urls": set(), "count": 0}
    
    new_urls = [u for u in urls if u not in quota["urls"]]
    
    if not new_urls:
        print("   ℹ️ Toutes les URLs ont déjà été soumises aujourd'hui")
        return 0, 0
    
    remaining = GOOGLE_DAILY_LIMIT - quota["count"]
    if remaining <= 0:
        print(f"   ⚠️ Quota Google atteint ({GOOGLE_DAILY_LIMIT}/jour)")
        return 0, len(new_urls)
    
    to_submit = new_urls[:remaining]
    print(f"   📡 Soumission de {len(to_submit)} URLs (quota restant: {remaining}, délai: {GOOGLE_DELAY}s)...")
    
    success = 0
    failed = 0
    
    for i, url in enumerate(to_submit):
        ok, err = submit_single_url(url, access_token)
        if ok:
            quota["urls"].add(url)
            quota["count"] += 1
            success += 1
        else:
            failed += 1
            if err and "429" not in err:
                print(f"   ❌ {url[:60]}... → {err}")
        
        # Progression
        if (i + 1) % 10 == 0 or i == len(to_submit) - 1:
            print(f"      ... {i+1}/{len(to_submit)} (✅ {success} | ❌ {failed})")
        
        # Délai entre requêtes
        if i < len(to_submit) - 1:
            time.sleep(GOOGLE_DELAY)
    
    save_quota_state(quota)
    return success, failed

# ─── INDEXNOW ───────────────────────────────────────────────────────
def submit_to_indexnow(urls):
    payload = {
        "host": HOST,
        "key": INDEXNOW_KEY,
        "keyLocation": f"https://{HOST}/{INDEXNOW_KEY}.txt",
        "urlList": urls
    }
    
    data = json.dumps(payload).encode('utf-8')
    headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'User-Agent': 'Presend-IndexNow-Submitter/2.0'
    }
    
    success_endpoints = []
    failed_endpoints = []
    
    for endpoint in INDEXNOW_ENDPOINTS:
        try:
            req = urllib.request.Request(endpoint, data=data, headers=headers, method='POST')
            with urllib.request.urlopen(req, timeout=30) as response:
                status = response.status
                if status in [200, 202]:
                    success_endpoints.append(endpoint)
                else:
                    failed_endpoints.append(f"{endpoint} (status {status})")
        except urllib.error.HTTPError as e:
            failed_endpoints.append(f"{endpoint} (HTTP {e.code})")
        except Exception as e:
            failed_endpoints.append(f"{endpoint} ({str(e)[:40]})")
    
    return success_endpoints, failed_endpoints

# ─── PING SITEMAP ───────────────────────────────────────────────────
def ping_sitemap():
    sitemap_url = urllib.parse.quote(f"https://{HOST}/sitemap.xml")
    results = {}
    
    # Google (deprecated 2023, google.com/ping now returns 404) and Bing
    # (deprecated 2022, bing.com/ping now returns 410 Gone) have both
    # shut down their sitemap ping endpoints -- confirmed 29/08/2026.
    # Bing/Yandex real-time discovery is handled by IndexNow instead.
    # Yandex's ping endpoint has no recent confirmation either way, but
    # costs nothing to keep as a best-effort extra signal.
    engines = {
        "Yandex": f"https://webmaster.yandex.ru/ping?sitemap={sitemap_url}",
    }
    
    for name, url in engines.items():
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Presend-Ping/2.0'})
            with urllib.request.urlopen(req, timeout=30) as resp:
                results[name] = resp.status in [200, 202]
        except Exception as e:
            results[name] = False
    
    return results

# ─── MAIN ───────────────────────────────────────────────────────────
def main():
    print("=" * 70)
    print("🔍 SOUMISSION SEO UNIFIÉE — Presend")
    print(f"   {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)
    
    # 1. Charger les URLs du sitemap
    print("\n📄 Chargement du sitemap...")
    all_urls = load_sitemap_urls()
    print(f"   ✅ {len(all_urls)} URLs trouvées dans {SITEMAP_FILE}")
    
    # 2. Google Indexing API -- DÉSACTIVÉ (audit du 29/08/2026, voir docstring
    # en tête de fichier). Ne bloque plus l'exécution du reste du script :
    # IndexNow et le ping sitemap ci-dessous n'ont jamais eu besoin de ces
    # credentials et restent pleinement fonctionnels sans eux.
    g_success = 0
    if False:
        print("   ⚠️ Impossible d'obtenir le token Google")
        g_success = 0
    
    # 4. IndexNow
    print("\n" + "─" * 70)
    print("📡 2. INDEXNOW (Bing, Yandex, Seznam, Naver, Yep)")
    print("─" * 70)
    
    idx_success, idx_failed = submit_to_indexnow(all_urls)
    print(f"   ✅ Endpoints OK: {len(idx_success)}")
    for ep in idx_success:
        print(f"      • {ep.split('/')[2]}")
    if idx_failed:
        print(f"   ❌ Endpoints échoués: {len(idx_failed)}")
        for ep in idx_failed:
            print(f"      • {ep}")
    
    # 5. Ping sitemap
    print("\n" + "─" * 70)
    print("🔔 3. PING SITEMAP")
    print("─" * 70)
    
    ping_results = ping_sitemap()
    for name, ok in ping_results.items():
        icon = "✅" if ok else "❌"
        print(f"   {icon} {name}")
    
    # 6. Récapitulatif
    print("\n" + "=" * 70)
    print("📊 RÉCAPITULATIF")
    print("=" * 70)
    print(f"   URLs dans sitemap : {len(all_urls)}")
    print(f"   Google Indexing   : désactivé (hors périmètre officiel Google, voir en-tête du fichier)")
    print(f"   IndexNow          : {len(idx_success)}/{len(INDEXNOW_ENDPOINTS)} endpoints OK")
    print(f"   Ping sitemap      : {sum(ping_results.values())}/{len(ping_results)} moteurs")
    print("=" * 70)
    print("✅ Terminé !")
    print("=" * 70)

if __name__ == "__main__":
    main()
