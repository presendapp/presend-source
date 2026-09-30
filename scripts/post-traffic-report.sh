#!/bin/bash
# Exécute check-traffic.sh et gsc_query.py, puis publie un résumé combiné
# comme discussion GitHub dans la catégorie Announcements.
set -e

REPO_ID="R_kgDOTOZSwg"
CATEGORY_ID="DIC_kwDOTOZSws4DFhFT"
WEEK=$(date -u +%Y-%m-%d)

TRAFFIC_REPORT=$(bash "$(dirname "$0")/check-traffic.sh" 7)

GSC_REPORT=""
if [ -f "google-service-account.json" ]; then
  GSC_REPORT=$(python3 "$(dirname "$0")/../gsc_query.py" 2>&1 || echo "(Search Console indisponible cette semaine)")
fi

BODY=$(python3 -c "
import json, sys

traffic = sys.argv[1]
gsc = sys.argv[2]
week = sys.argv[3]

sections = f'''Weekly snapshot -- {week}

## Real visitor traffic (Cloudflare Web Analytics, 7 days)

\`\`\`
{traffic}
\`\`\`'''

if gsc.strip():
    sections += f'''

## Google Search performance (28 days)

\`\`\`
{gsc}
\`\`\`'''

sections += '''

Generated automatically.'''
print(json.dumps(sections))
" "$TRAFFIC_REPORT" "$GSC_REPORT" "$WEEK")

TITLE="Weekly snapshot -- $WEEK"

gh api graphql -f query="
mutation {
  createDiscussion(input: {
    repositoryId: \"$REPO_ID\",
    categoryId: \"$CATEGORY_ID\",
    title: \"$TITLE\",
    body: $BODY
  }) {
    discussion { url }
  }
}"
