// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel, type TelemetryProps } from '@/core/telemetry';
import { config, type MathId, type SpeedKey } from '@/core/config';
import { SceneKeys } from '@/core/sceneKeys';
import { Settings } from '@/services/Settings';
import { getScoreStore } from '@/services/scoreStoreFactory';
import type { ScoreEntry, ScoreFilter } from '@/services/IScoreStore';
import { KeyboardNavigator } from '@/game/ui/KeyboardNavigator';
import { stackButtons } from '@/game/ui/MenuLayout';
import { wireEscBack } from '@/game/ui/EscBackHandler';
import { text, FONT_FAMILY, TEXT_AMBER_WARM } from '@/game/ui/typography';
import { setupScene } from '@/game/scenes/sceneSetup';

export interface GameOverData {
  score: number;
  correctCount: number;
  passed: boolean;
  stars: 0 | 1 | 2 | 3;
  mathId: MathId | null;
  speed: SpeedKey | null;
}

/**
 * End-of-round screen. Receives `{ score, correctCount, passed, stars, mathId,
 * speed }` via Phaser scene-data on transition.
 *
 * Copy is deliberately kid-friendly — `passed === false` says "Try again" not
 * "You failed". Game-over messaging that reads as punishment ("You failed",
 * "You died") discourages a kid from immediately restarting; "Try again"
 * frames the next round as an invitation.
 *
 * v0.5 wires this to actually save scores via the IScoreStore (and to detect
 * "New high score!"); a later visual-polish pass animates the stars and adds
 * a count-up score effect.
 */
export class GameOverScene extends Phaser.Scene {
  private roundData!: GameOverData;

  static readonly key = SceneKeys.GameOver;

  constructor() {
    super(GameOverScene.key);
  }

  init(data: GameOverData): void {
    this.roundData = data;
  }


  create(): void {
    const props: TelemetryProps = {
      gameId: 'alien-shoot',
      roundScore: String(this.roundData.score),
      roundCorrectCount: String(this.roundData.correctCount),
      passed: String(this.roundData.passed),
    };
    if (this.roundData.mathId) props.mathId = this.roundData.mathId;
    if (this.roundData.speed) props.speed = this.roundData.speed;

    // setupScene forwards the round-specific props onto the Started event
    // for telemetry filtering (so a query can answer "what's the average
    // round score across passed runs of add-to-10 at medium speed").
    setupScene(this, props);

    // Save the score asynchronously and check for new high score. The
    // IScoreStore methods are Promise-returning so a future ApiScoreStore is a
    // drop-in; SessionScoreStore resolves immediately. We don't BLOCK the UI
    // on the save — render the screen first, then asynchronously update with
    // the "New high score!" badge if appropriate.
    if (this.roundData.mathId && this.roundData.speed) {
      void this.saveAndCheckHighScore(this.roundData.mathId, this.roundData.speed);
    }

    const { width, height } = this.scale;
    const cx = width / 2;

    const headline = this.roundData.passed ? 'Round Complete!' : 'Round Done — Try Again?';
    text(this, cx, height * 0.18, headline, this.roundData.passed ? 'success' : 'warning')
      .setOrigin(0.5);

    // 24px primary text on a multi-line score-summary line — close to body
    // sizing but two-up. Inline (with FONT_FAMILY) so the literal stays
    // in typography.ts only; not promoting to a TextKind because no other
    // scene needs this exact size.
    this.add
      .text(
        cx,
        height * 0.32,
        `Score: ${this.roundData.score}\nCorrect: ${this.roundData.correctCount} / ${config.round.questionsPerRound}`,
        {
          fontFamily: FONT_FAMILY,
          fontSize: '24px',
          color: '#eaeaf2',
          align: 'center',
        },
      )
      .setOrigin(0.5);

    text(this, cx, height * 0.46, this.renderStars(), 'stars').setOrigin(0.5);

    const buttons = stackButtons(this, {
      centerY: height * 0.72,
      items: [
        {
          label: 'Play Again',
          onClick: () => {
            // Defensive: re-set Settings to the round we just played, so
            // Play Again works even if a future code path resets Settings
            // (e.g. on round-end cleanup that hasn't been written yet).
            // GameScene reads Settings on create, so this is enough to
            // preserve the user's intent across the bounce.
            if (this.roundData.mathId) Settings.setMathId(this.roundData.mathId);
            if (this.roundData.speed) Settings.setSpeed(this.roundData.speed);
            this.scene.start(SceneKeys.Game);
          },
        },
        {
          label: 'Change Difficulty',
          kind: 'secondary',
          onClick: () => this.scene.start(SceneKeys.Difficulty),
        },
        {
          label: 'Main Menu',
          kind: 'secondary',
          onClick: () => this.scene.start(SceneKeys.Menu),
        },
      ],
    });

    new KeyboardNavigator(this, buttons);

    // Esc on Game Over = Main Menu (matches the existing button's destination).
    wireEscBack(this, () => this.scene.start(SceneKeys.Menu));
  }

  private renderStars(): string {
    const filled = '★'.repeat(this.roundData.stars);
    const empty = '☆'.repeat(3 - this.roundData.stars);
    return filled + empty;
  }

  /**
   * Persist the round result and detect "New high score!" — read the previous
   * best for this combo BEFORE saving (otherwise we'd always tie our own
   * just-saved score), then save, then optionally show the badge.
   */
  private async saveAndCheckHighScore(mathId: MathId, speed: SpeedKey): Promise<void> {
    const store = getScoreStore();
    const filter: ScoreFilter = { gameId: 'alien-shoot', mathId, speed };

    const previousBest = await store.bestForCombo(filter);

    const entry: ScoreEntry = {
      gameId: 'alien-shoot',
      mathId,
      speed,
      score: this.roundData.score,
      correctCount: this.roundData.correctCount,
      passed: this.roundData.passed,
      achievedAt: Date.now(),
    };

    await store.save(entry);

    _th.logToAi('HighScoreSaved', SeverityLevel.Information, {
      gameId: 'alien-shoot',
      mathId,
      speed,
      roundScore: String(this.roundData.score),
    });

    // Beat the previous best (or there was no previous best AND we scored)?
    const isNewHighScore =
      this.roundData.score > 0 &&
      (previousBest === null || this.roundData.score > previousBest.score);

    if (isNewHighScore && this.scene.isActive()) {
      const { width, height } = this.scale;
      // One-off badge style (22px bold warm-amber). Inline via FONT_FAMILY
      // + TEXT_AMBER_WARM constants to keep the font literal centralized.
      const badge = this.add
        .text(width / 2, height * 0.54, '★ New High Score! ★', {
          fontFamily: FONT_FAMILY,
          fontSize: '22px',
          color: TEXT_AMBER_WARM,
          fontStyle: 'bold',
        })
        .setOrigin(0.5);
      this.tweens.add({
        targets: badge,
        scale: { from: 0.5, to: 1 },
        alpha: { from: 0, to: 1 },
        duration: 400,
        ease: 'Back.Out',
      });
    }
  }
}
