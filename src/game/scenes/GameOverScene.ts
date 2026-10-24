// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel, type TelemetryProps } from '@/core/telemetry';
import { config, type MathId, type SpeedKey } from '@/core/config';
import { SceneKeys, gameSceneKeyFor } from '@/core/sceneKeys';
import { Settings, type GameId } from '@/services/Settings';
import { getScoreStore } from '@/services/scoreStoreFactory';
import type { ScoreEntry, ScoreFilter } from '@/services/IScoreStore';
import { KeyboardNavigator } from '@/game/ui/KeyboardNavigator';
import { PlaceholderButton } from '@/game/ui/PlaceholderButton';
import { computeGridSlots } from '@/game/ui/menuLayoutGeometry';
import type { ChallengePickerInit } from '@/game/services/challengeSelection';
import { wireEscBack } from '@/game/ui/EscBackHandler';
import { text, textStyle, FONT_FAMILY, TEXT_AMBER } from '@/game/ui/typography';
import { formatPoints } from '@/services/challengePoints';
import { getAudioManager } from '@/services/audioManagerFactory';
import { pickBonusCheerSfx } from '@/core/audioKeys';
import { applyTextOutline } from '@/game/ui/callouts';
import { setupScene } from '@/game/scenes/sceneSetup';

export interface GameOverData {
  /** The round's total, bonuses included. */
  score: number;
  /** Sprint 2.10 — the Finish Bonus inside `score` (0 when the round didn't reach its end). */
  finishBonus?: number;
  /** Sprint 2.10 — the Perfect Round bonus inside `score` (0 unless every question was right first try). */
  perfectBonus?: number;
  correctCount: number;
  passed: boolean;
  stars: 0 | 1 | 2 | 3;
  mathId: MathId | null;
  speed: SpeedKey | null;
  /**
   * Total questions/floors in the round that just ended. Used as the
   * denominator on the "Correct: N / total" line. Optional for
   * back-compat: legacy callers fall back to the global
   * `config.round.questionsPerRound` (20). Number Climb passes 10 here
   * because its round is 10 floors, not the default 20 questions.
   */
  totalQuestions?: number;
  /**
   * Which game mode produced this round — passed explicitly by the
   * source scene (GameScene = 'alien-shoot', AsteroidFieldScene =
   * 'asteroid-field'). Drives:
   *   1. Play Again routing back to the SAME game mode (was hardcoded
   *      to SceneKeys.Game pre-sprint-2.1, which sent Asteroid Field
   *      rounds back to Alien Shoot — playtest bug).
   *   2. Telemetry `gameId` property (was hardcoded 'alien-shoot').
   *   3. Score-store entry `gameId` (was hardcoded 'alien-shoot' —
   *      meant Asteroid Field high scores were being saved under the
   *      Alien Shoot bucket).
   *
   * Optional for back-compat with any legacy caller; falls back to
   * Settings.round.gameId, then 'alien-shoot' as a last resort.
   */
  gameId?: GameId;
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
/** Sprint 2.10 — Game Over's timeline (ms after it opens): score count-up, then each bonus, then the badge. */
const SCORE_COUNT_MS = { delay: 200, duration: 600 };
const BONUS_POP_MS = { first: 1000, gap: 500, countOn: 300 };

export class GameOverScene extends Phaser.Scene {
  private roundData!: GameOverData;
  /** Sprint 2.10 — `this.time.now` when the "New High Score!" badge may appear (after the bonuses). */
  private badgeAt = 0;

  static readonly key = SceneKeys.GameOver;

  constructor() {
    super(GameOverScene.key);
  }

  init(data: GameOverData): void {
    this.roundData = data;
  }

