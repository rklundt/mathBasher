// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Single source of truth for the project's UI palette. Every button,
 * border, focus ring, and chrome surface should reference these constants
 * rather than inlining a hex literal.
 *
 * Why a single palette: pre-refactor, the same hex (`0x1f2740` slate fill,
 * `0x60a5fa` focus blue, `0xfacc15` selected amber) appeared in
 * `PlaceholderButton`, both HudScene icon-button bodies, and the splash
 * inline CSS — same color, four homes. A future "make all controls
 * higher-contrast for outdoor phone use" change should be a 1-file edit
 * here, not a 4-file find-replace.
 *
 * Number values here are Phaser hex (no `#` prefix) — directly usable as
 * `setFillStyle(SLATE_BG)`, `setStrokeStyle(2, BORDER_GREY)`.
 *
 * The splash screen in `index.html` uses CSS hex strings (`#1f2740` etc.)
 * for the same colors — keep that in sync by hand if values change here
 * (CSS is loaded before any TS module so it can't import these). The
 * canonical CSS hex equivalents are documented in the comments below.
 */

// --- Surfaces (button bodies, panels) ---------------------------------------

/** Default button fill — deep slate, sits cleanly on the canvas backdrop. */
export const SLATE_BG = 0x1f2740; // #1f2740
/** Hover/active fill — slightly brighter slate for pointer-feedback state. */
export const SLATE_HOVER = 0x2a3454; // #2a3454
/** Disabled-button fill — darker, dimmer; signals "not available." */
export const DISABLED_BG = 0x161b2c; // #161b2c

// --- Borders + focus ring ---------------------------------------------------

/** Default border on idle controls. */
export const BORDER_GREY = 0x6b7280; // #6b7280
/** Disabled-control border (matches BORDER_GREY but rendered with reduced alpha). */
export const BORDER_GREY_DISABLED = 0x374151; // #374151
/** Keyboard-focus ring — distinct blue so it never looks like the selected amber. */
export const FOCUS_BLUE = 0x60a5fa; // #60a5fa
/** Selected-state border (amber) — the "you picked this" indicator. */
export const SELECTED_AMBER = 0xfacc15; // #facc15

// --- HUD-icon variants ------------------------------------------------------

/**
 * Mute icon's background tint — warm-amber-tinted slate. Visually distinct
 * from the Pause icon's pure slate so a kid mid-round doesn't accidentally
 * pause when they meant to mute. Keep this distinct from `SLATE_BG`.
 */
export const MUTE_ICON_BG = 0x2a2640; // amber-leaning slate
/** Mute icon hover — slightly brighter than MUTE_ICON_BG. */
export const MUTE_ICON_HOVER = 0x3a3454;
