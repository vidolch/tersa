#!/usr/bin/env bash
# Rebases a task's reference solution onto an arm's code patch, for validation:
# writes arms/<ARM>/patches/<TASK>.reference.patch (used by validate-actual.sh).
# Usage: [SUITE=hono] harness/rebase-reference.sh <ARM> <TASK>
set -euo pipefail
ARM=${1:?ARM}; TASK=${2:?TASK}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
S=$ROOT/suites/${SUITE:-actual}
PRISTINE=$("$S/scripts/pristine.sh")
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
git -C "$PRISTINE" archive HEAD | tar -x -C "$T"
cd "$T" && git init -q && git add -A && git -c user.name=b -c user.email=b@l commit -qm pristine
START=$(node -p "require('$S/tasks/$TASK/task.json').startPatch || ''")
[[ -n "$START" ]] && git apply "$S/tasks/$TASK/$START"
git apply "$ROOT/arms/$ARM/patches/$TASK.patch"
git add -A && git -c user.name=b -c user.email=b@l commit -qm "start + arm"
git apply --3way "$S/tasks/$TASK/reference.patch" || true
# Conflicts here are insertions next to an inserted comment (e.g. a new function placed just
# above a function that got a contract): resolve by keeping the reference's lines, then the arm's.
# validate-actual.sh then checks the result compiles into a passing solution.
for f in $(git diff --name-only --diff-filter=U); do
  python3 - "$f" <<'PY'
import re, sys
p = sys.argv[1]; s = open(p).read()
s = re.sub(r"<<<<<<< ours\n(.*?)=======\n(.*?)>>>>>>> theirs\n", lambda m: m.group(2) + m.group(1), s, flags=re.S)
assert "<<<<<<<" not in s, p
open(p, "w").write(s)
PY
  echo "resolved insertion conflict in $f"
done
git add -A && git diff --cached > "$ROOT/arms/$ARM/patches/$TASK.reference.patch"
echo "wrote arms/$ARM/patches/$TASK.reference.patch ($(git diff --cached --stat | tail -1))"
