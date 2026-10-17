#!/bin/sh
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright 2026 Ray Klundt
# mathBasher is also available under a commercial license — see COMMERCIAL.md
#
# Runs the optional machine-local checks: every *.sh in .githooks/local/
# (gitignored), as `sh <file> <hook> [args]`. Any non-zero exit stops the
# commit. If there are none, prints a one-line note — or fails, when this
# clone sets `git config mathbasher.requireLocalChecks true`.

hook="$1"
shift
found=0
for f in .githooks/local/*.sh; do
  [ -f "$f" ] || continue
  found=1
  sh "$f" "$hook" "$@" || exit 1
done
if [ "$found" = 0 ]; then
  if [ "$(git config --bool mathbasher.requireLocalChecks)" = "true" ]; then
    echo "$hook: no machine-local checks found in .githooks/local/, and this clone requires them." >&2
    exit 1
  fi
  echo "$hook: no machine-local checks (optional)."
fi
exit 0
