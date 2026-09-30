#!/bin/bash
set -e
EXISTING=$(gh issue list --repo "$GITHUB_REPOSITORY" --label mastodon-token --state open --json number --jq '.[0].number')
if [ -z "$EXISTING" ]; then
  gh issue create --repo "$GITHUB_REPOSITORY" \
    --title "MASTODON_TOKEN invalide" \
    --body "Le jeton Mastodon utilise par le robot d'annonce a echoue a la verification automatique du $(date -u +%Y-%m-%d). Le robot d'annonce (.github/workflows/announce.yml) echouera silencieusement tant que ce jeton n'est pas regenere. Voir le workflow mastodon-token-check.yml pour le detail de l'erreur." \
    --label mastodon-token
  echo "Issue creee"
else
  echo "Issue deja ouverte (#$EXISTING), pas de doublon cree"
fi
