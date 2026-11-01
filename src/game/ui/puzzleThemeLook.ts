// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type { PuzzleTheme } from '@/core/puzzleThemes';

/**
 * Sprint 2.16 — the colours each look draws its stage pieces in (the art
 * itself is in `spriteKeys.PUZZLE_THEME_ART`). Cards stay cream in both
 * looks so words and numbers always read the same.
 */
export interface ThemeColours {
  /** Odd One Out's shelf (Animal Pals: wood; Alien Invaders: a hover platform). */
  readonly shelf: number;
  readonly shelfLeg: number;
  /** Quick Count's mat and Make Ten's table. */
  readonly mat: number;
  readonly matEdge: number;
  /** Letter Garden's tiles: plain, traced, and the edge of the garden bed. */
  readonly tile: number;
  readonly tileOn: number;
  readonly bed: number;
  /** The line a trace draws, and the arrows between cards. */
  readonly trace: number;
  readonly arrow: number;
  /** Text drawn straight on the backdrop (dark on Animal Pals' pastels, light on space). */
  readonly onBackdrop: string;
}

export const THEME_COLOURS: Readonly<Record<PuzzleTheme, ThemeColours>> = {
  critters: {
    shelf: 0xc98b5a,
    shelfLeg: 0xa86a3c,
    mat: 0xfff4e6,
    matEdge: 0xf783ac,
    tile: 0xfffaf0,
    tileOn: 0xffd43b,
    bed: 0x8ce99a,
    trace: 0xf783ac,
    arrow: 0xb197fc,
    onBackdrop: '#3a2420',
  },
  cosmos: {
    shelf: 0x868e96,
    shelfLeg: 0x63e6be,
    mat: 0x1c2541,
    matEdge: 0x63e6be,
    tile: 0xe9ecef,
    tileOn: 0x63e6be,
    bed: 0x495057,
    trace: 0x63e6be,
    arrow: 0x63e6be,
    onBackdrop: '#f8f9fa',
  },
};
