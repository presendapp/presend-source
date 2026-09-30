#!/bin/bash
# =============================================================================
# Script maître : Déploiement Presend + Soumission SEO automatique
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║     🚀 DÉPLOIEMENT PRESEND + SOUMISSION SEO AUTOMATIQUE              ║"
echo "╚══════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ─── 0. GÉNÉRATION DU SITEMAP ──────────────────────────────────────────────
echo -e "\n${YELLOW}🗺️  Étape 0/6 : Génération du sitemap...${NC}"
python3 generate_sitemap.py

# ─── 1. VÉRIFICATIONS PRÉALABLES ─────────────────────────────────────────
echo -e "\n${YELLOW}🔍 Étape 1/6 : Vérifications préalables...${NC}"

if [ ! -f "google-service-account.json" ]; then
    echo -e "${RED}❌ Fichier google-service-account.json introuvable${NC}"
    exit 1
fi
echo -e "   ${GREEN}✅ Clé Google Service Account présente${NC}"

URL_COUNT=$(grep -c "<loc>" sitemap.xml)
echo -e "   ${GREEN}✅ Sitemap présent ($URL_COUNT URLs)${NC}"

if ! python3 -c "import google.oauth2" 2>/dev/null; then
    echo -e "${YELLOW}⚠️  Module google-auth non installé, installation...${NC}"
    pip3 install google-auth google-auth-oauthlib --quiet --break-system-packages 2>/dev/null || pip3 install google-auth google-auth-oauthlib --quiet
fi
echo -e "   ${GREEN}✅ Modules Python OK${NC}"

# ─── 2. GIT PUSH ───────────────────────────────────────────────────────────
echo -e "\n${YELLOW}📤 Étape 2/6 : Git push...${NC}"
git add -A
git commit -m "deploy: $(date '+%Y-%m-%d %H:%M') — sitemap $URL_COUNT URLs" || true
git push origin main
echo -e "   ${GREEN}✅ Push effectué${NC}"

# ─── 3. ATTENTE DÉPLOIEMENT ────────────────────────────────────────────────
echo -e "\n${YELLOW}⏳ Étape 3/6 : Attente déploiement Cloudflare (30s)...${NC}"
sleep 30

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://presend.pages.dev/ || echo "000")
if [ "$HTTP_STATUS" = "200" ]; then
    echo -e "   ${GREEN}✅ Site accessible (HTTP 200)${NC}"
else
    echo -e "   ${YELLOW}⚠️  Site non accessible (HTTP $HTTP_STATUS), attente supplémentaire...${NC}"
    sleep 15
fi

# ─── 4. SOUMISSION SEO UNIFIÉE ─────────────────────────────────────────────
echo -e "\n${YELLOW}📡 Étape 4/6 : Soumission SEO unifiée...${NC}"
python3 submit_all.py

# ─── 5. VÉRIFICATIONS POST-DÉPLOIEMENT ────────────────────────────────────
echo -e "\n${YELLOW}🔍 Étape 5/6 : Vérifications post-déploiement...${NC}"

SITEMAP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://presend.pages.dev/sitemap.xml || echo "000")
if [ "$SITEMAP_STATUS" = "200" ]; then
    echo -e "   ${GREEN}✅ Sitemap accessible (HTTP 200)${NC}"
else
    echo -e "   ${RED}❌ Sitemap inaccessible (HTTP $SITEMAP_STATUS)${NC}"
fi

ROBOTS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://presend.pages.dev/robots.txt || echo "000")
if [ "$ROBOTS_STATUS" = "200" ]; then
    echo -e "   ${GREEN}✅ robots.txt accessible (HTTP 200)${NC}"
else
    echo -e "   ${RED}❌ robots.txt inaccessible (HTTP $ROBOTS_STATUS)${NC}"
fi

# ─── 6. RÉCAPITULATIF ──────────────────────────────────────────────────────
echo -e "\n${BLUE}"
echo "╔══════════════════════════════════════════════════════════════════════╗"
echo "║                    ✅ DÉPLOIEMENT TERMINÉ !                          ║"
echo "╚══════════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "   ${GREEN}• Site : https://presend.pages.dev${NC}"
echo -e "   ${GREEN}• Sitemap : https://presend.pages.dev/sitemap.xml ($URL_COUNT URLs)${NC}"
echo -e "   ${GREEN}• Search Console : https://search.google.com/search-console${NC}"
echo -e "   ${GREEN}• Bing Webmaster : https://www.bing.com/webmasters${NC}"
echo ""
echo -e "${YELLOW}💡 Prochaines étapes :${NC}"
echo -e "   • Vérifier l'indexation dans Search Console dans 24-48h"
echo -e "   • Consulter les rapports de performance dans 7 jours"
echo -e ""
echo -e "${BLUE}══════════════════════════════════════════════════════════════════════${NC}"
