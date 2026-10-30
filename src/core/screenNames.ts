// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/** The two build variables that decide whether screen names show. */
export interface ScreenNameEnv {
  readonly DEV: boolean;
  readonly VITE_SHOW_SCREEN_NAMES?: string;
}

/**
 * Sprint 2.15 — whether each menu screen shows its name in a corner tag
 * ("DEV · TitleScene"): always when running locally (`pnpm dev`), and on the
 * dev site, whose build sets `VITE_SHOW_SCREEN_NAMES=true`. A production
 * build has neither, so the tag never reaches prod.
 */
export function screenNamesShown(env: ScreenNameEnv): boolean {
  return env.DEV || env.VITE_SHOW_SCREEN_NAMES === 'true';
}
