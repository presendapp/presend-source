#!/usr/bin/env python3
"""
SEO Quotidien Intelligent — Presend
====================================
1. Génère le blog auto (generate_blog.py)
2. Génère le sitemap (generate_sitemap.py)
3. Détecte les fichiers HTML modifiés dans les dernières 24h → priorité Google
4. Cycle rotatif sur les URLs restantes (max 200/jour pour Google)
5. Soumet TOUT le sitemap à IndexNow (pas de quota strict)
6. Ping les moteurs
7. Log propre dans /tmp/presend_daily_seo.log

Cron quotidien :
    0 9 * * * cd /path/to/presend && python3 daily_seo.py >> /tmp/presend_daily_seo.log 2>&1
"""
import xml.etree.ElementTree as ET
import json
import urllib.request
import urllib.error
import urllib.parse
import sys
import os
import time
import subprocess
from datetime import datetime, timedelta
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
ROTATION_FILE = ".indexing_rotation_state.pkl"
GOOGLE_DAILY_LIMIT = 200
GOOGLE_DELAY = 3.0
GOOGLE_MAX_RETRIES = 3

LOG_FILE = "/tmp/presend_daily_seo.log"

# ─── LOGGING ────────────────────────────────────────────────────────
def log(msg):
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    line = f"[{timestamp}] {msg}"
    print(line)
    with open(LOG_FILE, 'a', encoding='utf-8') as f:
        f.write(line + '\n')

# ─── ÉTAPE 0 : GÉNÉRATION BLOG + SITEMAP ───────────────────────────
def regenerate_content():
    """Régénère le blog et le sitemap"""
    log("🗺️  Étape 0a : Génération du blog...")
    try:
        result = subprocess.run(['python3', 'generate_blog.py'], capture_output=True, text=True, cwd='.')
        if result.returncode == 0:
            log("   ✅ Blog généré")
        else:
            log(f"   ⚠️ Blog : {result.stderr[:100]}")
    except Exception as e:
        log(f"   ⚠️ Erreur blog : {e}")
    
    log("🗺️  Étape 0b : Génération du sitemap...")
    try:
        result = subprocess.run(['python3', 'generate_sitemap.py'], capture_output=True, text=True, cwd='.')
        if result.returncode == 0:
            # Extraire le nombre d'URLs
            for line in result.stdout.split('\n'):
                if 'URLs' in line:
                    log(f"   {line.strip()}")
                    break
        else:
            log(f"   ⚠️ Sitemap : {result.stderr[:100]}")
    except Exception as e:
        log(f"   ⚠️ Erreur sitemap : {e}")

