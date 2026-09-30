#!/bin/bash
# Usage : <liste de depots owner/repo sur stdin> | bash scripts/filter-candidates.sh
# Retire les depots deja contactes (issues/PR ouvertes OU commentees par presendapp) et ceux de
# scripts/no-contact.txt (une ligne "owner/*" exclut tout le proprietaire). Exclusions sur stderr.
cd "$(dirname "$0")/.." || exit 1
ex=$(mktemp)
{ gh search issues --author=presendapp --include-prs --json repository --limit 300 --jq '.[].repository.nameWithOwner'
  gh search issues --commenter=presendapp --include-prs --json repository --limit 300 --jq '.[].repository.nameWithOwner'
  grep -v '^#' scripts/no-contact.txt | awk 'NF{print $1}' | grep -v '/\*$'
} | tr 'A-Z' 'a-z' | sort -u > "$ex"
owners=$(grep -v '^#' scripts/no-contact.txt | awk 'NF{print $1}' | grep '/\*$' | sed 's#/\*$##' | tr 'A-Z' 'a-z')
while read -r r; do
  l=$(echo "$r" | tr 'A-Z' 'a-z'); [ -z "$l" ] && continue
  if grep -qx "$l" "$ex"; then echo "EXCLU (deja contacte ou refus) : $r" >&2; continue; fi
  if echo "$owners" | grep -qx "${l%%/*}"; then echo "EXCLU (proprietaire en no-contact) : $r" >&2; continue; fi
  echo "$r"
done
rm -f "$ex"
