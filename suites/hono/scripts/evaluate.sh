#!/usr/bin/env bash
# Hidden evaluation of one Hono task. Never visible to the agent.
#  1. regression: the repo's own tests at the pinned commit (copied over the workspace's,
#     so edited or deleted tests don't count) for the task's scope
#  2. acceptance: black-box tests against Hono apps built from the workspace's source
# Usage: evaluate.sh <TASK> <WORKSPACE> <OUT_DIR>
# Writes OUT_DIR/acceptance-default.json (vitest JSON) and OUT_DIR/regression.json.
set -uo pipefail
TASK=${1:?TASK}; WS=$(cd "${2:?WORKSPACE}" && pwd); OUT=${3:?OUT_DIR}
mkdir -p "$OUT"; OUT=$(cd "$OUT" && pwd)
HERE=$(cd "$(dirname "$0")/.." && pwd)
PRISTINE=$("$HERE/scripts/pristine.sh")
TJ="$HERE/tasks/$TASK/task.json"
status=0

echo "== restore pristine tests"
FILES=()
for d in $(node -p "require('$TJ').regression.dirs.join(' ')"); do
  while IFS= read -r f; do
    mkdir -p "$WS/$(dirname "$f")"
    git -C "$PRISTINE" show "HEAD:$f" > "$WS/$f"
    FILES+=("$f")
  done < <(git -C "$PRISTINE" ls-files "$d" | grep -E '\.test\.(ts|tsx)$')
done

echo "== regression (${#FILES[@]} test files)"
reg_ok=true
(cd "$WS" && npx vitest run --coverage.enabled=false --reporter=json --outputFile="$OUT/regression-hono.json" "${FILES[@]}" > "$OUT/regression.log" 2>&1) || reg_ok=false
node -e '
  const fs=require("fs"), out=process.argv[1], failed=[];
  const p=out+"/regression-hono.json";
  if (fs.existsSync(p)) {
    const r=JSON.parse(fs.readFileSync(p,"utf8"));
    for (const t of r.testResults) {
      if (t.status==="failed" && !t.assertionResults.some(a=>a.status==="failed")) failed.push(t.name.split("/src/")[1]+" (file failed)");
      for (const a of t.assertionResults) if (a.status==="failed") failed.push(a.fullName);
    }
  } else failed.push("no regression report");
  fs.writeFileSync(out+"/regression.json", JSON.stringify({passed: process.argv[2]==="true" && failed.length===0, failed}, null, 2));
  console.log(failed.length ? "regression FAIL: "+failed.length+" tests" : "regression ok");
' "$OUT" "$reg_ok"
grep -q '"passed": true' "$OUT/regression.json" || status=1

echo "== acceptance"
(cd "$HERE/acceptance" && HONO_ROOT="$WS" TASK="$TASK" npx vitest run --reporter=default --reporter=json \
  --outputFile.json="$OUT/acceptance-default.json" > "$OUT/acceptance.log" 2>&1) || status=1
grep -E "Tests  " "$OUT/acceptance.log" || tail -5 "$OUT/acceptance.log"
exit $status
