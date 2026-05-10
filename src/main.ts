// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { _th, SeverityLevel } from '@/core/telemetry';
import { bootGame } from '@/app/boot';

_th.logToAi('AppBoot Started', SeverityLevel.Information);

// Wire the splash button. `{ once: true }` means the handler fires only
// on the first click — a second click is impossible because the splash
// is hidden after the first.
//
// All boot orchestration lives in `src/app/boot.ts` — this entry point
// is intentionally minimal so the contract "Phaser is constructed only
// inside a user-gesture handler" stays visually obvious here. The
// architectural rule is verified statically by `src/main.test.ts`.
const splashButton = document.getElementById('splash-start');
splashButton?.addEventListener('click', bootGame, { once: true });

// Dev convenience: ?autostart in the URL skips the splash. Saves a click
// on every HMR reload during heavy dev iteration. Production users never
// see this param. The autostart path is identical to the click path —
// AudioContext is still created during a synchronous JS callback initiated
// from the click event that loaded the URL (browser still treats it as
// a user-gesture context for the same-origin reload), or worst case the
// AudioContext warning prints once per dev refresh, which is acceptable
// for the dev workflow tradeoff.
//
// Use URLSearchParams.has() rather than search.includes('autostart'): the
// substring check would also match `?fooautostart=1` or `?my_autostart_x`,
// which would be a surprise to a future contributor who reads ?autostart as
// an exact-name flag. The exact-key check makes the contract obvious.
if (new URLSearchParams(window.location.search).has('autostart')) {
  bootGame();
}
