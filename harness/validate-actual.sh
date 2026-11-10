#!/usr/bin/env bash
# Kept for existing references: validates the actual suite (see validate-suite.sh).
SUITE=actual exec "$(dirname "$0")/validate-suite.sh" "$@"
