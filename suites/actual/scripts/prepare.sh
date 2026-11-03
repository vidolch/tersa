#!/usr/bin/env bash
# Builds an agent workspace for one task of the Actual Budget suite.
# Usage: prepare.sh <TASK> <WORKSPACE> [SOLUTION_PATCH]
#   SOLUTION_PATCH (validation only): applied after the start patch, as if an agent wrote it.
# Env: ACTUAL_CACHE (default ~/.cache/tersa) holds the pristine clone, reused across runs.
set -euo pipefail
TASK=${1:?TASK}; WS=${2:?WORKSPACE}; SOL=${3:-}
HERE=$(cd "$(dirname "$0")/.." && pwd)
TASKDIR="$HERE/tasks/$TASK"
[[ -f "$TASKDIR/task.json" ]] || { echo "unknown task $TASK"; exit 2; }
PRISTINE=$("$HERE/scripts/pristine.sh")

rm -rf "$WS"; mkdir -p "$WS"
# Source only: no git history (the agent must not see upstream fixes or our patch).
git -C "$PRISTINE" archive HEAD | tar -x -C "$WS"
START=$(node -p "require('$TASKDIR/task.json').startPatch || ''")
if [[ -n "$START" ]]; then (cd "$WS" && git apply "$TASKDIR/$START"); fi
if [[ -n "$SOL" ]]; then (cd "$WS" && git apply "$SOL"); fi

# A fresh repo whose only commit is the start state, so `git diff` works for the agent.
( cd "$WS" && git init -q && git add -A && git -c user.name=bench -c user.email=bench@localhost commit -qm "start" )

cd "$WS"
node .yarn/releases/yarn-*.cjs install --immutable > "$WS/../install.log" 2>&1 || { tail -20 "$WS/../install.log"; exit 1; }
echo "workspace ready: $WS"
