#!/usr/bin/env python3
"""
Interroge l'API Search Analytics de Google Search Console pour de vraies
données de performance (requêtes, impressions, clics, position) --
contrairement à gsc_submit.py qui ne fait que soumettre le sitemap.
Réutilise le même compte de service déjà configuré.
"""
import json
import os
import sys
import urllib.request
import urllib.error
import urllib.parse
from datetime import date, timedelta

SERVICE_ACCOUNT_FILE = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON_PATH", "google-service-account.json")
SITE_URL = os.environ.get("GSC_SITE_URL", "https://presend.pages.dev/")

def log(msg):
    print(msg, flush=True)

def get_access_token():
    from google.oauth2 import service_account
    from google.auth.transport.requests import Request

    credentials = service_account.Credentials.from_service_account_file(
        SERVICE_ACCOUNT_FILE,
        scopes=['https://www.googleapis.com/auth/webmasters.readonly']
    )
    credentials.refresh(Request())
    return credentials.token

def query_search_analytics(token, start_date, end_date, dimensions):
    site_encoded = urllib.parse.quote(SITE_URL, safe='')
    url = f"https://www.googleapis.com/webmasters/v3/sites/{site_encoded}/searchAnalytics/query"
    body = json.dumps({
        "startDate": start_date,
        "endDate": end_date,
        "dimensions": dimensions,
        "rowLimit": 25,
    }).encode('utf-8')
    req = urllib.request.Request(
        url, data=body,
        headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
        method='POST'
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode('utf-8'))

def main():
    log("=" * 60)
    log("📊 DONNÉES RÉELLES -- GOOGLE SEARCH CONSOLE (28 derniers jours)")
    log("=" * 60)

    if not os.path.exists(SERVICE_ACCOUNT_FILE):
        log(f"❌ Fichier '{SERVICE_ACCOUNT_FILE}' introuvable.")
        sys.exit(1)

    token = get_access_token()

    end = date.today() - timedelta(days=2)
    start = end - timedelta(days=28)

    log(f"Période: {start} -> {end}\n")

    overview = query_search_analytics(token, str(start), str(end), [])
    rows = overview.get('rows', [])
    if rows:
        r = rows[0]
        log(f"Total clics: {r.get('clicks', 0)}")
        log(f"Total impressions: {r.get('impressions', 0)}")
        log(f"CTR moyen: {r.get('ctr', 0)*100:.2f}%")
        log(f"Position moyenne: {r.get('position', 0):.1f}")
    else:
        log("Aucune donnée agrégée disponible pour cette période.")

    log("\n--- Top requêtes de recherche réelles ---")
    by_query = query_search_analytics(token, str(start), str(end), ["query"])
    for r in by_query.get('rows', [])[:15]:
        q = r['keys'][0]
        log(f"  '{q}' -- {r['clicks']} clics, {r['impressions']} impressions, position {r['position']:.1f}")

    log("\n--- Top pages ---")
    by_page = query_search_analytics(token, str(start), str(end), ["page"])
    for r in by_page.get('rows', [])[:10]:
        p = r['keys'][0]
        log(f"  {p} -- {r['clicks']} clics, {r['impressions']} impressions")

    log("=" * 60)

if __name__ == "__main__":
    main()