# ─── UTILITAIRES ────────────────────────────────────────────────────
def load_sitemap_urls():
    try:
        tree = ET.parse(SITEMAP_FILE)
        root = tree.getroot()
        ns = {'ns': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
        urls = [loc.text for loc in root.findall('.//ns:loc', ns)]
        return urls
    except Exception as e:
        log(f"❌ Erreur lecture sitemap: {e}")
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

def load_rotation_state():
    if not os.path.exists(ROTATION_FILE):
        return {"index": 0}
    try:
        with open(ROTATION_FILE, 'rb') as f:
            return pickle.load(f)
    except:
        return {"index": 0}

def save_rotation_state(state):
    with open(ROTATION_FILE, 'wb') as f:
        pickle.dump(state, f)

def get_recently_modified_urls(hours=24):
    """Détecte les fichiers HTML modifiés dans les dernières N heures via git"""
    cutoff = datetime.now() - timedelta(hours=hours)
    recent = []
    
    try:
        result = subprocess.run(
            ['git', 'log', '--since', f'{hours} hours ago', '--name-only', '--pretty=format:'],
            capture_output=True, text=True, cwd='.'
        )
        files = set(f.strip() for f in result.stdout.split('\n') if f.strip().endswith('.html'))
        
        for f in files:
            url_path = f.replace('\\', '/')
            if url_path.startswith('./'):
                url_path = url_path[2:]
            if url_path.endswith('.html'):
                url_path = url_path[:-5]
            if url_path == 'index':
                url = SITE_URL + '/'
            elif url_path.endswith('/index'):
                url = SITE_URL + '/' + url_path[:-5]
            else:
                url = SITE_URL + '/' + url_path
            
            recent.append(url)
    except Exception as e:
        log(f"⚠️ Impossible de détecter les modifs récentes: {e}")
    
    return list(set(recent))

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
        log("❌ Module google-auth non installé")
        return None
    except Exception as e:
        log(f"❌ Erreur authentification: {e}")
        return None

# ─── GOOGLE INDEXING API ────────────────────────────────────────────
def submit_single_url(url, access_token, retry_count=0):
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
        if e.code == 429:
            # 429 sur l'Indexing API = quota journalier épuisé côté serveur.
            # Retenter dans la même minute est inutile : le quota ne se régénère
            # pas en quelques secondes. On échoue immédiatement et on laisse
            # le coupe-circuit de submit_to_google() arrêter la boucle globale.
            return False, "HTTP 429"
        elif "Permission denied" in error:
            return False, "Permission denied"
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
        log("   ℹ️ Toutes les URLs ont déjà été soumises aujourd'hui")
        return 0, 0
    
    remaining = GOOGLE_DAILY_LIMIT - quota["count"]
    if remaining <= 0:
        log(f"   ⚠️ Quota Google atteint ({GOOGLE_DAILY_LIMIT}/jour)")
        return 0, len(new_urls)
    
    to_submit = new_urls[:remaining]
    log(f"   📡 Soumission de {len(to_submit)} URLs (quota restant: {remaining})...")
    
    success = 0
    failed = 0
    consecutive_429 = 0
    CIRCUIT_BREAKER_THRESHOLD = 3
    
    for i, url in enumerate(to_submit):
        ok, err = submit_single_url(url, access_token)
        if ok:
            quota["urls"].add(url)
            quota["count"] += 1
            success += 1
            consecutive_429 = 0
        else:
            failed += 1
            if err == "HTTP 429":
                consecutive_429 += 1
            else:
                consecutive_429 = 0
            if err and "429" not in err:
                log(f"   ❌ {url[:60]}... → {err}")
        
        if consecutive_429 >= CIRCUIT_BREAKER_THRESHOLD:
            log(f"   🛑 {CIRCUIT_BREAKER_THRESHOLD} échecs 429 consécutifs — quota probablement épuisé côté serveur, arrêt immédiat")
            failed += len(to_submit) - (i + 1)
            quota["count"] = GOOGLE_DAILY_LIMIT
            break
        
        if (i + 1) % 10 == 0 or i == len(to_submit) - 1:
            log(f"      ... {i+1}/{len(to_submit)} (✅ {success} | ❌ {failed})")
        
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
    
    # Google (deprecated 2023, returns 404) and Bing (deprecated 2022,
    # returns 410) shut down their sitemap ping endpoints -- confirmed
    # 29/08/2026. Real-time discovery for both is handled by IndexNow.
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
    log("=" * 60)
    log("🤖 DAILY SEO — Presend")
    log("=" * 60)
    
    # 0. Régénérer blog + sitemap
    regenerate_content()
    
    # 1. Charger les URLs
    all_urls = load_sitemap_urls()
    log(f"📄 Sitemap chargé : {len(all_urls)} URLs")
    
    # 2. URLs modifiées récemment (prioritaires)
    recent_urls = get_recently_modified_urls(24)
    log(f"📝 URLs modifiées récemment : {len(recent_urls)}")
    for u in recent_urls[:5]:
        log(f"   • {u}")
    
    # 3. Cycle rotatif pour le reste
    rotation = load_rotation_state()
    non_recent = [u for u in all_urls if u not in recent_urls]
    
    if recent_urls:
        google_urls = recent_urls + non_recent
    else:
        idx = rotation.get("index", 0) % len(non_recent) if non_recent else 0
        google_urls = non_recent[idx:] + non_recent[:idx]
        rotation["index"] = (idx + GOOGLE_DAILY_LIMIT) % max(len(non_recent), 1)
        save_rotation_state(rotation)
    
    # 4. Google Indexing API — DÉSACTIVÉ (audit du 29/08/2026).
    # Google restreint officiellement cette API aux pages JobPosting et
    # BroadcastEvent (VideoObject). Depuis la clarification de l'équipe
    # Search Relations en mai 2025, l'utiliser pour du contenu générique
    # (comme nos pages d'outils) est hors périmètre officiel, sans bénéfice
    # garanti, et expose le compte de service à un risque de révocation.
    # Le sitemap.xml (généré ci-dessus) et IndexNow (juste après) couvrent
    # l'indexation de façon légitime et sans restriction de contenu.
    log("\n" + "─" * 60)
    log("🔑 GOOGLE INDEXING API — désactivé (hors périmètre officiel Google)")
    log("─" * 60)
    g_success = 0
    
    # 5. IndexNow (TOUT le sitemap)
    log("\n" + "─" * 60)
    log("📡 INDEXNOW")
    log("─" * 60)
    
    idx_success, idx_failed = submit_to_indexnow(all_urls)
    log(f"   ✅ Endpoints OK: {len(idx_success)}")
    for ep in idx_success:
        log(f"      • {ep.split('/')[2]}")
    if idx_failed:
        log(f"   ❌ Échoués: {len(idx_failed)}")
    
    # 6. Ping
    log("\n" + "─" * 60)
    log("🔔 PING SITEMAP")
    log("─" * 60)
    
    ping_results = ping_sitemap()
    for name, ok in ping_results.items():
        log(f"   {'✅' if ok else '❌'} {name}")
    
    # 7. Récap
    quota = load_quota_state()
    remaining = GOOGLE_DAILY_LIMIT - quota["count"]
    
    log("\n" + "=" * 60)
    log("📊 RÉCAPITULATIF")
    log("=" * 60)
    log(f"   URLs sitemap      : {len(all_urls)}")
    log(f"   URLs récentes     : {len(recent_urls)}")
    log(f"   Google Indexing   : désactivé (hors périmètre officiel Google)")
    log(f"   IndexNow          : {len(idx_success)}/{len(INDEXNOW_ENDPOINTS)}")
    log(f"   Ping              : {sum(ping_results.values())}/{len(ping_results)}")
    log("=" * 60)
    log("✅ Daily SEO terminé")
    log("=" * 60)

if __name__ == "__main__":
    main()
