#!/bin/bash
# Lance la suite de tests API complète : démarre wrangler pages dev avec
# une KV simulée, attend qu'il soit prêt, exécute les tests, nettoie.
set -e

cd "$(dirname "$0")/.."
PORT=8788

# Nettoyage préalable au cas où un ancien process traînerait sur le port
pkill -9 -f "workerd" 2>/dev/null || true
sleep 1

echo "--- Démarrage de wrangler pages dev sur le port $PORT ---"
rm -f /tmp/wrangler-test.log
nohup npx wrangler@3 pages dev . --port $PORT --compatibility-date=2025-07-18 \
  --kv=PRESEND_ANALYTICS --persist-to=/tmp/wrangler-kv-persist \
  > /tmp/wrangler-test.log 2>&1 &
WRANGLER_PID=$!

# Attendre que le serveur soit prêt (jusqu'à 20s)
READY=0
for i in $(seq 1 20); do
  if curl -s -o /dev/null "http://localhost:$PORT/api/health"; then
    READY=1
    break
  fi
  sleep 1
done

if [ "$READY" -ne 1 ]; then
  echo "❌ wrangler n'a jamais démarré, voir /tmp/wrangler-test.log"
  cat /tmp/wrangler-test.log
  kill $WRANGLER_PID 2>/dev/null || true
  pkill -9 -f "workerd" 2>/dev/null || true
  exit 1
fi

echo "--- Serveur prêt, lancement des tests ---"
PRESEND_TEST_BASE="http://localhost:$PORT" node tests/api-test-suite.mjs
TEST_EXIT_CODE=$?

echo "--- Nettoyage ---"
kill $WRANGLER_PID 2>/dev/null || true
pkill -9 -f "workerd" 2>/dev/null || true

exit $TEST_EXIT_CODE
