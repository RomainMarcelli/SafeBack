#!/usr/bin/env bash
set -euo pipefail

# Runner E2E device via Maestro.
# Usage:
#   npm run test:e2e:device
#   npm run test:e2e:device -- maestro/flows/friends-request-flow.yaml

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v maestro >/dev/null 2>&1; then
  echo "[e2e:device] Maestro CLI introuvable."
  echo "[e2e:device] Installe-le: curl -Ls \"https://get.maestro.mobile.dev\" | bash"
  exit 1
fi

FLOW_ARG="${1:-all}"
export MAESTRO_APP_ID="${MAESTRO_APP_ID:-com.kyro31.SafeBack}"
export MAESTRO_TEST_EMAIL="${MAESTRO_TEST_EMAIL:-}"
export MAESTRO_TEST_PASSWORD="${MAESTRO_TEST_PASSWORD:-}"
export MAESTRO_FROM_ADDRESS="${MAESTRO_FROM_ADDRESS:-10 Rue de Rivoli, Paris}"
export MAESTRO_TO_ADDRESS="${MAESTRO_TO_ADDRESS:-11 Rue de Lyon, Paris}"

if [[ -z "$MAESTRO_TEST_EMAIL" || -z "$MAESTRO_TEST_PASSWORD" ]]; then
  echo "[e2e:device] Variables manquantes:"
  echo "  - MAESTRO_TEST_EMAIL"
  echo "  - MAESTRO_TEST_PASSWORD"
  echo "[e2e:device] Exemple:"
  echo "  MAESTRO_TEST_EMAIL=test+1@demo.local MAESTRO_TEST_PASSWORD=secret npm run test:e2e:device"
  exit 1
fi

run_flow() {
  local flow_path="$1"
  echo "[e2e:device] Running ${flow_path}"
  maestro test "${flow_path}"
}

if [[ "$FLOW_ARG" == "all" ]]; then
  run_flow "maestro/flows/smoke-auth.yaml"
  run_flow "maestro/flows/trip-flow.yaml"
  run_flow "maestro/flows/sos-flow.yaml"
  run_flow "maestro/flows/friends-map-flow.yaml"
  run_flow "maestro/flows/onboarding-flow.yaml"
else
  run_flow "$FLOW_ARG"
fi

echo "[e2e:device] Terminé."
