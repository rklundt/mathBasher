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

// Sprint 0.7 Story 7 — swap default font from system-ui to Baloo 2.
// Baloo 2 is a rounded, friendly, bold sans-serif that fits the
// "kid-friendly arcade math game" aesthetic. Loaded via Google Fonts
// `<link>` in `index.html` with `display=swap` (no FOIT — falls back
// to system-ui until Baloo 2 is ready, then re-renders).
//
// Keeping the fallback chain `system-ui, -apple-system, sans-serif` so
// any failed font load (network blocked, font deleted from Google,
// etc.) degrades gracefully to platform defaults instead of generic
// serif.
//
// ROLLBACK: replace 'Baloo 2' with the old chain at the front. One-line
// revert; no other code change needed. The Google Fonts <link> in
// index.html can stay (unused) or be removed.
export const FONT_FAMILY = "'Baloo 2', system-ui, -apple-system, sans-serif";

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
  // --- Existing scene-absolute kinds (used via `text(scene, x, y, str, kind)`) ---
  | 'title' // primary — main scene titles (mathBasher, Pick a Game)
  | 'h2' // primary — section headers (Settings, Round Complete!)
  | 'h3' // primary — sub-section headers (Pick Difficulty)
  | 'subtitle' // muted — under-title taglines
  | 'body' // primary — HUD score, Q counter, generic in-line labels
  | 'bodyMuted' // muted — secondary in-line text
  | 'bodyLarge' // primary — slightly larger body (BootScene "Loading…")
  | 'bodyAccent' // amber — same size as body, accent color (MenuScene placeholder)
  | 'prompt' // amber bold — the active math question (HudScene)
  | 'accent' // amber bold — emphasized values like settings percent
  | 'success' // green — round-complete success copy
  | 'warning' // warm amber — try-again, fallback messages
  | 'stars' // amber — star row on Game Over
  | 'sectionLabel' // primary bold — pronounced section dividers ("Math Type", "Speed", "Volume")
  // --- Sprint 0.7.5 Story 3 additions ---
  | 'headline' // primary — extra-large overlay headline (PauseOverlay "Paused")
  | 'summary' // primary — multi-line score summary (GameOverScene)
  | 'scorePopup' // green bold — the floating "+100" popup at alien hit position
  | 'badge' // warm-amber bold — "★ New High Score! ★" badge
  | 'rowLabel' // primary — settings-row label (SettingsScene volume rows)
  | 'iconGlyph' // primary — emoji glyphs inside icon buttons (mute speaker)
  | 'footer' // primary — AGPL §7(b) footer text (left side)
  | 'footerLink' // blue — AGPL §7(b) footer source URL (right side)
  // --- Container-anchored kinds (used via `textStyle(kind)` spread, see below) ---
  | 'alienAnswer' // white bold — number on the falling block (geometrically linked to plateLayers in Alien.ts)
  | 'buttonLabel' // primary — main label inside PlaceholderButton
  | 'buttonSubtitle' // button-subtitle grey — secondary line inside PlaceholderButton
  | 'fireLabel'; // dark bold — FIRE label inside the warm-amber TouchFireButton

interface TextStyle {
  fontSize: string;
  color: string;
  fontStyle?: 'bold';
}

