// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { _th, SeverityLevel, type TelemetryProps } from '@/core/telemetry';

/**
 * Sprint 0.7.5 Story 4 — single source of truth for the `ButtonClicked`
 * event shape. Both `PlaceholderButton` (menu/overlay/settings buttons)
 * and `TouchFireButton` (on-screen FIRE button) route their click
 * telemetry through this helper so:
 *
 *  - The event-name spelling stays consistent across both widgets (a
 *    typo in one place would silently fragment App Insights queries)
 *  - The property shape (`label` / `sceneKey` / `source`) is enforced
 *    in one spot
 *  - The pure dict-building part can be unit-tested without spinning up
 *    Phaser + jsdom
 *
 * Activation source semantics:
 *  - "pointer"  — mouse click, finger tap, touch, pen — anything routed
 *                 through Phaser's pointerdown
 *  - "keyboard" — Tab+Enter or Tab+Space via KeyboardNavigator
 *
 * Property values land in App Insights's `customDimensions` once the
 * Sprint 3.5 wiring is in place; until then they go to the console
 * fallback.
 */
export type ButtonClickSource = 'pointer' | 'keyboard';

/**
 * Build the props dict for a `ButtonClicked` event. Pure — does not
 * touch `_th`, does not read the DOM, does not depend on Phaser. Test
 * this directly to lock the contract; the emit wrappers below add the
 * side effect on top.
 */
export function buildButtonClickedProps(
  label: string,
  sceneKey: string,
  source: ButtonClickSource,
): TelemetryProps {
  const dict: TelemetryProps = {};
  dict['label'] = label;
  dict['sceneKey'] = sceneKey;
  dict['source'] = source;
  return dict;
}

/**
 * Emit the `ButtonClicked` telemetry event. Severity is `Information`
 * — button clicks are normal flow, not errors. Disabled buttons should
 * NEVER reach this function (callers short-circuit before invoking).
 */
export function emitButtonClicked(
  label: string,
  sceneKey: string,
  source: ButtonClickSource,
): void {
  _th.logToAi('ButtonClicked', SeverityLevel.Information, buildButtonClickedProps(label, sceneKey, source));
}
