// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { SceneKeys } from '@/core/sceneKeys';
import { config } from '@/core/config';
import type { Question } from '@/math/types';
import type { GameSceneContract, HudSceneInit } from '@/game/scenes/gameSceneContract';
import type { PauseOverlayInit } from '@/game/scenes/PauseOverlay';
import { createMuteIconButton } from '@/game/ui/MuteIconButton';
import { SessionTotalScore } from '@/services/SessionTotalScore';
import { KeyboardNavigator } from '@/game/ui/KeyboardNavigator';
import { createIconButton, type IconButtonInstance } from '@/game/ui/IconButton';
import { text } from '@/game/ui/typography';

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
 * Sprint 0.7 Story 8 — payload for the new `correctHit` event emitted
 * by GameScene immediately when the correct-answer alien is hit. Used
 * to spawn the score popup AT the alien's position rather than at the
 * HUD bar corner (more readable feedback than the prior fixed-position
 * popup, which the player's eyes weren't on).
 */
interface CorrectHitPayload {
  x: number;
  y: number;
  scoreDelta: number;
}

/**
 * Heads-up display, runs in PARALLEL with the active game scene
 * (GameScene OR AsteroidFieldScene). Listens for events the game scene
 * emits and updates the top bar:
 *
 *   Round: 580  Total: 1500    7 + 5 = ?    Q: 5/20
 *
 * Score popup ("+200") rises briefly when a question is answered
 * correctly, giving snappy positive feedback in addition to the
 * score-counter update.
 *
 * Sprint 2.1.5 — top-left now shows BOTH the current-round score AND
 * the cumulative session-total score (`SessionTotalScore`). The session
 * total only mutates between rounds (each game scene's `endRound` adds
 * the just-finished round's score), so the HUD reads
 * `SessionTotalScore.get()` on scene mount + on every `questionEnded`
 * — cheap polling that stays in sync without needing a dedicated
 * total-changed event.
 */
export class HudScene extends Phaser.Scene {
  static readonly key = SceneKeys.Hud;

  private roundScoreText!: Phaser.GameObjects.Text;
  private totalScoreText!: Phaser.GameObjects.Text;
  private promptText!: Phaser.GameObjects.Text;
  private counterText!: Phaser.GameObjects.Text;
  /**
   * Sprint 0.7 Story 8 — per-question progress dots. One per question
   * (config.round.questionsPerRound = 20). Filled green for correct,
   * red for wrong (timeout), hollow grey for not-yet-answered. Index
   * tracked via `currentQuestionIndex` so we can color the right dot
   * when `questionEnded` fires.
   */
  private progressDots: Phaser.GameObjects.Arc[] = [];
  private currentQuestionIndex = 0;
  /**
   * Sprint 2.2 story 15a — total questions/floors in the round being
   * displayed. Pulled from the active game scene at `create()` time via
   * `getQuestionsPerRound()` so the Q-counter denominator and the
   * progress-dots count read per-mode (Climb=10, Alien-Shoot=20,
   * Asteroid-Field=20). Falls back to the global config default if the
   * game scene contract isn't satisfied (back-compat).
   */
  private totalQuestions: number = config.round.questionsPerRound;
  private gameSceneListenersBound = false;
  /**
   * Per-question countdown text (sprint 2.1). Visible only when the
   * active game scene exposes a countdown via
   * `GameSceneContract.getCountdownSec()` — Asteroid Field does;
   * Alien Shoot returns undefined and the text stays hidden. Updated
   * each frame in the scene's `update(time, dt)` hook.
   */
  private countdownText?: Phaser.GameObjects.Text;
  /**
   * Scene key of the game-mode scene that launched this HUD. Defaults to
   * SceneKeys.Game (Alien Shoot — back-compat for any legacy caller).
   * Sprint 2.1: HudScene became game-mode-agnostic — each game scene
   * launches with `{ gameSceneKey: this.scene.key }` in init data so
   * the lookups below find the right scene.
   */
  private gameSceneKey: string = SceneKeys.Game;

  constructor() {
    super(HudScene.key);
  }

  init(data: HudSceneInit): void {
    this.gameSceneKey = data.gameSceneKey ?? SceneKeys.Game;
  }

