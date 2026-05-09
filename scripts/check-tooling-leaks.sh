#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright 2026 Ray Klundt
# mathBasher is also available under a commercial license — see COMMERCIAL.md
#
# Tooling-context leak scanner.
#
# This project's working scaffolding (sprint files, ADRs, agent specs, the
# repo-local CLAUDE.md, a backlog, etc.) is intentionally gitignored — it
# documents the development process, not the product, and shouldn't appear in
# the public repo or in shipped binaries. References to those tools inside
# committed source code are leaks: they expose internal workflow vocabulary
# ("sprint X.Y", "the Support reviewer said", "/wrap-sprint") that confuses
# downstream readers and surfaces in the runtime bundle.
#
# This script greps every git-tracked file for the leak vocabulary and exits
# non-zero if it finds anything outside the allow-list. Intended to run in
# CI on every PR and locally before committing.
#
# Usage:
#   bash scripts/check-tooling-leaks.sh           # scan all tracked files
#   bash scripts/check-tooling-leaks.sh --staged  # scan only staged-for-commit files
#
# Allow-list rationale:
#   - .gitignore / .dockerignore: must literally name the gitignored paths
#   - LICENSE-related files (LICENSE, NOTICE, COMMERCIAL.md, CONTRIBUTING.md):
#     legal docs that legitimately reference development workflow
#   - This script itself
#
# Exit codes:
#   0 = clean (no leaks)
#   1 = one or more leaks found
#   2 = invocation error

set -euo pipefail

# Pattern: vocabulary that should never appear in committed product code.
# Case-insensitive on the alpha prefixes. Each | branch is intentional:
#   Claude         — the AI tool name
#   reviewer       — internal reviewer agent role names (Support / Senior Dev / etc.)
#   /wrap-sprint   — slash command
#   /close-sprint  — slash command
#   /new-topic     — slash command
#   /review-topic  — slash command
PATTERN='[Cc]laude|[Rr]eviewer|/wrap-sprint|/close-sprint|/new-topic|/review-topic'

# Files that may legitimately contain leak vocabulary. Anything matching one of
# these globs is exempt. Keep the list tight — the point is to surface drift,
# not to launder bad commits.
ALLOWLIST=(
  '.gitignore'
  '.dockerignore'
  'LICENSE'
  'LICENSE.md'
  'NOTICE'
  'NOTICE.md'
  'COMMERCIAL.md'
  'CONTRIBUTING.md'
  'SECURITY.md'
  'CODE_OF_CONDUCT.md'
  'scripts/check-tooling-leaks.sh'
)

mode="all"
if [[ ${1:-} == "--staged" ]]; then
  mode="staged"
elif [[ ${1:-} != "" ]]; then
  echo "Unknown argument: $1" >&2
  echo "Usage: $0 [--staged]" >&2
  exit 2
fi

if [[ "$mode" == "staged" ]]; then
  files=$(git diff --cached --name-only --diff-filter=ACMR)
else
  files=$(git ls-files)
fi

if [[ -z "$files" ]]; then
  echo "No files to scan."
  exit 0
fi

# Build a case-insensitive allow-list match.
is_allowed() {
  local f="$1"
  for entry in "${ALLOWLIST[@]}"; do
    if [[ "$f" == "$entry" ]]; then
      return 0
    fi
  done
  return 1
}

leaks_found=0
leak_details=""

while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  [[ ! -f "$file" ]] && continue
  if is_allowed "$file"; then
    continue
  fi
  if matches=$(grep -nE "$PATTERN" "$file" 2>/dev/null); then
    leaks_found=1
    leak_details+=$'\n--- '"$file"$' ---\n'"$matches"$'\n'
  fi
done <<< "$files"

if [[ "$leaks_found" -eq 1 ]]; then
  echo "Tooling-context leaks detected:" >&2
  echo "$leak_details" >&2
  echo "" >&2
  echo "Fix: rephrase to remove the workflow vocabulary, or add the file to" >&2
  echo "ALLOWLIST in this script if it legitimately needs the term (rare)." >&2
  exit 1
fi

echo "No tooling-context leaks detected ($mode mode, $(echo "$files" | wc -l | tr -d ' ') files scanned)."
exit 0