  create(): void {
    // Resolve the gameId for this round. Source scene SHOULD pass it
    // in init data; fall back to Settings (always populated — the
    // GameId union has no nullable variant) for legacy callers. The
    // prior triple-fallback (`?? 'alien-shoot'`) was unreachable
    // because `Settings.round.gameId` is typed as non-nullable; dropped
    // in sprint 2.1 wrap-up.
    const gameId: GameId = this.roundData.gameId ?? Settings.round.gameId;

    const props: TelemetryProps = {
      gameId,
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
      void this.saveAndCheckHighScore(gameId, this.roundData.mathId, this.roundData.speed);
    }

    const { width, height } = this.scale;
    const cx = width / 2;

    // Sprint 2.5 story 4 — chosen-hero banner. Top-left corner, larger
    // than MenuScene's avatar (88 px vs 56) so the kid sees their
    // hero present at the round-end celebration. Skipped silently if
    // no hero is persisted (defensive — BootScene's routing ensures
    // the picker has run before any round is played, but the guard
    // means a test path that bypasses Boot still renders cleanly).
    this.buildHeroBanner();

    // Sprint 0.7 Story 9 — entrance tween for the headline. Scale 0.7 +
    // alpha 0 → final, Back.Out ease for a small overshoot "pop." Reads
    // as a satisfying round-end celebration rather than the prior
    // instant-paint feel.
    const headline = this.roundData.passed ? 'Round Complete!' : 'Round Done — Try Again?';
    const headlineText = text(
      this,
      cx,
      height * 0.18,
      headline,
      this.roundData.passed ? 'success' : 'warning',
    ).setOrigin(0.5);
    applyTextOutline(headlineText);
    headlineText.setScale(0.7);
    headlineText.setAlpha(0);
    this.tweens.add({
      targets: headlineText,
      scale: 1,
      alpha: 1,
      duration: 350,
      ease: 'Back.Out',
    });

    // Sprint 0.7 Story 9 — count-up score animation.
    // Renders the multi-line "Score: N / Correct: M / total" text but the
    // score number animates from 0 to the final value over 600ms via a
    // Phaser tween on a counter object. The Correct line and totals stay
    // at their final values throughout (only the score number animates).
    // Uses TextKind 'summary' (29px primary) per Sprint 0.7.5 Story 3 —
    // the size literal lives in typography.ts. We use textStyle() rather
    // than text() so we can layer in `align: 'center'` for the two-line
    // string.
    const scoreSummary = this.add
      .text(cx, config.layout.challengeFlow.gameOver.summaryY, '', { ...textStyle('summary'), align: 'center' })
      .setOrigin(0.5);
    applyTextOutline(scoreSummary);
    // Round size — Number Climb passes 10 here (10 floors); other modes
    // either pass the default 20 or omit, falling back to config. The
    // denominator on the Correct line reads dynamically so a 10-floor
    // Climb win displays "10 / 10" instead of the legacy "10 / 20".
    const totalQuestions = this.roundData.totalQuestions ?? config.round.questionsPerRound;
    const renderScoreLine = (displayedScore: number): string =>
      `Score: ${formatPoints(displayedScore)}\nCorrect: ${this.roundData.correctCount} / ${totalQuestions}`;
    scoreSummary.setText(renderScoreLine(0));
    // Sprint 2.10 — count up to the answers' points, then each bonus pops in
    // and the score counts on to the total.
    const finish = this.roundData.finishBonus ?? 0;
    const perfect = this.roundData.perfectBonus ?? 0;
    const scoreCounter = { value: 0 };
    const countTo = (value: number, delay: number, duration: number): void => {
      this.tweens.add({
        targets: scoreCounter,
        value,
        duration,
        delay,
        ease: 'Quad.Out',
        onUpdate: () => scoreSummary.setText(renderScoreLine(Math.floor(scoreCounter.value))),
        // Exact at the end (Math.floor of the tweened value can fall short).
        onComplete: () => scoreSummary.setText(renderScoreLine(value)),
      });
    };
    // Start AFTER the headline has begun popping in.
    countTo(this.roundData.score - finish - perfect, SCORE_COUNT_MS.delay, SCORE_COUNT_MS.duration);
    const bonusesDoneMs = this.buildBonusRow(cx, finish, perfect, (subtotal, at) =>
      countTo(subtotal, at, BONUS_POP_MS.countOn),
    );
    this.badgeAt = this.time.now + Math.max(SCORE_COUNT_MS.delay + SCORE_COUNT_MS.duration, bonusesDoneMs);

    // Sprint 0.7 Story 9 — three separate star Text objects laid out in a
    // row, each popping in with a staggered Back.Out scale tween. Was a
    // single concatenated string ("★★★☆☆☆") via the typography helper —
    // refactored to 3 distinct game objects so each can animate
    // independently. Stagger 200ms between stars; first star starts
    // 500ms after scene mount so the headline pop reads first.
    this.buildStarRow(cx, config.layout.challengeFlow.gameOver.starsY);

    // Sprint 2.9 — Play again on its own, then a 2 × 2 grid: Change
    // difficulty · Change challenge / Change game · Main menu. Four in a row
    // don't fit a phone; the grid keeps every target 72 tall and clear of
    // the "New High Score!" badge above.
    const G = config.layout.challengeFlow.gameOver;
    const playAgain = new PlaceholderButton({
      scene: this,
      x: cx,
      y: G.playAgain.y,
      width: G.playAgain.w,
      height: G.playAgain.h,
      label: 'Play Again',
      onClick: () => {
        // Defensive: re-set Settings to the round we just played, so
        // Play Again works even if a future code path resets Settings.
        // The destination scene reads Settings on create, so this
        // preserves the user's intent across the bounce.
        Settings.setGameId(gameId);
        if (this.roundData.mathId) Settings.setChallenge(this.roundData.mathId);
        if (this.roundData.speed) Settings.setSpeed(this.roundData.speed);
        // Route to the game scene that matches the JUST-PLAYED gameId via
        // the canonical helper (exhaustive against the GameId union).
        this.scene.start(gameSceneKeyFor(gameId));
      },
    });
    const changeChallenge = (): void => {
      // Back on the picker goes to this game's Difficulty, not back here:
      // re-entering Game Over would replay it and save the score again.
      Settings.setGameId(gameId);
      const init: ChallengePickerInit = {
        next: SceneKeys.Difficulty,
        back: SceneKeys.Difficulty,
        source: 'gameOver',
      };
      this.scene.start(SceneKeys.ChallengePicker, init);
    };
    const items: Array<{ label: string; onClick: () => void }> = [
      { label: 'Change Difficulty', onClick: () => this.scene.start(SceneKeys.Difficulty) },
      { label: 'Change Challenge', onClick: changeChallenge },
      // Challenge + difficulty carry over (Settings keeps them).
      { label: 'Change Game', onClick: () => this.scene.start(SceneKeys.GameSelect) },
      { label: 'Main Menu', onClick: () => this.scene.start(SceneKeys.Menu) },
    ];
    const slots = computeGridSlots(cx, G.grid.topY, items.length, G.grid);
    const grid = items.map(
      (item, i) =>
        new PlaceholderButton({
          scene: this,
          x: slots[i].x,
          y: slots[i].y,
          width: slots[i].width,
          height: slots[i].height,
          label: item.label,
          onClick: item.onClick,
        }),
    );
    const buttons = [playAgain, ...grid];

    new KeyboardNavigator(this, buttons);

    // Esc on Game Over = Main Menu (matches the existing button's destination).
    wireEscBack(this, () => this.scene.start(SceneKeys.Menu));
  }