  create(): void {
    _th.logToAi('HudScene Started', SeverityLevel.Information);

    // Reset stateful class fields. Phaser reuses the same scene instance
    // across rounds — the class-field initializers (`progressDots = []`,
    // `currentQuestionIndex = 0`) only run ONCE when Phaser first
    // instantiates the scene class. On the SECOND round, `progressDots`
    // would still contain the 20 destroyed Phaser Arcs from round 1;
    // `buildProgressDots` would then push 20 NEW dots, leaving the array
    // at length 40, and `markProgressDot(index)` (which uses indices
    // 0-19) would target the OLD destroyed objects → setFillStyle is a
    // silent no-op on destroyed game objects, so no dot ever turns
    // green/red on the second-or-later round. Sprint 1.1 wrap-up bug:
    // surfaced in playtest as "12×12 isn't showing green/red right/wrongs"
    // (the user had played a round on a different tile first; mult-to-144
    // wasn't special — every second-round-onward had the same silent
    // failure regardless of math type).
    //
    // The same class-instance reuse means `currentQuestionIndex` would
    // carry over from the prior round's last question; reset it too so
    // the first questionEnded of the new round marks dot 0 not dot 19.
    this.progressDots = [];
    this.currentQuestionIndex = 0;

    // Sprint 2.2 story 15a — pull the round size from the active game
    // scene so the counter + dots scale per-mode. By the time this
    // HudScene.create() runs, the game scene's roundController is
    // initialized (its create() ran first; Phaser processes parallel
    // scene launches synchronously after the launching scene's create
    // returns). Defensive: keep the config fallback if the game scene
    // is missing the contract method (legacy callers).
    const gameSceneForRoundSize = this.scene.get(this.gameSceneKey) as Partial<GameSceneContract> | null;
    if (gameSceneForRoundSize?.getQuestionsPerRound) {
      this.totalQuestions = gameSceneForRoundSize.getQuestionsPerRound();
    }

    const { width } = this.scale;
    // Sprint 2.1 wrap-up — lifted from a `barHeight = 48` literal to
    // `config.layout.hudBarHeightPx` so AsteroidFieldScene's playfield
    // bound math derives from the same source of truth. Pre-lift had
    // the literal duplicated across HudScene and AsteroidFieldScene;
    // a future ribbon-resize would have silently misaligned the playfield.
    const barHeight = config.layout.hudBarHeightPx;

    const bg = this.add.rectangle(0, 0, width, barHeight, 0x000000, 0.45);
    bg.setOrigin(0, 0);

    // HUD labels use the canonical TextKinds: 'body' for the score and
    // Q counter (22px primary), 'prompt' for the math equation (24px
    // amber bold). Origin anchoring (left/center/right) is set per call
    // since the HUD bar uses three different anchors.
    //
    // Sprint 2.1.5 — score area shows TWO labels side-by-side:
    //   "This round: N" (current round's running total)
    //   "This visit: M" (session total across all completed rounds)
    //
    // Copy uses plain English ("This round" / "This visit") rather
    // than the more technical "Round" / "Total" — kid-friendly and
    // also honest about the session-bounded nature of the visit
    // counter (it resets on page reload).
    //
    // Round on the left because it's the primary "what am I earning
    // right now" number; visit total to the right. The total label's
    // x-position is recomputed after every round-score update (see
    // `repositionTotalLabel`) so growing round scores don't crowd
    // the total label.
    this.roundScoreText = text(this, 16, barHeight / 2, 'This round: 0', 'body').setOrigin(0, 0.5);
    this.totalScoreText = text(
      this,
      0, // placeholder; repositioned by repositionTotalLabel below
      barHeight / 2,
      `This visit: ${String(SessionTotalScore.get())}`,
      'body',
    ).setOrigin(0, 0.5);
    this.repositionTotalLabel();
    this.animateVisitCountUpIfNeeded();

    this.promptText = text(this, width / 2, barHeight / 2, '— + — = ?', 'prompt').setOrigin(0.5);

    // Sprint 2.1 — countdown text just BELOW the prompt, only visible in
    // game modes that expose getCountdownSec (Asteroid Field, Number
    // Climb). The text updates each frame in update() with the remaining
    // seconds, with color shifting green > yellow > red as time runs
    // out. Built unconditionally here (one Phaser.Text per round is
    // trivial); visibility is toggled in update().
    //
    // y = barHeight + 22 (was +8): the progress dots row sits at
    // barHeight + 10. With both elements horizontally centered + the
    // dots row ~80px wide, the timer overlapped the middle dots when
    // they shared the same y band. Stacked under the dots now —
    // dots fill +7..+13, timer fills +22..+36 with ~10px gap.
    this.countdownText = text(this, width / 2, barHeight + 22, '', 'body').setOrigin(0.5, 0);
    this.countdownText.setVisible(false);

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
    // Mute icon — shared helper across MenuScene, HudScene, GameSelectScene.
    // Sprint 2.2 wrap-up consolidated the previous inline copy here.
    const muteRightX = width - 16 - buttonWidth - buttonGap;
    const muteBtn = createMuteIconButton(this, muteRightX - buttonWidth / 2, barHeight / 2);
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

    this.counterText = text(
      this,
      width - 16 - buttonsRoom,
      barHeight / 2,
      `Q: 0/${this.totalQuestions}`,
      'body',
    ).setOrigin(1, 0.5);

    // Sprint 0.7 Story 8 — progress dots row UNDER the HUD bar. One dot
    // per question; filled green/red after `questionEnded`, hollow grey
    // initially. Centered horizontally; dot size + gap tuned so the full
    // row at 20 questions stays under ~220px wide (~30% of canvas width).
    this.buildProgressDots(width, barHeight);

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
   * Sprint 2.1 — per-frame countdown poll. Asteroid Field exposes a
   * `getCountdownSec()` on the GameSceneContract; Alien Shoot returns
   * undefined. When the countdown is present, render the remaining
   * seconds in the HUD with a color shift as time runs out (green > 5s,
   * yellow > 2s, red ≤ 2s). When absent, hide the text.
   */
  override update(_time: number, _dt: number): void {
    if (!this.countdownText) return;
    const gameScene = this.getGameScene();
    const sec = gameScene?.getCountdownSec?.();
    if (sec === undefined) {
      if (this.countdownText.visible) this.countdownText.setVisible(false);
      return;
    }
    if (!this.countdownText.visible) this.countdownText.setVisible(true);
    // Show 0-decimal precision for clarity; "⏱ 12" reads cleaner than
    // "⏱ 12.0" or "⏱ 12.345".
    this.countdownText.setText(`⏱ ${Math.ceil(sec)}`);
    // Color thresholds — generous green band so the UI doesn't constantly
    // flash yellow. Reds the last 2 seconds.
    const color = sec > 5 ? '#22c55e' : sec > 2 ? '#facc15' : '#ef4444';
    this.countdownText.setColor(color);
  }

  /**
   * Build the on-screen Pause button. Two centered horizontal "pause bars"
   * inside the standard IconButton wrapper — universally recognized, no
   * text needed. Hit area 44×36 device-independent px (≥ 44 in the long
   * dimension satisfies Apple HIG min hit area).
   */
  private createPauseButton(rightX: number, centerY: number): IconButtonInstance {
    const w = 44;
    const h = 36;
    return createIconButton({
      scene: this,
      x: rightX - w / 2,
      y: centerY,
      width: w,
      height: h,
      render: (container) => {
        const barColor = 0xeaeaf2;
        const barW = 5;
        const barH = 18;
        const leftBar = this.add.rectangle(-6, 0, barW, barH, barColor);
        const rightBar = this.add.rectangle(6, 0, barW, barH, barColor);
        container.add([leftBar, rightBar]);
        return undefined; // static glyph, no per-state refresh needed
      },
      onActivate: () => this.openPauseOverlay(),
    });
  }

  // Mute toggle rendering is now in `src/game/ui/MuteIconButton.ts`
  // (sprint 2.2 wrap-up extraction; the same helper is used by
  // MenuScene + GameSelectScene so the icon is consistent everywhere).

  /**
   * Resolve the live GameScene reference. `this.scene.get(...)` returns
   * `Phaser.Scene | null`; this method centralizes the cast to the typed
   * GameScene class so the typed pause/resume/quit API is callable
   * without scattering `as GameScene` across every call site.
   */
  private getGameScene(): GameSceneContract | null {
    return this.scene.get(this.gameSceneKey) as GameSceneContract | null;
  }

  /**
   * Launch the PauseOverlay in parallel and put GameScene into its paused
   * state. Guarded against double-launch — Esc + Pause-button mash should
   * only ever produce one overlay.
   */
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

  /**
   * Sprint 0.7 Story 8 — build the progress dots row.
   *
   * One `Phaser.GameObjects.Arc` (circle) per question. Hollow (dim grey)
   * by default; recolored to green (correct) or red (wrong) when
   * `questionEnded` fires for that question. Sits in the empty space
   * below the HUD bar, centered horizontally. With 20 questions and
   * 6px dots + 4px gaps, total width = 20*6 + 19*4 = 196px — well under
   * the canvas width.
   */
  private buildProgressDots(width: number, barHeight: number): void {
    const total = this.totalQuestions;
    const dotSize = 6;
    const dotGap = 4;
    const totalDotWidth = total * dotSize + (total - 1) * dotGap;
    const startX = width / 2 - totalDotWidth / 2 + dotSize / 2;
    const dotY = barHeight + 10; // 10px below HUD bar bottom edge
    for (let i = 0; i < total; i++) {
      const dot = this.add.circle(
        startX + i * (dotSize + dotGap),
        dotY,
        dotSize / 2,
        0x4b5563, // dim grey for "not yet answered"
      );
      // Subtle outline so dots stay visible against any backdrop.
      dot.setStrokeStyle(1, 0x6b7280);
      this.progressDots.push(dot);
    }
  }

  /**
   * Sprint 0.7 Story 8 — update a single progress dot's fill color
   * based on outcome. Called from `onQuestionEnded` with the index of
   * the just-completed question.
   */
  private markProgressDot(index: number, wasCorrect: boolean): void {
    const dot = this.progressDots[index];
    if (!dot) return;
    dot.setFillStyle(wasCorrect ? 0x22c55e : 0xef4444);
    // Brighter stroke for filled dots so they pop against the dim
    // hollow ones for "not yet answered."
    dot.setStrokeStyle(1, wasCorrect ? 0x16a34a : 0xb91c1c);
  }

  private bindGameSceneEvents(): void {
    if (this.gameSceneListenersBound) return;
    const gameScene = this.getGameScene();
    if (!gameScene) return;
    gameScene.events.on('questionStarted', this.onQuestionStarted, this);
    gameScene.events.on('questionEnded', this.onQuestionEnded, this);
    // Sprint 0.7 Story 8 — `correctHit` fires immediately when the
    // correct alien is destroyed, with the alien's position + score
    // delta. Used to spawn the score popup AT the alien, not at the
    // HUD bar corner. Separate from `questionEnded` (which fires
    // later, after fade-out of survivors).
    gameScene.events.on('correctHit', this.onCorrectHit, this);
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
    const gameScene = this.scene.get(this.gameSceneKey);
    if (gameScene) {
      gameScene.events.off('questionStarted', this.onQuestionStarted, this);
      gameScene.events.off('questionEnded', this.onQuestionEnded, this);
      gameScene.events.off('correctHit', this.onCorrectHit, this);
    }
    this.gameSceneListenersBound = false;
  }

  private onQuestionStarted(payload: QuestionStartedPayload): void {
    this.promptText.setText(payload.question.prompt);
    this.counterText.setText(`Q: ${payload.index + 1}/${payload.total}`);
    // Sprint 0.7 Story 8 — remember the index of the in-flight question
    // so `onQuestionEnded` can mark the right progress dot.
    this.currentQuestionIndex = payload.index;
  }

  private onQuestionEnded(payload: QuestionEndedPayload): void {
    this.roundScoreText.setText(`This round: ${payload.score}`);
    // Total only changes at round end (the game scene's `endRound` is
    // what calls `SessionTotalScore.add`), but reading it on every
    // questionEnded is cheap and keeps the HUD in sync without a
    // dedicated total-changed event. Mid-round reads are idempotent
    // re-paints. The repositionTotalLabel below handles the round
    // label growing wider so the two labels never visually overlap
    // (sprint 2.1.5 wrap-up — Architect + Senior Dev both flagged
    // the create-time-only position as fragile to 5+ digit scores).
    this.totalScoreText.setText(`This visit: ${String(SessionTotalScore.get())}`);
    this.repositionTotalLabel();
    // Sprint 0.7 Story 8 — mark the just-ended question's dot. Score
    // popup is NO LONGER triggered here; it's now driven by the
    // `correctHit` event (which fires earlier with alien coords).
    this.markProgressDot(this.currentQuestionIndex, payload.wasCorrect);
  }

  /**
   * Reposition the "This visit" label flush to the right edge of the
   * "This round" label with a fixed 24px gap. Called at create time
   * + after every round-score update so growing round-score widths
   * push the visit label rightward without overlap. The 24px gap
   * sized for a balanced "two values, related, but distinct" read.
   */
  private repositionTotalLabel(): void {
    const LABEL_GAP_PX = 24;
    this.totalScoreText.x = this.roundScoreText.x + this.roundScoreText.width + LABEL_GAP_PX;
  }

  /**
   * Animate the "This visit" total from its last-displayed value up
   * to the current `SessionTotalScore.get()` when the HUD mounts.
   * Each round-end adds to the total; the NEXT HudScene mount sees
   * the prior-displayed value and the new current value differ, so
   * it counts up over 700ms. Within a single round (HUD never
   * unmounts), the total doesn't change, so the animation is a no-op
   * on every questionEnded.
   *
   * Tween targets a plain counter object; `onUpdate` writes the
   * floored integer to the label. `onComplete` snaps the label to
   * the exact final value (Math.floor can drop the last 1 on
   * rounding) and tells SessionTotalScore that the HUD is now caught
   * up.
   */
  private animateVisitCountUpIfNeeded(): void {
    const previous = SessionTotalScore.getLastDisplayed();
    const current = SessionTotalScore.get();
    if (current <= previous) {
      // No change (first round, page reload, or back-to-back same-
      // round). Snap to the current value and mark — no animation.
      this.totalScoreText.setText(`This visit: ${String(current)}`);
      SessionTotalScore.markDisplayedAs(current);
      this.repositionTotalLabel();
      return;
    }
    // Show the previous value first (so the tween starts where the
    // kid last saw it), then animate up.
    this.totalScoreText.setText(`This visit: ${String(previous)}`);
    this.repositionTotalLabel();
    const counter = { value: previous };
    this.tweens.add({
      targets: counter,
      value: current,
      duration: 700,
      delay: 100, // brief beat before the climb starts
      ease: 'Quad.Out',
      onUpdate: () => {
        this.totalScoreText.setText(`This visit: ${String(Math.floor(counter.value))}`);
        this.repositionTotalLabel();
      },
      onComplete: () => {
        this.totalScoreText.setText(`This visit: ${String(current)}`);
        this.repositionTotalLabel();
        SessionTotalScore.markDisplayedAs(current);
      },
    });
  }

  /**
   * Sprint 0.7 Story 8 — spawn the score popup at the alien's position
   * when the correct alien is hit. Replaces the prior fixed-position
   * popup at the HUD score corner.
   */
  private onCorrectHit(payload: CorrectHitPayload): void {
    if (payload.scoreDelta > 0) {
      this.popupScoreDelta(payload.scoreDelta, payload.x, payload.y);
    }
  }

  /**
   * Brief floating "+N" text rising from the hit alien's position for
   * positive feedback. Rises 50px upward over 700ms with fade-out;
   * auto-destroys after the tween completes.
   *
   * Sprint 0.7 Story 8 update: was at fixed `(80, 60)` (top-left near
   * the score counter). Now spawns at the alien's hit position so the
   * player's eyes — already on the alien they just shot — see the
   * reward without re-scanning to a different corner of the screen.
   */
  private popupScoreDelta(delta: number, x: number, y: number): void {
    // TextKind 'scorePopup' — 29px green bold (Sprint 0.7.5 Story 3).
    const popup = text(this, x, y, `+${delta}`, 'scorePopup').setOrigin(0.5);
    this.tweens.add({
      targets: popup,
      y: y - 50,
      alpha: 0,
      duration: 700,
      ease: 'Quad.Out',
      onComplete: () => popup.destroy(),
    });
  }
}
