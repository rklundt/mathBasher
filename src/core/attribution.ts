// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * THE single source of truth for the AGPL §7(b) UI attribution notice.
 *
 * Rendered as a persistent DOM footer below the game canvas by
 * `mountAttributionFooter()` (`src/game/ui/domAttributionFooter.ts`; markup +
 * CSS in `index.html`). Updating attribution text MUST happen here — never
 * duplicate the strings into individual scenes or other call sites.
 *
 * The Source URL is read from the `VITE_SOURCE_URL` environment variable at
 * build time (set in `.env` locally and in CI for production). Vite inlines
 * variables prefixed with `VITE_` into the client bundle, so this is safe to
 * reference from browser code. A placeholder is used when the env var is unset
 * so dev builds don't break — but the placeholder URL is intentionally invalid,
 * so a deploy without `VITE_SOURCE_URL` set will display a broken link, which
 * surfaces the misconfiguration immediately.
 */

export const PLACEHOLDER_SOURCE_URL = 'https://example.invalid/mathbasher';

const sourceUrl = import.meta.env.VITE_SOURCE_URL ?? PLACEHOLDER_SOURCE_URL;

/**
 * Sprint 0.7 Story 13 (D9 from sprint 0.6.3 wrap-up review) — true if
 * the runtime sourceUrl is the placeholder fallback (i.e. VITE_SOURCE_URL
 * was unset at build time). `mountAttributionFooter` reads this and emits a
 * Warning telemetry event on page load if true, so a misconfigured deploy
 * shows up in App Insights instead of just looking weird in the footer.
 */
export const isUsingPlaceholderSourceUrl = sourceUrl === PLACEHOLDER_SOURCE_URL;

export const attribution = {
  productName: 'mathBasher',
  copyrightLine: 'Copyright 2026 Ray Klundt',
  licenseLine: 'Licensed under AGPL-3.0-or-later',
  sourceUrl,
  /** The full four-line block as displayed in the UI footer. */
  block: [
    'mathBasher',
    'Copyright 2026 Ray Klundt',
    'Licensed under AGPL-3.0-or-later',
    `Source: ${sourceUrl}`,
  ] as const,
} as const;

export type Attribution = typeof attribution;
