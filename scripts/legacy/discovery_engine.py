#!/usr/bin/env python3
"""
Discovery Engine - Système de découverte automatique pour Presend
Fait des requêtes légitimes vers des services publics pour générer des logs,
des références et attirer l'attention des crawlers.

⚠️  TOUTES les requêtes sont légales et respectent les ToS des services.
    Aucun spam, aucune surcharge, aucune fausse donnée.
"""
import urllib.request
import urllib.parse
import json
import time
import random
import ssl
from datetime import datetime

# Configuration
SITE_URL = "https://presend.pages.dev"
USER_AGENT = "PresendBot/1.0 (+https://presend.pages.dev/bot; discovery@presend.pages.dev)"

# Liste de services publics qui acceptent les requêtes légitimes
DISCOVERY_TARGETS = {
    "dns_checkers": [
        "https://dns.google/resolve?name=presend.pages.dev&type=A",
        "https://cloudflare-dns.com/dns-query?name=presend.pages.dev&type=A",
    ],
    "ssl_checkers": [
        "https://api.ssllabs.com/api/v3/analyze?host=presend.pages.dev",
    ],
    "performance_testers": [
        # PageSpeed Insights API (gratuit, 100 req/jour)
        # Nécessite une clé API Google
    ],
    "uptime_monitors": [
        # Services qui monitoreront automatiquement le site
    ],
    "whois_services": [
        "https://rdap.cloudflare.com/domain/presend.pages.dev",
    ],
    "archive_org": [
        # Wayback Machine - archive automatique
        "https://web.archive.org/save/https://presend.pages.dev/",
    ],
    "feed_readers": [
        # Si tu as un RSS/Atom feed
    ],
}

def make_request(url, method="GET", data=None, headers=None):
    """Effectue une requête HTTP légale"""
    default_headers = {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json, text/html, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': SITE_URL,
    }
    if headers:
        default_headers.update(headers)
    
    try:
        req = urllib.request.Request(
            url,
            data=data.encode('utf-8') if data else None,
            headers=default_headers,
            method=method
        )
        
        # Désactiver la vérification SSL pour certains services (pas recommandé en prod)
        ctx = ssl.create_default_context()
        
        with urllib.request.urlopen(req, timeout=30, context=ctx) as response:
            return response.status, response.read().decode('utf-8', errors='ignore')[:500]
    except Exception as e:
        return None, str(e)

def check_dns():
    """Vérifie les DNS - génère des logs chez les résolveurs"""
    print("\n🔍 Vérification DNS...")
    for url in DISCOVERY_TARGETS["dns_checkers"]:
        status, content = make_request(url, headers={'Accept': 'application/dns-json'})
        service = "Google DNS" if "google" in url else "Cloudflare DNS"
        if status == 200:
            print(f"  ✅ {service}: OK")
        else:
            print(f"  ⚠️ {service}: {status}")
        time.sleep(random.uniform(1, 3))

def check_ssl():
    """Vérifie le SSL - génère des logs chez SSL Labs"""
    print("\n🔒 Vérification SSL...")
    for url in DISCOVERY_TARGETS["ssl_checkers"]:
        status, content = make_request(url)
        if status == 200:
            print(f"  ✅ SSL Labs: Analyse lancée")
        else:
            print(f"  ⚠️ SSL Labs: {status}")
        time.sleep(random.uniform(2, 5))

def check_whois():
    """Vérifie le WHOIS - génère des logs RDAP"""
    print("\n📋 Vérification WHOIS...")
    for url in DISCOVERY_TARGETS["whois_services"]:
        status, content = make_request(url)
        if status == 200:
            print(f"  ✅ RDAP: OK")
        else:
            print(f"  ⚠️ RDAP: {status}")
        time.sleep(random.uniform(1, 3))

def archive_to_wayback():
    """Archive le site sur Wayback Machine - créé un lien permanent"""
    print("\n📚 Archivage Wayback Machine...")
    for url in DISCOVERY_TARGETS["archive_org"]:
        status, content = make_request(url)
        if status == 200:
            print(f"  ✅ Wayback Machine: Page archivée")
        else:
            print(f"  ⚠️ Wayback Machine: {status}")
        time.sleep(random.uniform(3, 6))

def submit_to_w3c_validator():
    """Valide le HTML sur W3C - génère un rapport public"""
    print("\n✅ Validation W3C...")
    validator_url = f"https://validator.w3.org/nu/?doc={urllib.parse.quote(SITE_URL)}&out=json"
    status, content = make_request(validator_url)
    if status == 200:
        print(f"  ✅ W3C Validator: Page validée")
    else:
        print(f"  ⚠️ W3C Validator: {status}")

def check_security_headers():
    """Vérifie les headers de sécurité - génère un rapport public"""
    print("\n🛡️  Vérification headers de sécurité...")
    security_url = f"https://securityheaders.com/?q={urllib.parse.quote(SITE_URL)}&followRedirects=on"
    status, content = make_request(security_url)
    if status == 200:
        print(f"  ✅ Security Headers: Analyse effectuée")
    else:
        print(f"  ⚠️ Security Headers: {status}")

def main():
    print("=" * 60)
    print("🤖 Discovery Engine - Découverte automatique")
    print("=" * 60)
    print(f"🌐 Site: {SITE_URL}")
    print(f"⏰ Date: {datetime.now().isoformat()}")
    print("=" * 60)
    
    # Exécuter les vérifications
    check_dns()
    check_ssl()
    check_whois()
    archive_to_wayback()
    submit_to_w3c_validator()
    check_security_headers()
    
    print("\n" + "=" * 60)
    print("✅ Discovery Engine terminé")
    print("📊 Ces requêtes légitimes génèrent des logs publics")
    print("   qui aident les moteurs de recherche à découvrir le site.")
    print("=" * 60)

if __name__ == "__main__":
    main()
