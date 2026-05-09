// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { SceneKeys } from '@/core/sceneKeys';
import { config } from '@/core/config';
import type { Question } from '@/math/types';
import type { GameScene } from '@/game/scenes/GameScene';
import type { PauseOverlayInit } from '@/game/scenes/PauseOverlay';

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

    // Pause button anchored top-right with padding from the canvas edge,
    // before the counter so the counter shifts left to make room. Uses a
    // simple container so we keep the placeholder vibe of the rest of the
    // HUD until 0.7 art polish.
    this.createPauseButton(width - 16, barHeight / 2);
    const pauseButtonRoom = 56; // approx button width + gap

    this.counterText = this.add
      .text(width - 16 - pauseButtonRoom, barHeight / 2, `Q: 0/${config.round.questionsPerRound}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        color: '#eaeaf2',
      })
      .setOrigin(1, 0.5);

    // Bind to GameScene events. The GameScene event emitter is per-scene
    // and lives as long as the scene; we listen via scene.get(...).events.
    this.bindGameSceneEvents();

    // Esc key on HudScene opens the pause overlay. HudScene runs in parallel
    // with GameScene during a round, so its keyboard plugin is the right
    // place for in-game shortcuts (GameScene's update is paused while
    // PauseOverlay is up; we don't want the listener stuck on a paused
    // scene's keyboard plugin).
    if (this.input.keyboard) {
      this.input.keyboard.on('keydown-ESC', this.openPauseOverlay, this);
    }

    this.events.once('shutdown', () => {
      this.unbindGameSceneEvents();
      if (this.input.keyboard) {
        this.input.keyboard.off('keydown-ESC', this.openPauseOverlay, this);
      }
      _th.logToAi('HudScene Completed', SeverityLevel.Information);
    });
  }

  /**
   * Build the on-screen Pause button. Container with a tinted square
   * background and two centered horizontal "pause bars" — universally
   * recognized as the pause icon, no text needed (good for younger kids
   * and for future i18n). Hit area at least 44×44 device-independent px
   * (Apple HIG minimum). On click → openPauseOverlay.
   */
  private createPauseButton(rightX: number, centerY: number): Phaser.GameObjects.Container {
    const w = 44;
    const h = 36;
    const container = this.add.container(rightX - w / 2, centerY);
    const bg = this.add.rectangle(0, 0, w, h, 0x1f2740);
    bg.setStrokeStyle(2, 0x6b7280);
    const barColor = 0xeaeaf2;
    const barW = 5;
    const barH = 18;
    const leftBar = this.add.rectangle(-6, 0, barW, barH, barColor);
    const rightBar = this.add.rectangle(6, 0, barW, barH, barColor);
    container.add([bg, leftBar, rightBar]);
    container.setSize(w, h);

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(0x2a3454));
    bg.on('pointerout', () => bg.setFillStyle(0x1f2740));
    bg.on('pointerdown', () => this.openPauseOverlay());

    return container;
  }

  /**
   * Launch the PauseOverlay in parallel and put GameScene into its paused
   * state. Guarded against double-launch — Esc + Pause-button mash should
   * only ever produce one overlay.
   */
  private openPauseOverlay(): void {
    const gameScene = this.scene.get(SceneKeys.Game) as GameScene | null;
    if (!gameScene || gameScene.isPaused()) return;
    if (this.scene.isActive(SceneKeys.PauseOverlay)) return;
    gameScene.pause();
    const init: PauseOverlayInit = {
      resumeFn: () => this.closePauseOverlay(),
      quitFn: () => this.handleQuitFromOverlay(),
    };
    this.scene.launch(SceneKeys.PauseOverlay, init);
  }

  private closePauseOverlay(): void {
    const gameScene = this.scene.get(SceneKeys.Game) as GameScene | null;
    if (this.scene.isActive(SceneKeys.PauseOverlay)) {
      this.scene.stop(SceneKeys.PauseOverlay);
    }
    gameScene?.resume();
  }

  private handleQuitFromOverlay(): void {
    const gameScene = this.scene.get(SceneKeys.Game) as GameScene | null;
    if (this.scene.isActive(SceneKeys.PauseOverlay)) {
      this.scene.stop(SceneKeys.PauseOverlay);
    }
    // Resume before quit so any frozen tweens don't carry over to the next
    // round if the user starts a new game from MenuScene.
    gameScene?.resume();
    gameScene?.quitToMenu();
  }

  private bindGameSceneEvents(): void {
    if (this.gameSceneListenersBound) return;
    const gameScene = this.scene.get(SceneKeys.Game) as GameScene | null;
    if (!gameScene) return;
    gameScene.events.on('questionStarted', this.onQuestionStarted, this);
    gameScene.events.on('questionEnded', this.onQuestionEnded, this);
    this.gameSceneListenersBound = true;

    // Phaser launches parallel scenes asynchronously: GameScene.create() can
    // run startNextQuestion() (which emits 'questionStarted') BEFORE this
    // HudScene's create() runs and binds the listener above. Without this
    // pull, the first question's prompt would stay as the placeholder
    // "— + — = ?" until question 2.
    //
    // Pulling the in-flight question here means HudScene tolerates either
    // start order. Also makes future pause/resume of HudScene robust (the
    // 0.5.1 Pause sprint will hit this same race when re-binding after
    // a resume).
    const inFlight = gameScene.getCurrentQuestionPayload?.();
    if (inFlight) {
      this.onQuestionStarted(inFlight);
    }
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