// Sprint 0.7.5 typography sizing.
//
// Tuning history (newest first):
//   v0.7.5 Story 3: every inline `fontSize:` literal across the 11 scene/
//     entity/UI files was collapsed into this STYLES table. New kinds added
//     for the previously-inline sites: headline, summary, scorePopup, badge,
//     rowLabel, iconGlyph, footer, footerLink, alienAnswer, buttonLabel,
//     buttonSubtitle, fireLabel, bodyLarge, bodyAccent. Any future "make
//     all text 10% bigger" pass is a 1-file edit here, not 18 hand-bumps
//     across 11 files.
//   v0.7.5 Story 1: universal +20% bump from the v0.7 Baloo-2 baselines
//     for mobile readability (Baloo 2 reads cleanly on desktop but text was
//     uncomfortably small on phone-sized viewports after FIT-scaling halved
//     the design-px sizes). Pre-Story 3, this bump touched 18 inline sites
//     in addition to this table — the duplicate-bump pain is what motivated
//     Story 3.
//   v0.7: sizes inherited from earlier sprints, font swapped to Baloo 2.
//
// To globally rescale (e.g. "shrink all text 10%"), divide every fontSize
// number here by 1.1 — this is the only place to edit.
const STYLES: Readonly<Record<TextKind, TextStyle>> = {
  // Headings + body
  title: { fontSize: '76px', color: TEXT_PRIMARY },
  h2: { fontSize: '58px', color: TEXT_PRIMARY },
  h3: { fontSize: '44px', color: TEXT_PRIMARY },
  subtitle: { fontSize: '24px', color: TEXT_MUTED },
  body: { fontSize: '22px', color: TEXT_PRIMARY },
  bodyMuted: { fontSize: '22px', color: TEXT_MUTED },
  bodyLarge: { fontSize: '24px', color: TEXT_PRIMARY },
  bodyAccent: { fontSize: '22px', color: TEXT_AMBER },
  prompt: { fontSize: '24px', color: TEXT_AMBER, fontStyle: 'bold' },
  accent: { fontSize: '34px', color: TEXT_AMBER, fontStyle: 'bold' },
  success: { fontSize: '48px', color: TEXT_GREEN },
  warning: { fontSize: '48px', color: TEXT_AMBER_WARM },
  stars: { fontSize: '48px', color: TEXT_AMBER },
  // Sprint 0.7.5 Story 5 — bumped from 24px muted → 32px primary bold so
  // section headings ("Math Type", "Speed", "Volume") read as clear
  // dividers instead of fading into the background. Used by
  // DifficultyScene + SettingsScene; both screens benefit.
  sectionLabel: { fontSize: '32px', color: TEXT_PRIMARY, fontStyle: 'bold' },
  // Story 3 additions — scene-absolute
  headline: { fontSize: '67px', color: TEXT_PRIMARY },
  summary: { fontSize: '29px', color: TEXT_PRIMARY },
  scorePopup: { fontSize: '29px', color: TEXT_GREEN, fontStyle: 'bold' },
  badge: { fontSize: '26px', color: TEXT_AMBER_WARM, fontStyle: 'bold' },
  rowLabel: { fontSize: '26px', color: TEXT_PRIMARY },
  iconGlyph: { fontSize: '26px', color: TEXT_PRIMARY }, // color is irrelevant for emoji glyphs but required by TextStyle
  footer: { fontSize: '14px', color: TEXT_PRIMARY },
  footerLink: { fontSize: '14px', color: TEXT_BLUE },
  // Story 3 additions — container-anchored (consumed via `textStyle(kind)`)
  alienAnswer: { fontSize: '38px', color: TEXT_WHITE, fontStyle: 'bold' },
  buttonLabel: { fontSize: '24px', color: TEXT_PRIMARY },
  // Sprint 1.1 wrap-up — bumped 17 → 21 (+24%) for mobile readability. At
  // a 390-CSS-px-wide phone viewport, the FIT-scaled 17px design font
  // becomes ~5px CSS-px, borderline unreadable for the wrapped subtitle
  // on the math-difficulty tiles. 21px scales to ~6.4px which is more
  // legible while still fitting the wrapped 2-line layout in the
  // sprint-1.1-bumped 116-tall math tile (see DifficultyScene
  // renderMathTypes for the matching tile-height bump).
  buttonSubtitle: { fontSize: '21px', color: TEXT_BUTTON_SUBTITLE },
  // FIRE label uses dark canvas color on warm-amber bg → ~10:1 contrast
  // (intentional; do NOT fold into a generic primary-color buttonLabel).
  fireLabel: { fontSize: '22px', color: '#0b1020', fontStyle: 'bold' },
};

/**
 * Add configured text to a scene at the given position with the given kind.
 * Convenience wrapper for `scene.add.text(x, y, str, { fontFamily, ... })`
 * that applies the canonical style for the `kind`. Use this for SCENE-
 * ABSOLUTE coordinates.
 *
 * The returned object is a stock `Phaser.GameObjects.Text`; chain
 * `.setOrigin(0.5)`, `.setText(...)`, etc. as usual.
 *
 * For text inside a Container (local 0,0 coords), use `textStyle(kind)`
 * below to get the style object and pass it to `this.add.text(...)`
 * directly so the Container's own transform applies.
 */
export function text(
  scene: Phaser.Scene,
  x: number,
  y: number,
  str: string,
  kind: TextKind,
): Phaser.GameObjects.Text {
  return scene.add.text(x, y, str, textStyle(kind));
}

/**
 * Returns the canonical Phaser text-style object for a kind, ready to spread
 * into `scene.add.text(x, y, str, style)`. Use this when:
 *  - the text is anchored inside a Container (the `text()` helper above
 *    assumes scene-absolute coords; callers like PlaceholderButton,
 *    TouchFireButton, and Alien need to add via Container-local coords)
 *  - the call site needs to add extra options (e.g. `align: 'center'`)
 *    on top of the canonical style: `{ ...textStyle('summary'), align: 'center' }`
 *
 * This is the ONLY supported way to use a TextKind outside the `text()`
 * helper. Inline `fontSize:` literals in scene/entity/UI code violate the
 * Story 3 rule that typography.ts is the single source of truth for sizes.
 */
export function textStyle(kind: TextKind): Phaser.Types.GameObjects.Text.TextStyle {
  const style = STYLES[kind];
  return {
    fontFamily: FONT_FAMILY,
    fontSize: style.fontSize,
    color: style.color,
    ...(style.fontStyle !== undefined && { fontStyle: style.fontStyle }),
  };
}
