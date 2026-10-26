// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { config, type PuzzleLevel } from '@/core/config';
import { SceneKeys, gameSceneKeyFor } from '@/core/sceneKeys';
import { isRoundPuzzleId, type RoundPuzzleId } from '@/core/gameIds';
import { puzzleById } from '@/core/puzzles';
import { Settings } from '@/services/Settings';
import { getPuzzleProgress, starsFor } from '@/services/PuzzleProgress';
import { PlaceholderButton } from '@/game/ui/PlaceholderButton';
import { KeyboardNavigator } from '@/game/ui/KeyboardNavigator';
import { wireEscBack } from '@/game/ui/EscBackHandler';
import { text } from '@/game/ui/typography';
import { applyTextOutline } from '@/game/ui/callouts';
import { setupScene } from '@/game/scenes/sceneSetup';
import { createMuteIconButton } from '@/game/ui/MuteIconButton';
import type { ChallengePickerInit } from '@/game/services/challengeSelection';

const LEVELS: readonly PuzzleLevel[] = ['easy', 'medium', 'hard'];
const LEVEL_LABELS: Record<PuzzleLevel, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

/** The best line for a level: first-try answers and stars, said plainly. */
export function puzzleBestLine(best: number | null): string {
  if (best === null) return 'Get them right first time for ★★★!';
  const total = config.puzzles.perRound;
  return `Your best: ${String(best)} of ${String(total)} first time ${'★'.repeat(starsFor(best))}`;
}

/**
 * Sprint 2.14 — the puzzle pack's setup screen, shared by all seven:
 * "Pattern Train: how tough?", Easy / Medium / Hard with what changes, the
 * best at the chosen level, Back and Start. The level is remembered per
 * puzzle (`PuzzleProgress`). Reached through Loading (the picker's Puzzles
 * tab, Menu Start, the end panel's and the pause card's Change Difficulty);
 * Start goes straight to the puzzle, Back to the picker on Puzzles.
 */
export class PuzzleSetupScene extends Phaser.Scene {
  static readonly key = SceneKeys.PuzzleSetup;

  private id: RoundPuzzleId = 'pattern-train';
  private level: PuzzleLevel = 'easy';
  private tiles = new Map<PuzzleLevel, PlaceholderButton>();
  private bestText!: Phaser.GameObjects.Text;

  constructor() {
    super(PuzzleSetupScene.key);
  }

  create(): void {
    setupScene(this);
    const gameId = Settings.round.gameId;
    if (!isRoundPuzzleId(gameId)) {
      _th.logToAi('PuzzleSetupScene.notPuzzle', SeverityLevel.Warning, { gameId });
      this.goBack();
      return;
    }
    this.id = gameId;
    this.level = getPuzzleProgress().level(gameId);
    this.tiles.clear();

    const { width } = this.scale;
    const cx = width / 2;
    const S = config.puzzles.setup;
    const puzzle = puzzleById(gameId);

    text(this, cx, S.headingY, `${puzzle.label}: how tough?`, 'h2').setOrigin(0.5);
    createMuteIconButton(this, width - 16 - 22, 16 + 18);
    const intro = text(this, cx, S.introY, puzzle.blurb, 'subtitle').setOrigin(0.5);
    applyTextOutline(intro);

    const T = S.tile;
    const x0 = cx - T.w - T.gapX;
    LEVELS.forEach((level, i) => {
      const tile = new PlaceholderButton({
        scene: this,
        x: x0 + i * (T.w + T.gapX),
        y: S.tileY,
        width: T.w,
        height: T.h,
        label: LEVEL_LABELS[level],
        subtitle: config.puzzles.levelNotes[gameId][level],
        onClick: () => this.pick(level),
      });
      this.tiles.set(level, tile);
    });

    this.bestText = text(this, cx, S.bestY, '', 'bodyAccent').setOrigin(0.5);
    applyTextOutline(this.bestText);

    const back = new PlaceholderButton({
      scene: this,
      x: cx - 140,
      y: S.buttonsY,
      width: 200,
      height: 72,
      label: 'Back',
      onClick: () => this.goBack(),
    });
    const start = new PlaceholderButton({
      scene: this,
      x: cx + 120,
      y: S.buttonsY,
      width: 240,
      height: 72,
      label: 'Start',
      onClick: () => this.start(),
    });
    const order = [...this.tiles.values(), back, start];
    new KeyboardNavigator(this, order, { initialIndex: order.indexOf(start) });
    wireEscBack(this, () => this.goBack());
    this.refresh();
  }

  private pick(level: PuzzleLevel): void {
    this.level = level;
    this.refresh();
  }

  private refresh(): void {
    for (const [level, tile] of this.tiles) tile.setSelected(level === this.level);
    this.bestText.setText(puzzleBestLine(getPuzzleProgress().best(this.id, this.level)));
  }

  private start(): void {
    getPuzzleProgress().setLevel(this.id, this.level);
    this.scene.start(gameSceneKeyFor(this.id));
  }

  /** Back to the picker, on the Puzzles tab. */
  private goBack(): void {
    const init: ChallengePickerInit = {
      next: SceneKeys.GameSelect,
      back: SceneKeys.Menu,
      source: 'menu',
      subject: 'puzzles',
    };
    this.scene.start(SceneKeys.ChallengePicker, init);
  }
}
