#!/usr/bin/env bash
# Self-check of the Actual Budget suite (no API calls), through the same phased
# runner the benchmark uses. For each task:
#   start state (no fix)  -> must fail exactly task.json expectStartFailing
#   reference.patch       -> must pass every rule, regression included
# Usage: validate-actual.sh [TASK...]   (default: all tasks)
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
S=$ROOT/suites/actual
TMP=$(mktemp -d)
export TERSA_RESULTS_DIR="$TMP/results" TERSA_RAW_DIR="$TMP/raw"
trap 'rm -rf "$TMP"' EXIT
TASKS=("$@"); [[ ${#TASKS[@]} -gt 0 ]] || mapfile -t TASKS < <(node -p "require('$S/suite.json').tasks.join('\n')")
EMPTY=$TMP/none.patch; : > "$EMPTY"

status=0; n=0
for task in "${TASKS[@]}"; do
  for variant in start reference; do
    n=$((n + 1))
    if [[ $variant == start ]]; then sol=$EMPTY; expected=$(node -p "require('$S/tasks/$task/task.json').expectStartFailing.slice().sort().join(',')")
    else sol=$S/tasks/$task/reference.patch; expected=""; fi
    echo "== $task $variant"
    for phase in prepare agent eval; do
      args=(--suite actual --arm A-ts-baseline --task "$task" --run "$n" --phase "$phase" --force)
      [[ $phase == agent ]] && args+=(--fake-agent "$sol")
      (cd "$ROOT/harness/runner" && node --disable-warning=ExperimentalWarning src/run.ts "${args[@]}") 2>&1 \
        | grep -E "acceptance:|reading:|error" | sed 's/^/   /' || true
    done
    rec="$TERSA_RESULTS_DIR/A-ts-baseline/$task/run-$n.json"
    failing=$(node -e "const r=require('$rec');console.log(Object.entries(r.acceptance.rules).filter(([,v])=>!v).map(([k])=>k).sort().join(','))")
    if [[ "$failing" == "$expected" ]]; then echo "   OK (failing: ${failing:-none})"
    else echo "   MISMATCH: expected [${expected:-none}], got [${failing:-none}]"; status=1; fi
    rm -rf "$TERSA_RAW_DIR/A-ts-baseline/$task/run-$n"   # 1.7 GB of node_modules per workspace
  done
done
[[ $status == 0 ]] && echo "== all $n cases OK" || echo "== FAILED"
exit $status
