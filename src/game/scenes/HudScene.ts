// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { SceneKeys } from '@/core/sceneKeys';
import { config } from '@/core/config';
import type { Question } from '@/math/types';

interface QuestionStartedPayload {
  question: Question;
  index: number;
  total: number;
}

interface QuestionEndedPayload {
  wasCorrect: boolean;
  score: number;
  correctCount: number;
}

/**
 * Heads-up display, runs in PARALLEL with GameScene. Listens for events
 * GameScene emits and updates the top bar:
 *
 *   Score: 1500    7 + 5 = ?    Q: 5/20
 *
 * Score popup ("+200") rises briefly when a question is answered correctly,
 * giving snappy positive feedback in addition to the score-counter update.
 */
export class HudScene extends Phaser.Scene {
  static readonly key = SceneKeys.Hud;

  private scoreText!: Phaser.GameObjects.Text;
  private promptText!: Phaser.GameObjects.Text;
  private counterText!: Phaser.GameObjects.Text;
  private gameSceneListenersBound = false;

  constructor() {
    super(HudScene.key);
  }

  create(): void {
    _th.logToAi('HudScene Started', SeverityLevel.Information);

    const { width } = this.scale;
    const barHeight = 48;

    const bg = this.add.rectangle(0, 0, width, barHeight, 0x000000, 0.45);
    bg.setOrigin(0, 0);

    this.scoreText = this.add
      .text(16, barHeight / 2, 'Score: 0', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        color: '#eaeaf2',
      })
      .setOrigin(0, 0.5);

    this.promptText = this.add
      .text(width / 2, barHeight / 2, '— + — = ?', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '20px',
        color: '#facc15',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.counterText = this.add
      .text(width - 16, barHeight / 2, `Q: 0/${config.round.questionsPerRound}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        color: '#eaeaf2',
      })
      .setOrigin(1, 0.5);

    // Bind to GameScene events. The GameScene event emitter is per-scene
    // and lives as long as the scene; we listen via scene.get(...).events.
    this.bindGameSceneEvents();

    this.events.once('shutdown', () => {
      this.unbindGameSceneEvents();
      _th.logToAi('HudScene Completed', SeverityLevel.Information);
    });
  }

  private bindGameSceneEvents(): void {
    if (this.gameSceneListenersBound) return;
    const gameScene = this.scene.get(SceneKeys.Game);
    if (!gameScene) return;
    gameScene.events.on('questionStarted', this.onQuestionStarted, this);
    gameScene.events.on('questionEnded', this.onQuestionEnded, this);
    this.gameSceneListenersBound = true;
  }

  private unbindGameSceneEvents(): void {
    if (!this.gameSceneListenersBound) return;
    const gameScene = this.scene.get(SceneKeys.Game);
    if (gameScene) {
      gameScene.events.off('questionStarted', this.onQuestionStarted, this);
      gameScene.events.off('questionEnded', this.onQuestionEnded, this);
    }
    this.gameSceneListenersBound = false;
  }

  private onQuestionStarted(payload: QuestionStartedPayload): void {
    this.promptText.setText(payload.question.prompt);
    this.counterText.setText(`Q: ${payload.index + 1}/${payload.total}`);
  }

  private onQuestionEnded(payload: QuestionEndedPayload): void {
    const oldScore = this.parseScore(this.scoreText.text);
    const delta = payload.score - oldScore;
    this.scoreText.setText(`Score: ${payload.score}`);
    if (payload.wasCorrect && delta > 0) {
      this.popupScoreDelta(delta);
    }
  }

  private parseScore(s: string): number {
    const m = /Score: (\d+)/.exec(s);
    return m ? Number(m[1]) : 0;
  }

  /**
   * Brief floating "+N" text above the score counter for positive feedback.
   * Auto-destroys after the tween completes.
   */
  private popupScoreDelta(delta: number): void {
    const popup = this.add
      .text(80, 60, `+${delta}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '20px',
        color: '#34d399',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);
    this.tweens.add({
      targets: popup,
      y: 30,
      alpha: 0,
      duration: 700,
      ease: 'Quad.Out',
      onComplete: () => popup.destroy(),
    });
  }
}