  /**
   * Sprint 2.10 — "Finish Bonus! +300" and "Perfect Round! +300" on one line
   * under the score, popping in one after the other (each with one of the
   * owner's four cheers, never the same twice running, and
   * the score counting on). Nothing when the round earned neither. Returns
   * when the last one is done (ms after Game Over opened).
   */
  private buildBonusRow(
    cx: number,
    finish: number,
    perfect: number,
    countOn: (subtotal: number, atMs: number) => void,
  ): number {
    const G = config.layout.challengeFlow.gameOver;
    const parts = [
      { label: `Finish Bonus! +${formatPoints(finish)}`, points: finish },
      { label: `Perfect Round! +${formatPoints(perfect)}`, points: perfect },
    ].filter((p) => p.points > 0);
    if (parts.length === 0) return 0;

    const texts = parts.map((p) => {
      const t = text(this, 0, G.bonusY, p.label, 'bonus').setOrigin(0.5);
      applyTextOutline(t);
      return t;
    });
    const rowW = texts.reduce((w, t) => w + t.width, 0) + G.bonusGapPx * (texts.length - 1);
    let x = cx - rowW / 2;
    let subtotal = this.roundData.score - finish - perfect;
    texts.forEach((t, i) => {
      t.setX(x + t.width / 2);
      x += t.width + G.bonusGapPx;
      const at = BONUS_POP_MS.first + i * BONUS_POP_MS.gap;
      subtotal += parts[i].points;
      t.setScale(0);
      this.tweens.add({ targets: t, scale: 1, duration: 300, delay: at, ease: 'Back.Out' });
      this.time.delayedCall(at, () => getAudioManager().play(pickBonusCheerSfx(), 'sfx'));
      countOn(subtotal, at);
    });
    return BONUS_POP_MS.first + (texts.length - 1) * BONUS_POP_MS.gap + BONUS_POP_MS.countOn;
  }

