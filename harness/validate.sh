#!/usr/bin/env bash
# Self-check of the benchmark (no API calls). Runs in CI on every push.
#  1. typechecks the acceptance suite and the runner
#  2. plays every task with its reference solution as a fake agent,
#     through the same phased pipeline the real benchmark uses
#  3. checks each outcome: references pass, T3-start fails exactly T3 R2–R4
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
TMP=$(mktemp -d)
export TERSA_RESULTS_DIR="$TMP/results" TERSA_RAW_DIR="$TMP/raw"
trap 'rm -rf "$TMP"' EXIT

echo "== typecheck"
(cd "$ROOT/acceptance" && npx tsc --noEmit)
(cd "$ROOT/harness/runner" && npx tsc --noEmit)

# task  solution    expected failing rules (empty = must pass)
CASES=(
  "T1 T1 -"
  "T2 T2 -"
  "T3 T3 -"
  "T3 T3-start T3 R2,T3 R3,T3 R4"
  "T4 T4 -"
  "T5 T5 -"
)

status=0
n=0
for c in "${CASES[@]}"; do
  read -r task sol expected <<<"$c"
  [[ "$expected" == "-" ]] && expected="" || expected="${c#* * }"
  n=$((n + 1))
  echo "== $task with reference/$sol"
  for phase in prepare agent eval; do
    (cd "$ROOT/harness/runner" && node --disable-warning=ExperimentalWarning src/run.ts \
      --arm A-ts-baseline --task "$task" --run "$n" --phase "$phase" \
      --fake-agent "$ROOT/reference/$sol" --skip-perf --force) | grep -v '^$' | sed 's/^/   /'
  done
  rec="$TERSA_RESULTS_DIR/A-ts-baseline/$task/run-$n.json"
  failing=$(node -e "const r=require('$rec');console.log(Object.entries(r.acceptance.rules).filter(([,v])=>!v).map(([k])=>k).sort().join(','))")
  if [[ "$failing" == "$expected" ]]; then
    echo "   OK (failing: ${failing:-none})"
  else
    echo "   MISMATCH: expected failing [${expected:-none}], got [${failing:-none}]"
    status=1
  fi
done

[[ $status == 0 ]] && echo "== all $n cases OK" || echo "== FAILED"
exit $status
