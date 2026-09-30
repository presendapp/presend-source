#!/bin/bash
# Vérifie le trafic réel Presend (Web Analytics) des N derniers jours.
# Nécessite CF_API_TOKEN défini dans l'environnement (jeton "Account Analytics: Read").
# Usage : ./check-traffic.sh [nombre_de_jours]

set -e

DAYS="${1:-7}"
ACCOUNT_TAG="3852884de2dabe408c0dee80a0c3261d"
SITE_TAG="aa85ea9d0190433eb62c8504dc55b9f9"

if [ -z "$CF_API_TOKEN" ]; then
  echo "Erreur : CF_API_TOKEN n'est pas défini." >&2
  echo "Lance d'abord : read -sp 'Jeton Cloudflare : ' CF_API_TOKEN && export CF_API_TOKEN" >&2
  exit 1
fi

START=$(date -u -d "-${DAYS} days" +%Y-%m-%dT00:00:00Z)
END=$(date -u +%Y-%m-%dT23:59:59Z)

echo "=== Trafic réel Presend -- ${DAYS} derniers jours (${START} -> ${END}) ==="
echo ""

curl -s "https://api.cloudflare.com/client/v4/graphql" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data "{\"query\":\"{ viewer { accounts(filter: {accountTag: \\\"$ACCOUNT_TAG\\\"}) { rumPageloadEventsAdaptiveGroups(limit: 5000, filter: {siteTag: \\\"$SITE_TAG\\\", datetime_geq: \\\"$START\\\", datetime_leq: \\\"$END\\\"}) { count dimensions { requestPath refererHost countryName deviceType } } } } }\"}" \
  -o /tmp/cf_traffic_response.json

python3 -c "
import json
from collections import Counter

with open('/tmp/cf_traffic_response.json') as f:
    d = json.load(f)

if d.get('errors'):
    print('Erreur API:', d['errors'])
    exit(1)

groups = d['data']['viewer']['accounts'][0]['rumPageloadEventsAdaptiveGroups']
total = sum(g['count'] for g in groups)

paths = Counter()
countries = Counter()
referers = Counter()
devices = Counter()

for g in groups:
    dims = g['dimensions']
    paths[dims['requestPath']] += g['count']
    countries[dims['countryName']] += g['count']
    devices[dims['deviceType']] += g['count']
    ref = dims['refererHost'] or '(direct)'
    referers[ref] += g['count']

print(f'Total de visites: {total}')
print()
print('Par pays:')
for c, n in countries.most_common():
    print(f'  {c}: {n}')
print()
print('Par appareil:')
for c, n in devices.most_common():
    print(f'  {c}: {n}')
print()
print('Par source (référent):')
for c, n in referers.most_common():
    print(f'  {c}: {n}')
print()
print('Pages les plus visitées:')
for c, n in paths.most_common(10):
    print(f'  {c}: {n}')
"
