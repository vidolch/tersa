#!/usr/bin/env bash
# Runs the hidden acceptance suite against one implementation.
#
# Usage: run.sh <TASK> <SERVICE_DIR> [ARM] [OUT_DIR]
#   TASK         T1..T5 (runs that task's suite plus all earlier ones)
#   SERVICE_DIR  implementation produced by the agent
#   ARM          arm id, used to locate arms/<ARM>/checks (optional)
#   OUT_DIR      where JSON reports go (default: ./out)
#
# Env: START_CMD (default "npm start"), SERVICE_LOGS=1 to see service output.
set -uo pipefail

TASK=${1:?TASK}
SERVICE_DIR=$(cd "${2:?SERVICE_DIR}" && pwd)
ARM=${3:-}
OUT=${4:-out}
HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$OUT"
OUT=$(cd "$OUT" && pwd)
status=0

cd "$HERE"
export SERVICE_DIR TASK

echo "== acceptance (default storage)"
STORAGE_MODE= npx vitest run --reporter=default --reporter=json \
  --outputFile.json="$OUT/acceptance-default.json" || status=1

# From T4 on, the full suite must also pass with in-memory storage (T4 R2, T5 R6).
if [[ "$TASK" == "T4" || "$TASK" == "T5" ]]; then
  echo "== acceptance (STORAGE=memory)"
  STORAGE_MODE=memory npx vitest run --reporter=default --reporter=json \
    --outputFile.json="$OUT/acceptance-memory.json" || status=1

  CHECK="$HERE/../arms/$ARM/checks/T4-structure.sh"
  if [[ -n "$ARM" && -x "$CHECK" ]]; then
    echo "== structural check (T4 R5)"
    if "$CHECK" "$SERVICE_DIR"; then
      echo '{"rule":"T4 R5","passed":true}' > "$OUT/structure.json"
    else
      echo '{"rule":"T4 R5","passed":false}' > "$OUT/structure.json"
      status=1
    fi
  else
    echo "!! no structural check for arm '$ARM' (T4 R5 not evaluated)"
    status=1
  fi
fi

exit $status
