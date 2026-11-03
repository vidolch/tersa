#!/usr/bin/env bash
# Hidden evaluation of one Actual Budget task. Never visible to the agent.
#  1. regression: the repo's own tests at the pinned commit (copied over the
#     workspace's, so edited or deleted tests don't count) for the task's scope
#  2. acceptance: black-box tests through @actual-app/api built from the workspace
# Usage: evaluate.sh <TASK> <WORKSPACE> <OUT_DIR>
# Writes OUT_DIR/acceptance-default.json (vitest JSON) and OUT_DIR/regression.json.
set -uo pipefail
TASK=${1:?TASK}; WS=$(cd "${2:?WORKSPACE}" && pwd); OUT=${3:?OUT_DIR}
mkdir -p "$OUT"; OUT=$(cd "$OUT" && pwd)
HERE=$(cd "$(dirname "$0")/.." && pwd)
PRISTINE=$("$HERE/scripts/pristine.sh")
TJ="$HERE/tasks/$TASK/task.json"
Y="node $(ls "$WS"/.yarn/releases/yarn-*.cjs)"
status=0

echo "== restore pristine tests"
DIRS=$(node -p "(require('$TJ').regression['loot-core']||[]).join(' ')")
FILES=()
for d in $DIRS; do
  while IFS= read -r f; do
    mkdir -p "$WS/$(dirname "$f")"
    git -C "$PRISTINE" show "HEAD:$f" > "$WS/$f"
    FILES+=("${f#packages/loot-core/}")
  done < <(git -C "$PRISTINE" ls-files "packages/loot-core/$d" | grep -E '\.test\.(ts|tsx|js)$')
done
API_TESTS=$(node -p "require('$TJ').regression.api ? 'yes' : ''")
if [[ -n "$API_TESTS" ]]; then
  while IFS= read -r f; do git -C "$PRISTINE" show "HEAD:$f" > "$WS/$f"; done \
    < <(git -C "$PRISTINE" ls-files packages/api | grep -E '\.test\.ts$|__snapshots__/')
fi

echo "== regression (${#FILES[@]} loot-core test files${API_TESTS:+ + api})"
reg_ok=true
(cd "$WS/packages/loot-core" && ENV=node $Y vitest --run --reporter=json --outputFile="$OUT/regression-loot-core.json" "${FILES[@]}" > "$OUT/regression.log" 2>&1) || reg_ok=false
if [[ -n "$API_TESTS" ]]; then
  (cd "$WS/packages/api" && $Y vitest --run --reporter=json --outputFile="$OUT/regression-api.json" >> "$OUT/regression.log" 2>&1) || reg_ok=false
fi
node -e '
  const fs=require("fs"), out=process.argv[1], failed=[];
  for (const f of ["regression-loot-core.json","regression-api.json"]) {
    const p=out+"/"+f; if (!fs.existsSync(p)) continue;
    const r=JSON.parse(fs.readFileSync(p,"utf8"));
    for (const t of r.testResults) {
      if (t.status==="failed" && !t.assertionResults.some(a=>a.status==="failed")) failed.push(t.name.split("/packages/")[1]+" (file failed)");
      for (const a of t.assertionResults) if (a.status==="failed") failed.push(a.fullName);
    }
  }
  fs.writeFileSync(out+"/regression.json", JSON.stringify({passed: process.argv[2]==="true" && failed.length===0, failed}, null, 2));
  console.log(failed.length ? "regression FAIL: "+failed.length+" tests" : "regression ok");
' "$OUT" "$reg_ok"
grep -q '"passed": true' "$OUT/regression.json" || status=1

echo "== build @actual-app/api from workspace"
(cd "$WS/packages/api" && $Y vite build > "$OUT/build.log" 2>&1) || { echo "api build failed"; tail -5 "$OUT/build.log"; status=1; }

echo "== acceptance"
(cd "$HERE/acceptance" && ACTUAL_ROOT="$WS" TASK="$TASK" npx vitest run --reporter=default --reporter=json \
  --outputFile.json="$OUT/acceptance-default.json" > "$OUT/acceptance.log" 2>&1) || status=1
grep -E "Tests  " "$OUT/acceptance.log" || tail -5 "$OUT/acceptance.log"
exit $status
