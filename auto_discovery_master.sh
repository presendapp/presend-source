#!/bin/bash
# =============================================================================
# Auto Discovery Master - Système complet de découverte automatique
# À exécuter via cron hebdomadaire :
#   crontab -e → 0 2 * * 0 /path/to/presend/auto_discovery_master.sh
# =============================================================================

set -e

LOG_FILE="/tmp/presend_discovery_$(date +%Y%m%d_%H%M%S).log"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "🤖 AUTO DISCOVERY MASTER — $(date)"
echo "================================================"
echo -e "${NC}" | tee -a "$LOG_FILE"

cd "$PROJECT_DIR"

# ─── 1. Génération du sitemap ──────────────────────────────────────────────
echo -e "\n${YELLOW}🗺️  Étape 1: Génération du sitemap${NC}" | tee -a "$LOG_FILE"
python3 generate_sitemap.py | tee -a "$LOG_FILE"

# ─── 2. Discovery Engine (DNS, SSL, WHOIS, etc.) ───────────────────────────
echo -e "\n${YELLOW}📡 Étape 2: Discovery Engine${NC}" | tee -a "$LOG_FILE"
python3 discovery_engine.py >> "$LOG_FILE" 2>&1 || true

# ─── 3. Crawler Ping System (Common Crawl, etc.) ───────────────────────────
echo -e "\n${YELLOW}🕷️  Étape 3: Crawler Ping System${NC}" | tee -a "$LOG_FILE"
python3 crawler_ping_system.py >> "$LOG_FILE" 2>&1 || true

# ─── 4. Soumission SEO unifiée (Google + IndexNow + Ping) ──────────────────
echo -e "\n${YELLOW}📡 Étape 4: Soumission SEO unifiée${NC}" | tee -a "$LOG_FILE"
python3 submit_all.py | tee -a "$LOG_FILE"

echo -e "\n${YELLOW}📡 Étape 4b: Soumission Bing Webmaster API${NC}" | tee -a "$LOG_FILE"
python3 bing_submit.py | tee -a "$LOG_FILE" || true

# ─── 5. Wayback Machine — archivage ────────────────────────────────────────
echo -e "\n${YELLOW}📚 Étape 5: Wayback Machine Archiving${NC}" | tee -a "$LOG_FILE"
for page in "/" "/tools/exif-remover" "/tools/pdf-compress" "/tools/image-compressor" "/tools/password-generator"; do
    curl -s "https://web.archive.org/save/https://presend.pages.dev${page}" > /dev/null 2>&1 || true
    sleep 5
done
echo "   ✅ Pages archivées sur Wayback Machine" | tee -a "$LOG_FILE"

# ─── 5b. Vérification des liens morts ──────────────────────────────────────
echo -e "\n${YELLOW}🔗 Étape 5b: Vérification des liens morts${NC}" | tee -a "$LOG_FILE"
python3 check_broken_links.py | tee -a "$LOG_FILE" || true

# ─── 6. Rapport ────────────────────────────────────────────────────────────
echo -e "\n${YELLOW}📊 Étape 6: Rapport${NC}" | tee -a "$LOG_FILE"
URL_COUNT=$(grep -c "<loc>" sitemap.xml)
echo "   URLs dans le sitemap: $URL_COUNT" | tee -a "$LOG_FILE"
echo "   Log complet: $LOG_FILE" | tee -a "$LOG_FILE"

echo -e "\n${BLUE}================================================"
echo "✅ Auto Discovery Master terminé — $(date)"
echo "================================================${NC}" | tee -a "$LOG_FILE"
