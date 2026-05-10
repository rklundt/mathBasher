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
import { getAudioManager } from '@/services/audioManagerFactory';
import { KeyboardNavigator, type Focusable } from '@/game/ui/KeyboardNavigator';

/**
 * The HUD icons (Pause, Mute) need to satisfy `Focusable` so a Chromebook
 * trackpad+keyboard kid can Tab through them — WCAG 2.1.1 says all
 * interactive controls must be keyboard-reachable. The shape is the
 * Container itself plus three small extra methods (focus state / activate
 * / disabled-ness). We extend Container in place rather than create a new
 * class because there are only two icon buttons today and they're tightly
 * coupled to HudScene; a generic IconButton helper waits for a third
 * caller (per the senior-dev review's "don't pre-extract for two callers").
 */
type FocusableIconButton = Phaser.GameObjects.Container & Focusable;

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

    // Pause icon (top-right) and Mute icon (just left of it). Both are
    // 44×44 (Apple HIG min hit area), but visually distinct so a kid mid-
    // round doesn't accidentally pause when they meant to mute:
    //   - Pause: dim slate background (matches the rest of the HUD chrome)
    //   - Mute:  warm-amber background tint (visually warmer; reads as a
    //           "different control" without screaming for attention)
    // Gap widened from 12px → 24px so the two icons don't touch on hover
    // and a wider thumb has room to land cleanly on the right one.
    const buttonWidth = 44;
    const buttonGap = 24;
    const pauseBtn = this.createPauseButton(width - 16, barHeight / 2);
    const muteBtn = this.createMuteButton(width - 16 - buttonWidth - buttonGap, barHeight / 2);
    const buttonsRoom = buttonWidth * 2 + buttonGap + 16; // pause + mute + gap + edge padding

    // Wire both icons through a KeyboardNavigator so Tab/Shift+Tab cycles
    // them and Enter activates the focused one. Without this the mute
    // toggle is mouse-only — fails WCAG 2.1.1 for any kid on a Chromebook
    // trackpad+keyboard. Pause has Esc as a backdoor; mute had none.
    //
    // `activateOnSpace: false` is LOAD-BEARING. HudScene runs in parallel
    // with GameScene during a round, and Space is the FIRE key in
    // InputSystem. Phaser dispatches the same Space keydown to both
    // scenes; if KeyboardNavigator activates on Space here, every fire
    // press also toggles whichever HUD icon currently has focus
    // (typically Mute, the first tab stop). Real audible bug — every
    // fire toggles mute → loops + fire flicker on/off. Disabling Space
    // activation here keeps Tab + Enter for keyboard a11y while letting
    // Space remain a clean fire input on GameScene.
    new KeyboardNavigator(this, [muteBtn, pauseBtn], { activateOnSpace: false });

    this.counterText = this.add
      .text(width - 16 - buttonsRoom, barHeight / 2, `Q: 0/${config.round.questionsPerRound}`, {
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
   * Build the on-screen Pause button. Container with a slate background
   * and two centered horizontal "pause bars" — universally recognized as
   * the pause icon, no text needed. Hit area 44×44 device-independent px
   * (Apple HIG minimum). On click OR Enter/Space (when focused) →
   * openPauseOverlay.
   *
   * Returns a `FocusableIconButton` so KeyboardNavigator can include it
   * in the HUD's tab order. Focus state paints a 3px blue ring (matches
   * the focus convention used by PlaceholderButton in menu scenes).
   */
  private createPauseButton(rightX: number, centerY: number): FocusableIconButton {
    const w = 44;
    const h = 36;
    const container = this.add.container(rightX - w / 2, centerY) as FocusableIconButton;
    const baseFill = 0x1f2740;
    const baseStroke = 0x6b7280;
    const focusStroke = 0x60a5fa; // blue, matches PlaceholderButton focus ring
    const bg = this.add.rectangle(0, 0, w, h, baseFill);
    bg.setStrokeStyle(2, baseStroke);
    const barColor = 0xeaeaf2;
    const barW = 5;
    const barH = 18;
    const leftBar = this.add.rectangle(-6, 0, barW, barH, barColor);
    const rightBar = this.add.rectangle(6, 0, barW, barH, barColor);
    container.add([bg, leftBar, rightBar]);
    container.setSize(w, h);

    let focused = false;
    const repaint = (): void => {
      bg.setStrokeStyle(focused ? 3 : 2, focused ? focusStroke : baseStroke);
    };

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(0x2a3454));
    bg.on('pointerout', () => bg.setFillStyle(baseFill));
    bg.on('pointerdown', () => this.openPauseOverlay());

    container.setFocused = (value: boolean): void => {
      focused = value;
      repaint();
    };
    container.activate = (): void => {
      this.openPauseOverlay();
    };
    container.isDisabled = (): boolean => false;

    return container;
  }

  /**
   * On-screen mute toggle. Reads initial muted state from AudioManager
   * (which itself read it from localStorage at boot), then keeps the
   * visual in sync on every click or Enter/Space press (when focused).
   *
   * Two visual states:
   *   - audio on:    speaker shape, no slash
   *   - muted:       speaker shape with a red diagonal slash overlay
   * Plus: in the muted state the speaker glyph dims to 60% alpha so
   * "off" reads at a glance for a 6-year-old (per support review nice-
   * to-have).
   *
   * Pure Phaser shapes (no image asset). Hit area 44×44 (Apple HIG min).
   *
   * Visually distinct from the Pause icon (which sits to its right): a
   * warm-amber background instead of slate, so a kid mid-round who's
   * reaching for "silence the game" doesn't accidentally grab "stop the
   * round" because they look identical. (Sprint 0.7 art polish will
   * iterate; this is the placeholder distinction.)
   *
   * Returns a `FocusableIconButton` so KeyboardNavigator can include it
   * in the HUD's tab order.
   */
  private createMuteButton(rightX: number, centerY: number): FocusableIconButton {
    const w = 44;
    const h = 36;
    const container = this.add.container(rightX - w / 2, centerY) as FocusableIconButton;
    // Warm-amber-tinted slate: still HUD-chrome family, but distinct from
    // the Pause icon's pure slate.
    const baseFill = 0x2a2640;
    const baseStroke = 0x6b7280;
    const focusStroke = 0x60a5fa;
    const hoverFill = 0x3a3454;
    const bg = this.add.rectangle(0, 0, w, h, baseFill);
    bg.setStrokeStyle(2, baseStroke);

    // Speaker glyph: small square (cone base) + triangle (horn) + two
    // wave-line rectangles to the right. All shape primitives — no image.
    const speakerColor = 0xeaeaf2;
    const speakerBox = this.add.rectangle(-8, 0, 8, 10, speakerColor);
    const speakerHorn = this.add.triangle(-2, 0, 0, -8, 0, 8, 8, 0, speakerColor);
    const wave1 = this.add.rectangle(8, 0, 2, 10, speakerColor);
    const wave2 = this.add.rectangle(13, 0, 2, 14, speakerColor);

    // Slash overlay (red diagonal) — visible when muted, hidden when on.
    const slash = this.add.rectangle(0, 0, 30, 3, 0xef4444);
    slash.setRotation(-Math.PI / 4);

    container.add([bg, speakerBox, speakerHorn, wave1, wave2, slash]);
    container.setSize(w, h);

    const audio = getAudioManager();
    let focused = false;

    const repaint = (): void => {
      const muted = audio.isMuted();
      wave1.setVisible(!muted);
      wave2.setVisible(!muted);
      slash.setVisible(muted);
      // Dim the speaker glyph itself in muted state so "off" reads at a
      // glance for the youngest players, not just from the slash overlay.
      const speakerAlpha = muted ? 0.6 : 1;
      speakerBox.setAlpha(speakerAlpha);
      speakerHorn.setAlpha(speakerAlpha);
      // Focus ring: blue 3px stroke when keyboard-focused, normal otherwise.
      bg.setStrokeStyle(focused ? 3 : 2, focused ? focusStroke : baseStroke);
    };
    repaint();

    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(hoverFill));
    bg.on('pointerout', () => bg.setFillStyle(baseFill));
    bg.on('pointerdown', () => {
      audio.setMuted(!audio.isMuted());
      repaint();
    });

    container.setFocused = (value: boolean): void => {
      focused = value;
      repaint();
    };
    container.activate = (): void => {
      audio.setMuted(!audio.isMuted());
      repaint();
    };
    container.isDisabled = (): boolean => false;

    return container;
  }

  /**
   * Launch the PauseOverlay in parallel and put GameScene into its paused
   * state. Guarded against double-launch — Esc + Pause-button mash should
   * only ever produce one overlay.
   */
  /**
   * Resolve the live GameScene reference. `this.scene.get(...)` returns
   * `Phaser.Scene | null`; this method centralizes the cast to the typed
   * GameScene class so the typed pause/resume/quit API is callable
   * without scattering `as GameScene` across every call site.
   */
  private getGameScene(): GameScene | null {
    return this.scene.get(SceneKeys.Game) as GameScene | null;
  }

  private openPauseOverlay(): void {
    const gameScene = this.getGameScene();
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
    const gameScene = this.getGameScene();
    if (this.scene.isActive(SceneKeys.PauseOverlay)) {
      this.scene.stop(SceneKeys.PauseOverlay);
    }
    gameScene?.resume();
  }

  private handleQuitFromOverlay(): void {
    const gameScene = this.getGameScene();
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
    const gameScene = this.getGameScene();
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
