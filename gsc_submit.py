#!/usr/bin/env python3
"""
Soumission du sitemap via l'API légitime Google Search Console
(webmasters.googleapis.com) -- PAS l'API Indexing (voir daily_seo.py
pour le contexte de sa désactivation). Cette API est officiellement
prévue pour ça, sans restriction de type de contenu, tant que le
compte de service a un accès "Propriétaire" ou "Complet" sur la
propriété Search Console (accordé manuellement via l'interface).

Nécessite:
- GOOGLE_SERVICE_ACCOUNT_JSON_PATH (chemin vers le fichier de clé,
  défaut: google-service-account.json)
- GSC_SITE_URL (optionnel, défaut: https://presend.pages.dev/)
"""
import json
import os
import sys
import urllib.request
import urllib.error
import urllib.parse

SERVICE_ACCOUNT_FILE = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON_PATH", "google-service-account.json")
SITE_URL = os.environ.get("GSC_SITE_URL", "https://presend.pages.dev/")
SITEMAP_URL = "https://presend.pages.dev/sitemap.xml"

def log(msg):
    print(msg, flush=True)

def get_access_token():
    from google.oauth2 import service_account
    from google.auth.transport.requests import Request

    credentials = service_account.Credentials.from_service_account_file(
        SERVICE_ACCOUNT_FILE,
        scopes=['https://www.googleapis.com/auth/webmasters']
    )
    credentials.refresh(Request())
    return credentials.token

def submit_sitemap(token):
    site_encoded = urllib.parse.quote(SITE_URL, safe='')
    sitemap_encoded = urllib.parse.quote(SITEMAP_URL, safe='')
    url = f"https://www.googleapis.com/webmasters/v3/sites/{site_encoded}/sitemaps/{sitemap_encoded}"
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'}, method='PUT')
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.status

def get_sitemap_status(token):
    site_encoded = urllib.parse.quote(SITE_URL, safe='')
    sitemap_encoded = urllib.parse.quote(SITEMAP_URL, safe='')
    url = f"https://www.googleapis.com/webmasters/v3/sites/{site_encoded}/sitemaps/{sitemap_encoded}"
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'}, method='GET')
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode('utf-8'))

def main():
    log("=" * 60)
    log("📡 SOUMISSION SITEMAP -- GOOGLE SEARCH CONSOLE (légitime)")
    log("=" * 60)
    log(f"🌐 Propriété: {SITE_URL}")

    if not os.path.exists(SERVICE_ACCOUNT_FILE):
        log(f"❌ Fichier '{SERVICE_ACCOUNT_FILE}' introuvable. Rien à faire.")
        sys.exit(0)  # non-fatal

    try:
        token = get_access_token()
    except Exception as e:
        log(f"❌ Erreur d'authentification: {e}")
        sys.exit(0)  # non-fatal, ne bloque pas le reste du pipeline

    try:
        status = submit_sitemap(token)
        log(f"✅ Sitemap soumis (HTTP {status})")
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')
        log(f"❌ Échec de soumission: HTTP {e.code}: {body[:300]}")
        sys.exit(0)
    except Exception as e:
        log(f"❌ Échec de soumission: {e}")
        sys.exit(0)

    try:
        info = get_sitemap_status(token)
        log(f"📊 Statut: {json.dumps(info, indent=2)}")
    except Exception as e:
        log(f"⚠️ Impossible de lire le statut: {e}")

    log("=" * 60)

if __name__ == "__main__":
    main()
