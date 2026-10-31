// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { config, type PuzzleLevel } from '@/core/config';
import { SceneKeys, gameSceneKeyFor } from '@/core/sceneKeys';
import { isRoundPuzzleId, type RoundPuzzleId } from '@/core/gameIds';
import { Settings } from '@/services/Settings';
import { getPuzzleProgress, starsFor } from '@/services/PuzzleProgress';
import { getRememberedPicks } from '@/services/RememberedPicks';
import { puzzleRoundMax } from '@/services/puzzlePoints';
import { formatPoints } from '@/services/challengePoints';
import type { PlaceholderButton } from '@/game/ui/PlaceholderButton';
import { KeyboardNavigator } from '@/game/ui/KeyboardNavigator';
import { createChoiceTile } from '@/game/ui/choiceTile';
import { createSetupFrame, sectionHeading, type SetupFrame } from '@/game/ui/setupFrame';
import { text } from '@/game/ui/typography';
import { setupScene } from '@/game/scenes/sceneSetup';
import { openChooser } from '@/game/services/chooserNavigation';

const LEVELS: readonly PuzzleLevel[] = ['easy', 'medium', 'hard'];
const LEVEL_LABELS: Record<PuzzleLevel, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

/** The best line for a level: green answers and stars, said plainly. */
export function puzzleBestLine(best: number | null): string {
  if (best === null) return 'Get them all green for ★★★!';
  const total = config.puzzles.perRound;
  return `Your best: ${String(best)} of ${String(total)} green ${'★'.repeat(starsFor(best))}`;
}

/** "Up to 1,500 points!" under a level: the round's top score there. */
export function puzzleUpToLabel(level: PuzzleLevel): string {
  return `Up to ${formatPoints(puzzleRoundMax(level))} points!`;
}

/**
 * Sprint 2.14 — the puzzle pack's setup screen, shared by all seven: Easy /
 * Medium / Hard with what changes, the best at the chosen level, and Start.
 * The level is remembered per puzzle (`PuzzleProgress`).
 *
 * Sprint 2.15 — restyled to the chooser's look: the top bar with the
 * puzzle's picture and name, the trail (Puzzles › Missing Piece), "How
 * tough?" with "Up to N points!" under each level, the best line and a big
 * Start. Reached through Loading from the chooser, and from the pause card
 * and the end panel's Change Difficulty; Back goes to the puzzles.
 */
export class PuzzleSetupScene extends Phaser.Scene {
  static readonly key = SceneKeys.PuzzleSetup;

  private id: RoundPuzzleId = 'pattern-train';
  private level: PuzzleLevel = 'easy';
  private tiles = new Map<PuzzleLevel, PlaceholderButton>();
  private frame!: SetupFrame;

  constructor() {
    super(PuzzleSetupScene.key);
  }

  create(): void {
    setupScene(this);
    const gameId = Settings.round.gameId;
    if (!isRoundPuzzleId(gameId)) {
      _th.logToAi('PuzzleSetupScene.notPuzzle', SeverityLevel.Warning, { gameId });
      openChooser(this);
      return;
    }
    this.id = gameId;
    this.level = getPuzzleProgress().level(gameId);
    this.tiles.clear();

    this.frame = createSetupFrame(this, gameId, 'PuzzleSetupScene', () => this.start());
    const P = config.layout.chooser.puzzleSetup;
    sectionHeading(this, P.headingY, 'How tough?');

    const T = P.tiles;
    const x0 = this.scale.width / 2 - T.w - T.gapX;
    LEVELS.forEach((level, i) => {
      const x = x0 + i * (T.w + T.gapX);
      const tile = createChoiceTile({
        scene: this,
        x,
        y: T.y,
        width: T.w,
        height: T.h,
        name: LEVEL_LABELS[level],
        nameKind: 'tileNameLarge',
        lines: [{ text: config.puzzles.levelNotes[gameId][level], kind: 'tileLine' }],
        radius: config.layout.corners.tilePx,
        shadow: config.layout.corners.tileShadow,
        onClick: () => this.pick(level),
      });
      text(this, x, T.y + T.h / 2 + P.upToGapPx, puzzleUpToLabel(level), 'upTo').setOrigin(0.5, 0);
      this.tiles.set(level, tile);
    });

    const order = [...this.frame.top, ...this.tiles.values(), this.frame.start];
    new KeyboardNavigator(this, order, { initialIndex: order.indexOf(this.frame.start) });
    this.refresh();
  }

  private pick(level: PuzzleLevel): void {
    this.level = level;
    // Saved now, not on Start, so a trip to My Scores (or the games list) keeps it.
    getPuzzleProgress().setLevel(this.id, level);
    this.refresh();
  }

  private refresh(): void {
    for (const [level, tile] of this.tiles) tile.setSelected(level === this.level);
    this.frame.best.setText(puzzleBestLine(getPuzzleProgress().best(this.id, this.level)));
  }

  private start(): void {
    getPuzzleProgress().setLevel(this.id, this.level);
    getRememberedPicks().setLastGame(this.id);
    this.scene.start(gameSceneKeyFor(this.id));
  }
}
