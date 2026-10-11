// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { attribution, isUsingPlaceholderSourceUrl } from '@/core/attribution';
import { _th, SeverityLevel, type TelemetryProps } from '@/core/telemetry';

/**
 * Sprint 2.5.2 — fills the DOM AGPL §7(b) attribution footer (markup +
 * CSS in `index.html`) from the single source of truth in
 * `src/core/attribution.ts`.
 *
 * This replaces the former Phaser `AttributionScene`. The footer lives in
 * the DOM, in the page's flex column directly under the game canvas: the
 * canvas is sized to the visible-viewport space above it, so the notice
 * always stays above a mobile browser's URL bar and no game element can
 * sit underneath it. It wraps to a second line on narrow screens instead
 * of truncating, per NOTICE §7(b)(b).
 *
 * Idempotent: safe to call more than once (it just re-writes the text).
 * No-ops gracefully if the elements are missing (e.g. a test harness
 * without the index.html shell).
 */
export function mountAttributionFooter(): void {
  _th.logToAi('mountAttributionFooter Started', SeverityLevel.Information);

  const left = document.getElementById('app-footer-left');
  const src = document.getElementById('app-footer-src');

  if (left) {
    left.textContent = `${attribution.productName}  •  ${attribution.copyrightLine}  •  ${attribution.licenseLine}`;
  }
  if (src instanceof HTMLAnchorElement) {
    src.textContent = `Source: ${attribution.sourceUrl}`;
    src.href = attribution.sourceUrl;
  }

  // Sprint 0.7 Story 13 (D9) guardrail, carried over from AttributionScene:
  // if VITE_SOURCE_URL was unset at build time the footer shows the
  // intentionally-invalid placeholder link; surface that as a Warning so a
  // misconfigured deploy shows up in App Insights instead of just looking
  // broken in the UI.
  if (isUsingPlaceholderSourceUrl) {
    const dict: TelemetryProps = {};
    dict['reason'] = 'VITE_SOURCE_URL env var is unset; shipping with the placeholder example.invalid URL';
    _th.logToAi('AttributionFooter PlaceholderSourceUrl', SeverityLevel.Warning, dict);
  }

  _th.logToAi('mountAttributionFooter Completed', SeverityLevel.Information);
}
