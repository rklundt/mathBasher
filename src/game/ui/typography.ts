// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type Phaser from 'phaser';

/**
 * Single source of truth for typography across every Phaser scene.
 *
 * Pre-refactor (sprint 0.5.5) the literal `'system-ui, sans-serif'` appeared
 * in 27+ places, and 8 distinct text-color hex strings were sprinkled through
 * scene files. A "swap to Comic Neue for the title" change was a 27-file
 * find-replace; a "make all body text slightly higher contrast" change had
 * to chase down every text instantiation. Centralizing here means both are
 * 1-file edits.
 *
 * The `text(...)` helper picks font-size + color + weight from a small
 * vocabulary of named kinds. Scenes pass `kind: 'title' | 'h2' | 'body' |
 * 'subtitle' | 'accent' | 'success' | 'warning'` and get a configured
 * `Phaser.GameObjects.Text` back, ready to call `.setOrigin(...)` /
 * `.setText(...)` etc. on.
 *
 * Why a helper rather than per-kind constants exported as raw style
 * objects: keeping the scene call site to ONE line (`text(this, x, y, str,
 * 'title')`) reads cleaner than `this.add.text(x, y, str, TitleStyle)` and
 * leaves room for the helper to grow (e.g. apply scale-aware font sizes
 * for mobile in Phase 1, set a `setOrigin(0.5)` default).
 *
 * This file is the ONLY file allowed to reference the `system-ui` literal.
 * If you find yourself adding another reference to that string, add a new
 * `kind` here instead.
 */

export const FONT_FAMILY = 'system-ui, -apple-system, sans-serif';

// --- Text colors ------------------------------------------------------------
// Distinct from `uiPalette.ts` (which holds Phaser hex numbers for shapes —
// fills, borders). Phaser's text-style API takes CSS hex STRINGS, so these
// are the string forms. The hex values intentionally mirror the palette
// where they overlap (TEXT_PRIMARY light grey ≈ canvas-foreground tone).

/** Primary text — high-contrast on the dark canvas backdrop. */
export const TEXT_PRIMARY = '#eaeaf2';
/** Muted/secondary text — subtitles, helper labels. */
export const TEXT_MUTED = '#9ca3af';
/** Subtitle inside a button (slightly lighter than TEXT_MUTED for in-button readability). */
export const TEXT_BUTTON_SUBTITLE = '#cbd5e1';
/** Accent text — selected values, highlights. */
export const TEXT_AMBER = '#facc15';
/** Warning / try-again copy. */
export const TEXT_AMBER_WARM = '#fbbf24';
/** Success / passed-round copy. */
export const TEXT_GREEN = '#34d399';
/** Focus ring color (rarely used in text — present for parity with palette). */
export const TEXT_BLUE = '#60a5fa';
/** Pure white — used very sparingly (only when other tones are too colored). */
export const TEXT_WHITE = '#ffffff';

// --- Kind vocabulary --------------------------------------------------------

export type TextKind =
  | 'title' // 64px, primary — main scene titles (mathBasher, Pick a Game)
  | 'h2' // 40-48px, primary — section headers (Settings, Round Complete!)
  | 'h3' // 36px, primary — sub-section headers (Pick Difficulty)
  | 'subtitle' // 20px, muted — under-title taglines
  | 'body' // 18px, primary — HUD score, in-line labels
  | 'bodyMuted' // 18px, muted — secondary in-line text
  | 'prompt' // 20px bold, amber — the active math question
  | 'accent' // 22-28px, amber — emphasized values like settings percent
  | 'success' // 24-40px, green — round-complete, +score popups
  | 'warning' // 24-40px, warm amber — try-again, fallback messages
  | 'stars' // 40px, amber — star row on Game Over
  | 'sectionLabel'; // 20px, muted — "Math Type" / "Speed" labels above tile groups

interface TextStyle {
  fontSize: string;
  color: string;
  fontStyle?: 'bold';
}

const STYLES: Readonly<Record<TextKind, TextStyle>> = {
  title: { fontSize: '64px', color: TEXT_PRIMARY },
  h2: { fontSize: '48px', color: TEXT_PRIMARY },
  h3: { fontSize: '36px', color: TEXT_PRIMARY },
  subtitle: { fontSize: '20px', color: TEXT_MUTED },
  body: { fontSize: '18px', color: TEXT_PRIMARY },
  bodyMuted: { fontSize: '18px', color: TEXT_MUTED },
  prompt: { fontSize: '20px', color: TEXT_AMBER, fontStyle: 'bold' },
  accent: { fontSize: '28px', color: TEXT_AMBER, fontStyle: 'bold' },
  success: { fontSize: '40px', color: TEXT_GREEN },
  warning: { fontSize: '40px', color: TEXT_AMBER_WARM },
  stars: { fontSize: '40px', color: TEXT_AMBER },
  sectionLabel: { fontSize: '20px', color: TEXT_MUTED },
};

/**
 * Add configured text to a scene at the given position with the given kind.
 * Convenience wrapper for `scene.add.text(x, y, str, { fontFamily, ... })`
 * that applies the canonical style for the `kind`.
 *
 * The returned object is a stock `Phaser.GameObjects.Text`; chain
 * `.setOrigin(0.5)`, `.setText(...)`, etc. as usual.
 *
 * Override knobs are intentionally NOT exposed — if a scene needs custom
 * sizing, either add a new `TextKind` here or use `this.add.text` directly
 * (the latter should be rare; consider whether the case is really one-off).
 */
export function text(
  scene: Phaser.Scene,
  x: number,
  y: number,
  str: string,
  kind: TextKind,
): Phaser.GameObjects.Text {
  const style = STYLES[kind];
  return scene.add.text(x, y, str, {
    fontFamily: FONT_FAMILY,
    fontSize: style.fontSize,
    color: style.color,
    ...(style.fontStyle !== undefined && { fontStyle: style.fontStyle }),
  });
}