  /**
   * Sprint 0.7 Story 9 — build the 3-star row with staggered pop-in
   * animations. Each star is a separate Text object so it can tween
   * independently.
   *
   * Layout: three 48px glyphs in a row, gap 16px, centered at `centerX`.
   * Earned stars use the warm-amber color (`TEXT_AMBER`); unearned
   * stars use dim grey (`#4b5563`) so the player can clearly see
   * "I got 2 of 3" rather than a sea of identical glyphs.
   *
   * Animation: each star starts at `scale: 0`, tweens to `scale: 1.0`
   * over 250ms with `Back.Out` ease (slight overshoot for the "pop"
   * feel). Stagger 200ms between stars; first star starts 500ms after
   * scene mount so the headline + score animations begin first.
   */
  private buildStarRow(centerX: number, y: number): void {
    // STAR_SIZE drives BOTH the star glyph fontSize and the layout math
    // (totalWidth + startX). It's a runtime template-literal fontSize
    // (not a string literal) so it stays here rather than in the
    // typography STYLES registry — see the typography.ts header comment
    // about which kinds of sizing live in which file.
    const STAR_SIZE = 58;
    const STAR_GAP = 16;
    const totalWidth = 3 * STAR_SIZE + 2 * STAR_GAP;
    const startX = centerX - totalWidth / 2 + STAR_SIZE / 2;
    for (let i = 0; i < 3; i++) {
      const earned = i < this.roundData.stars;
      const star = this.add
        .text(startX + i * (STAR_SIZE + STAR_GAP), y, earned ? '★' : '☆', {
          fontFamily: FONT_FAMILY,
          fontSize: `${STAR_SIZE}px`,
          color: earned ? TEXT_AMBER : '#4b5563',
        })
        .setOrigin(0.5);
      star.setScale(0);
      this.tweens.add({
        targets: star,
        scale: 1,
        duration: 250,
        delay: 500 + i * 200,
        ease: 'Back.Out',
      });
    }
  }

  /**
   * Persist the round result and detect "New high score!" — read the previous
   * best for this combo BEFORE saving (otherwise we'd always tie our own
   * just-saved score), then save, then optionally show the badge.
   */
  private async saveAndCheckHighScore(gameId: GameId, mathId: MathId, speed: SpeedKey): Promise<void> {
    const store = getScoreStore();
    const filter: ScoreFilter = { gameId, mathId, speed };

    const previousBest = await store.bestForCombo(filter);

    const entry: ScoreEntry = {
      gameId,
      mathId,
      speed,
      score: this.roundData.score,
      correctCount: this.roundData.correctCount,
      passed: this.roundData.passed,
      achievedAt: Date.now(),
    };

    await store.save(entry);

    _th.logToAi('HighScoreSaved', SeverityLevel.Information, {
      gameId,
      mathId,
      speed,
      roundScore: String(this.roundData.score),
    });

    // Beat the previous best (or there was no previous best AND we scored)?
    const isNewHighScore =
      this.roundData.score > 0 && (previousBest === null || this.roundData.score > previousBest.score);

    if (isNewHighScore && this.scene.isActive()) {
      const { width } = this.scale;
      // TextKind 'badge' — 26px warm-amber bold (Sprint 0.7.5 Story 3).
      const badge = text(
        this,
        width / 2,
        config.layout.challengeFlow.gameOver.badgeY,
        '★ New High Score! ★',
        'badge',
      ).setOrigin(0.5);
      applyTextOutline(badge);
      // Sprint 2.10 — after the bonuses have popped in (it used to land mid-count).
      badge.setAlpha(0);
      this.tweens.add({
        targets: badge,
        scale: { from: 0.5, to: 1 },
        alpha: { from: 0, to: 1 },
        duration: 400,
        delay: Math.max(0, this.badgeAt - this.time.now),
        ease: 'Back.Out',
      });
    }
  }

  /**
   * Sprint 2.5 story 4 — chosen-hero banner. Top-left corner;
   * larger than MenuScene's avatar (88 px vs 56) so the kid sees
   * their hero present at the round-end celebration. Identical
   * defensive guards as MenuScene's `buildHeroAvatar` (null
   * persisted choice or missing texture → no render, don't throw).
   */
  private buildHeroBanner(): void {
    const hero = Settings.getChosenHero();
    if (hero === null) return;
    if (!this.textures.exists(hero)) return;

    const BANNER_DISPLAY = 88;
    const bx = 24 + BANNER_DISPLAY / 2;
    const by = 24 + BANNER_DISPLAY / 2;

    const bg = this.add.circle(bx, by, BANNER_DISPLAY / 2 + 6, 0x1f2740, 0.85);
    bg.setStrokeStyle(3, 0xfbbf24);

    const sprite = this.add.image(bx, by, hero).setOrigin(0.5);
    const tex = this.textures.get(hero).getSourceImage();
    const maxDim = Math.max(tex.width, tex.height) || 1;
    sprite.setScale(BANNER_DISPLAY / maxDim);

    // Subtle entrance to match the headline pop. Banner fades in
    // alongside the headline tween for a coherent round-end beat.
    bg.setAlpha(0);
    sprite.setAlpha(0);
    this.tweens.add({
      targets: [bg, sprite],
      alpha: 1,
      duration: 350,
      ease: 'Quad.Out',
    });
  }
}
