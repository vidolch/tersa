#!/usr/bin/env bash
# T4 R5: file-system / database access only under src/storage/.
# Usage: T4-structure.sh <SERVICE_DIR>
set -euo pipefail
cd "${1:?SERVICE_DIR}"
PATTERN="from ['\"](node:)?(fs|fs/promises|sqlite)['\"]|require\(['\"](node:)?(fs|fs/promises|sqlite)['\"]\)|better-sqlite3|from ['\"](sqlite3|lowdb|level)['\"]"
hits=$(grep -rEn "$PATTERN" src --include='*.ts' --include='*.js' --include='*.mts' \
  | grep -v '^src/storage/' || true)
if [[ -n "$hits" ]]; then
  echo "persistence access outside src/storage/:"
  echo "$hits"
  exit 1
fi
[[ -d src/storage ]] || { echo "src/storage/ missing"; exit 1; }
echo "ok"
