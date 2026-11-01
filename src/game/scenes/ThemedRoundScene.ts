// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type { TelemetryProps } from '@/core/telemetry';
import { THEMED_PUZZLE_IDS, type ThemedPuzzleId } from '@/core/gameIds';
import { DEFAULT_PUZZLE_THEME, type PuzzleTheme } from '@/core/puzzleThemes';
import { PUZZLE_THEME_ART, type PuzzleThemeArt } from '@/core/spriteKeys';
import { PUZZLE_THEME_SOUNDS } from '@/core/audioKeys';
import { getPuzzleProgress } from '@/services/PuzzleProgress';
import { PuzzleRoundScene, type PuzzleRoundLook } from '@/game/scenes/PuzzleRoundScene';
import { THEME_COLOURS, type ThemeColours } from '@/game/ui/puzzleThemeLook';
import { ThemeFlyers } from '@/game/ui/themeFlyers';
import { PUZZLE_DEPTH } from '@/game/ui/puzzleFrame';

/**
 * Sprint 2.16 — a Words or Numbers round: a puzzle-pack round played in the
 * look picked on its setup screen (`PuzzleProgress.theme`). The look sets
 * the backdrops, dancers, music and sounds here, and the stage art and
 * colours the scenes draw with (`art`, `colours`), and what drifts across
 * the backdrop (`ui/themeFlyers.ts`); the puzzles never see it.
 */
export abstract class ThemedRoundScene extends PuzzleRoundScene {
  protected theme: PuzzleTheme = DEFAULT_PUZZLE_THEME;
  protected art: PuzzleThemeArt = PUZZLE_THEME_ART[DEFAULT_PUZZLE_THEME];
  protected colours: ThemeColours = THEME_COLOURS[DEFAULT_PUZZLE_THEME];

  protected look(): PuzzleRoundLook {
    const id = this.id as ThemedPuzzleId;
    this.theme = getPuzzleProgress().theme(id);
    this.art = PUZZLE_THEME_ART[this.theme];
    this.colours = THEME_COLOURS[this.theme];
    const sounds = PUZZLE_THEME_SOUNDS[this.theme];
    return {
      backdrops: this.art.backdrops,
      dancers: this.art.dancers,
      // Each puzzle plays the track at its place in the list, so neighbours differ.
      music: sounds.music[THEMED_PUZZLE_IDS.indexOf(id) % sounds.music.length],
      right: sounds.right,
      wrong: sounds.wrong,
    };
  }

  /** The look's flyers drift across behind the puzzle. */
  protected decorate(): void {
    new ThemeFlyers(this, this.art, PUZZLE_DEPTH.ambience + 1);
  }

  protected props(): TelemetryProps {
    return { ...super.props(), theme: this.theme };
  }
}
