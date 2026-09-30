#!/usr/bin/env python3
"""
Crawler Ping System - Ping subtil vers les services qui alimentent les moteurs de recherche
Ces services ont des bots qui crawle les sites mentionnés dans leurs logs/APIs.
"""
import urllib.request
import urllib.parse
import json
import time
import random

SITE_URL = "https://presend.pages.dev"
USER_AGENT = "Mozilla/5.0 (compatible; PresendBot/1.0; +https://presend.pages.dev/bot)"

def ping_common_crawl():
    """Common Crawl - archive web massive utilisée par de nombreux moteurs"""
    print("\n🕷️  Common Crawl...")
    # Common Crawl index API
    url = f"https://index.commoncrawl.org/CC-MAIN-2024-51-index?url={urllib.parse.quote(SITE_URL)}&output=json"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            if data:
                print(f"  ✅ Common Crawl: {len(data)} entrées trouvées")
            else:
                print(f"  ℹ️ Common Crawl: Pas encore indexé (normal pour un nouveau site)")
    except Exception as e:
        print(f"  ℹ️ Common Crawl: {str(e)[:80]}")

def ping_carbon_date():
    """Carbon Date - estime l'âge d'une page web"""
    print("\n📅 Carbon Date...")
    url = f"https://carbondate.cs.odu.edu/cd/{urllib.parse.quote(SITE_URL)}"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
        with urllib.request.urlopen(req, timeout=30) as resp:
            print(f"  ✅ Carbon Date: Page datée")
    except Exception as e:
        print(f"  ℹ️ Carbon Date: {str(e)[:80]}")

def ping_memento():
    """Memento - agrégateur d'archives web"""
    print("\n📚 Memento TimeGate...")
    url = f"https://web.archive.org/web/timegate/{SITE_URL}"
    try:
        req = urllib.request.Request(url, headers={
            'User-Agent': USER_AGENT,
            'Accept': 'application/link-format'
        }, method='HEAD')
        with urllib.request.urlopen(req, timeout=30) as resp:
            print(f"  ✅ Memento: TimeGate accessible")
    except Exception as e:
        print(f"  ℹ️ Memento: {str(e)[:80]}")

def ping_schema_org_validator():
    """Valide les schemas sur le site officiel Schema.org"""
    print("\n🏗️  Schema.org Validator...")
    # Google Rich Results Test (via URL publique)
    test_url = f"https://search.google.com/test/rich-results?url={urllib.parse.quote(SITE_URL)}"
    print(f"  ℹ️  Rich Results Test: {test_url}")
    print(f"     → Ouvre ce lien pour valider tes schemas")

def ping_structured_data_linter():
    """Structured Data Linter - outil public de validation"""
    print("\n🔍 Structured Data Linter...")
    url = f"http://linter.structured-data.org/?url={urllib.parse.quote(SITE_URL)}"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
        with urllib.request.urlopen(req, timeout=30) as resp:
            print(f"  ✅ Structured Data Linter: Page analysée")
    except Exception as e:
        print(f"  ℹ️ Structured Data Linter: {str(e)[:80]}")

def ping_facebook_sharing_debugger():
    """Facebook Sharing Debugger - force le rescrape des OG tags"""
    print("\n📘 Facebook Sharing Debugger...")
    debug_url = f"https://developers.facebook.com/tools/debug/?q={urllib.parse.quote(SITE_URL)}"
    print(f"  ℹ️  Facebook Debugger: {debug_url}")
    print(f"     → Ouvre ce lien et clique 'Scrape Again' pour forcer le rescrape")

def ping_twitter_card_validator():
    """Twitter Card Validator - force le rescrape des Twitter Cards"""
    print("\n🐦 Twitter Card Validator...")
    card_url = f"https://cards-dev.twitter.com/validator?url={urllib.parse.quote(SITE_URL)}"
    print(f"  ℹ️  Twitter Card Validator: {card_url}")
    print(f"     → Ouvre ce lien pour valider tes Twitter Cards")

def ping_linkedin_post_inspector():
    """LinkedIn Post Inspector - force le rescrape des OG tags LinkedIn"""
    print("\n💼 LinkedIn Post Inspector...")
    inspect_url = f"https://www.linkedin.com/post-inspector/inspect/{urllib.parse.quote(SITE_URL)}"
    try:
        req = urllib.request.Request(inspect_url, headers={'User-Agent': USER_AGENT})
        with urllib.request.urlopen(req, timeout=30) as resp:
            print(f"  ✅ LinkedIn: OG tags inspectés")
    except Exception as e:
        print(f"  ℹ️ LinkedIn: {str(e)[:80]}")

def ping_pinterest_rich_pins():
    """Pinterest Rich Pins Validator"""
    print("\n📌 Pinterest Rich Pins...")
    pin_url = f"https://developers.pinterest.com/tools/url-debugger/?link={urllib.parse.quote(SITE_URL)}"
    print(f"  ℹ️  Pinterest Debugger: {pin_url}")

def ping_discord_embed():
    """Discord Embed Debugger - force le rescrape des embeds Discord"""
    print("\n💬 Discord Embed Debugger...")
    # Discord scrap automatiquement quand un lien est partagé
    # On peut forcer le rescrape via leur API (non documentée publiquement)
    print(f"  ℹ️  Discord: Partage le lien dans un canal pour forcer le rescrape")

def ping_telegram_instant_view():
    """Telegram Instant View - crée des previews instantanées"""
    print("\n✈️  Telegram Instant View...")
    tg_url = f"https://t.me/iv?url={urllib.parse.quote(SITE_URL)}&rhash=..."
    print(f"  ℹ️  Telegram IV: {tg_url}")
    print(f"     → Nécessite une configuration sur Telegram")

def ping_slack_unfurl():
    """Slack Link Unfurling - force le rescrape des unfurls Slack"""
    print("\n💬 Slack Link Unfurling...")
    print(f"  ℹ️  Slack: Partage le lien dans un workspace pour forcer le unfurl")

def main():
    print("=" * 60)
    print("🕷️  Crawler Ping System")
    print("=" * 60)
    print("Ces pings génèrent des traces publiques qui attirent")
    print("l'attention des crawlers et des moteurs de recherche.")
    print("=" * 60)
    
    ping_common_crawl()
    time.sleep(2)
    
    ping_carbon_date()
    time.sleep(2)
    
    ping_memento()
    time.sleep(2)
    
    ping_schema_org_validator()
    time.sleep(1)
    
    ping_structured_data_linter()
    time.sleep(2)
    
    ping_facebook_sharing_debugger()
    time.sleep(1)
    
    ping_twitter_card_validator()
    time.sleep(1)
    
    ping_linkedin_post_inspector()
    time.sleep(2)
    
    ping_pinterest_rich_pins()
    time.sleep(1)
    
    ping_discord_embed()
    time.sleep(1)
    
    ping_telegram_instant_view()
    time.sleep(1)
    
    ping_slack_unfurl()
    
    print("\n" + "=" * 60)
    print("✅ Crawler Ping System terminé")
    print("\n💡 PROCHAINES ÉTAPES MANUELLES:")
    print("   1. Ouvre les liens Facebook/Twitter/LinkedIn ci-dessus")
    print("      et force le rescrape de tes pages")
    print("   2. Partage ton lien sur Discord/Slack pour forcer le unfurl")
    print("   3. Crée un compte Telegram et configure Instant View")
    print("=" * 60)

if __name__ == "__main__":
    main()
