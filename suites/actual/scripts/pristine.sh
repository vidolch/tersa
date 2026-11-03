#!/usr/bin/env bash
# Ensures a pristine clone of the pinned commit and prints its path.
# Env: ACTUAL_CACHE (default ~/.cache/tersa).
set -euo pipefail
HERE=$(cd "$(dirname "$0")/.." && pwd)
SHA=$(node -p "require('$HERE/suite.json').commitFull")
REPO=$(node -p "require('$HERE/suite.json').repo")
P="${ACTUAL_CACHE:-$HOME/.cache/tersa}/actual-$SHA"
if [[ ! -d "$P/.git" ]] || ! git -C "$P" rev-parse -q --verify HEAD >/dev/null; then
  rm -rf "$P"; mkdir -p "$P"
  git -C "$P" init -q
  git -C "$P" remote add origin "$REPO"
  GIT_LFS_SKIP_SMUDGE=1 git -C "$P" fetch -q --depth 1 origin "$SHA"
  git -C "$P" -c advice.detachedHead=false checkout -q FETCH_HEAD
fi
echo "$P"
