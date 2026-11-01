// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Sprint 2.16 — the looks the Words and Numbers puzzles play in. Owner
 * (2026-11-01): "a lot of these games could be both 'cute' and 'aliens'
 * with different images and music/sounds, with same back end game play".
 * A look changes only what a puzzle looks and sounds like: its backdrops,
 * dancers, music, right / wrong sounds, colours and stage pieces (the
 * theme kits: `spriteKeys.PUZZLE_THEME_ART`, `audioKeys.PUZZLE_THEME_SOUNDS`,
 * `ui/puzzleThemeLook.ts`). The puzzles themselves never read it.
 *
 * Picked on the puzzle's setup screen for now (how it's picked may change)
 * and remembered per puzzle (`PuzzleProgress`).
 */
export type PuzzleTheme = 'critters' | 'cosmos';

export interface PuzzleThemeInfo {
  readonly id: PuzzleTheme;
  /** Its tile's name on the setup screen. */
  readonly label: string;
  /** Its tile's line. */
  readonly line: string;
}

export const PUZZLE_THEMES: readonly PuzzleThemeInfo[] = [
  // Owner (2026-11-01): "Animal Pals / Space Invaders"; that second name is
  // an arcade game's trademark, so the space look is "Alien Invaders".
  { id: 'critters', label: 'Animal Pals', line: 'Kawaii pals, unicorns and dragons' },
  { id: 'cosmos', label: 'Alien Invaders', line: 'Little aliens and friendly bots' },
];

export const DEFAULT_PUZZLE_THEME: PuzzleTheme = 'critters';

export function isPuzzleTheme(x: unknown): x is PuzzleTheme {
  return PUZZLE_THEMES.some((t) => t.id === x);
}
