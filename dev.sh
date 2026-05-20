#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright 2026 Ray Klundt
# mathBasher is also available under a commercial license — see COMMERCIAL.md
#
# Convenience wrapper around `pnpm dev` that frees Vite's port first.
# If a previous dev process is still bound to PORT (crashed, orphaned,
# or a leftover from another shell), kill it before starting so we
# don't get the "Port 5173 is already in use" prompt to fall back to
# 5174 (which would break any browser tab pointed at the canonical
# port). 1s sleep gives Windows time to release the socket after the
# kill before Vite tries to bind.
#
# Windows-only: uses netstat + taskkill. Run from Git Bash on Windows.

set -e

PORT=5183

echo "[dev.sh] Checking port $PORT…"

# netstat -ano: -a (all), -n (numeric), -o (owning PID). Column 5 = PID.
# Filter to LISTENING rows on our port.
PIDS=$(netstat -ano | grep "LISTENING" | grep ":$PORT " | awk '{print $5}' | sort -u)

if [ -n "$PIDS" ]; then
  echo "[dev.sh] Port $PORT in use by PID(s): $PIDS — killing…"
  for PID in $PIDS; do
    # //F //PID — double-slash escapes the / so Git Bash doesn't path-expand them.
    taskkill //F //PID "$PID" >/dev/null 2>&1 || true
  done
  echo "[dev.sh] Waiting 1s for socket release…"
  sleep 1
else
  echo "[dev.sh] Port $PORT free."
fi

echo "[dev.sh] Starting pnpm dev…"
exec pnpm dev
