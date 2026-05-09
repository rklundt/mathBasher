// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel, type TelemetryProps } from '@/core/telemetry';
import { config, type MathId, type SpeedKey } from '@/core/config';
import { SceneKeys } from '@/core/sceneKeys';
import { PlaceholderButton } from '@/game/ui/PlaceholderButton';
import { KeyboardNavigator } from '@/game/ui/KeyboardNavigator';

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
 * "You failed", per the Support reviewer's frustration-protection guidance.
 *
 * Sprint 0.5 wires this to actually save scores via the IScoreStore (and to
 * detect "New high score!"); sprint 0.7 polishes the visuals (animated stars,
 * count-up score, etc.).
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

    _th.logToAi('GameOverScene Started', SeverityLevel.Information, props);

    const { width, height } = this.scale;
    const cx = width / 2;

    const headline = this.roundData.passed ? 'Round Complete!' : 'Round Done — Try Again?';
    this.add
      .text(cx, height * 0.18, headline, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '40px',
        color: this.roundData.passed ? '#34d399' : '#fbbf24',
      })
      .setOrigin(0.5);

    this.add
      .text(
        cx,
        height * 0.32,
        `Score: ${this.roundData.score}\nCorrect: ${this.roundData.correctCount} / ${config.round.questionsPerRound}`,
        {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '24px',
          color: '#eaeaf2',
          align: 'center',
        },
      )
      .setOrigin(0.5);

    this.add
      .text(cx, height * 0.46, this.renderStars(), {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '40px',
        color: '#facc15',
      })
      .setOrigin(0.5);

    const playAgain = new PlaceholderButton({
      scene: this,
      x: cx,
      y: height * 0.62,
      width: 240,
      height: 56,
      label: 'Play Again',
      onClick: () => this.scene.start(SceneKeys.Game),
    });

    const changeDifficulty = new PlaceholderButton({
      scene: this,
      x: cx,
      y: height * 0.72,
      width: 240,
      height: 56,
      label: 'Change Difficulty',
      onClick: () => this.scene.start(SceneKeys.Difficulty),
    });

    const mainMenu = new PlaceholderButton({
      scene: this,
      x: cx,
      y: height * 0.82,
      width: 240,
      height: 56,
      label: 'Main Menu',
      onClick: () => this.scene.start(SceneKeys.Menu),
    });

    new KeyboardNavigator(this, [playAgain, changeDifficulty, mainMenu]);

    this.events.once('shutdown', () => {
      _th.logToAi('GameOverScene Completed', SeverityLevel.Information);
    });
  }

  private renderStars(): string {
    const filled = '★'.repeat(this.roundData.stars);
    const empty = '☆'.repeat(3 - this.roundData.stars);
    return filled + empty;
  }
}
