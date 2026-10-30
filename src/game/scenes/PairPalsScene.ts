// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { config, type PairPalsSize, type PairPalsTheme } from '@/core/config';
import { SceneKeys } from '@/core/sceneKeys';
import { openPuzzlePicker } from '@/game/services/challengeSelection';
import {
  PAIR_PALS_BACKDROP_KEYS,
  PAIR_PALS_PICTURE_KEYS,
  PAIR_PALS_SHEETS,
  ParticleSpriteKeys,
} from '@/core/spriteKeys';
import { PAIR_PALS_MUSIC, pickPairPalsMatchSfx, pickPairPalsMissSfx, pickTileFlipSfx } from '@/core/audioKeys';
import { getAudioManager } from '@/services/audioManagerFactory';
import { Settings } from '@/services/Settings';
import { getPairPalsProgress, type GameResult } from '@/services/PairPalsProgress';
import { pairPalsPoints } from '@/services/puzzlePoints';
import { SessionTotalScore } from '@/services/SessionTotalScore';
import { getMyScores } from '@/services/MyScores';
import { formatPoints } from '@/services/challengePoints';
import {
  boardLayout,
  deal,
  moveFocus,
  newBoard,
  releaseMiss,
  tapCard,
  totalPairs,
  type Board,
  type Direction,
} from '@/game/systems/pairPalsMath';
import { setupScene } from '@/game/scenes/sceneSetup';
import { PuzzleAmbience, driftBackdrop } from '@/game/ui/puzzleAmbience';
import { loadAudioOnDemand, loadGameBundle } from '@/game/services/assetLoader';
import { text } from '@/game/ui/typography';
import { applyTextOutline, createTapHint, type TapHint } from '@/game/ui/callouts';
import { createIconButton } from '@/game/ui/IconButton';
import { createMuteIconButton } from '@/game/ui/MuteIconButton';
import { PlaceholderButton } from '@/game/ui/PlaceholderButton';
import { KeyboardNavigator } from '@/game/ui/KeyboardNavigator';
import type { PauseOverlayInit, PuzzleQuitDestination } from '@/game/scenes/PauseOverlay';

/** One card on the board: the back, the cream face with its picture, and the ring a match gets. */
interface CardView {
  readonly root: Phaser.GameObjects.Container;
  readonly back: Phaser.GameObjects.Image;
  readonly face: Phaser.GameObjects.Image;
  readonly picture: Phaser.GameObjects.Image;
  readonly ring: Phaser.GameObjects.Graphics;
}

const Z = { ambience: 2, board: 10, focus: 12, mascot: 8, bar: 20, hint: 30, panel: 40 };

/** "You found all 6 pairs in 9 turns!" and what it did to the best. */
export function winLines(pairs: number, result: GameResult): [string, string] {
  const found = `You found all ${String(pairs)} pairs in ${String(result.turns)} turns!`;
  if (result.previousBest === null) return [found, 'Your first win!'];
  if (result.newBest) return [found, 'New best!'];
  return [found, `Your best is ${String(result.previousBest)} turns`];
}

/**
 * Sprint 2.13 — Pair Pals, the first puzzle game: a memory-match board.
 * Turn two cards per turn; a pair stays up, a miss shows long enough to
 * remember and turns back (a tap skips the wait). No timer or lives: the
 * top bar counts turns and pairs; the win panel shows the turns, the best
 * for this size (`PairPalsProgress`) and (sprint 2.14) the points, fewer
 * the more turns past one per card (`services/puzzlePoints.ts`).
 *
 * The rules are `pairPalsMath.ts` (pure, tested); this scene animates them.
 * It doesn't use HudScene or GameSceneLifecycle (no questions or points):
 * it draws its own top bar, launches the pause card's puzzle variant, and
 * starts and stops its own music.
 */
export class PairPalsScene extends Phaser.Scene {
  static readonly key = SceneKeys.PairPals;
  private readonly cfg = config.pairPals;

  private theme: PairPalsTheme = this.cfg.defaults.theme;
  private size: PairPalsSize = this.cfg.defaults.size;
  private board!: Board;
  private cards: CardView[] = [];
  private cardPx = 0;
  private turnsText!: Phaser.GameObjects.Text;
  private pairsText!: Phaser.GameObjects.Text;
  private mascot?: Phaser.GameObjects.Image;
  private hint?: TapHint;
  private holdTimer?: Phaser.Time.TimerEvent;
  private focusRing?: Phaser.GameObjects.Graphics;
  private focusIndex = -1;
  /** Taps are ignored until then (a card is mid-flip). */
  private lockedUntil = 0;
  private paused = false;
  private won = false;
  /** The game's points are counted (a win or leaving); never twice. */
  private settled = false;
  /** Esc that resumed the pause card mustn't pause again in the same key press. */
  private resumedAt = 0;
  /** The track this game plays (null once the scene has shut down). */
  private musicKey: string | null = null;

  constructor() {
    super(PairPalsScene.key);
  }

  preload(): void {
    loadGameBundle(this, 'pair-pals');
  }

  create(): void {
    setupScene(this);
    Settings.setGameId('pair-pals');
    const progress = getPairPalsProgress();
    this.theme = progress.theme;
    this.size = progress.size;
    this.cards = [];
    this.focusIndex = -1;
    this.focusRing = undefined;
    this.lockedUntil = 0;
    this.paused = false;
    this.won = false;
    this.settled = false;
    this.holdTimer = undefined;

    const { cols, rows } = this.cfg.sizes[this.size];
    this.board = newBoard(deal(cols, rows, this.cfg.picturesPerTheme, this.cfg.twinGroups[this.theme]));

    // Sprint 2.14 — a little life behind the board: the backdrop drifts, bubbles and sparkles float.
    driftBackdrop(this, this.add.image(0, 0, PAIR_PALS_BACKDROP_KEYS[this.theme]).setOrigin(0));
    new PuzzleAmbience(this, Z.ambience);
    this.buildBoard();
    this.buildMascot();
    this.buildTopBar();
    this.buildHint();
    this.bindKeys();

    this.startMusic();
    this.events.once('shutdown', () => this.cleanUp());
    _th.logToAi('PairPalsStarted', SeverityLevel.Information, this.props());
  }

  // ----- Building --------------------------------------------------------

  private buildBoard(): void {
    const { cols, rows } = this.cfg.sizes[this.size];
    const layout = boardLayout(cols, rows, { ...this.cfg.board, gapPx: this.cfg.board.gapPx[this.size] });
    this.cardPx = layout.cardPx;
    const s = layout.cardPx;
    const backFrame = (this.cfg.themes as readonly PairPalsTheme[]).indexOf(this.theme);
    const pictureKey = PAIR_PALS_PICTURE_KEYS[this.theme];
    layout.positions.forEach((pos, i) => {
      const root = this.add.container(pos.x, pos.y).setDepth(Z.board);
      const back = this.add.image(0, 0, PAIR_PALS_SHEETS.cards.key, backFrame).setDisplaySize(s, s);
      const face = this.add.image(0, 0, PAIR_PALS_SHEETS.cards.key, PAIR_PALS_SHEETS.cards.faceFrame);
      face.setDisplaySize(s, s).setVisible(false);
      const pictureSize = s * this.cfg.pictureScale;
      const picture = this.add.image(0, 0, pictureKey, this.board.pictures[i]);
      picture.setDisplaySize(pictureSize, pictureSize).setVisible(false);
      const ring = this.add.graphics();
      ring.lineStyle(Math.max(4, s * 0.04), 0x4ade80, 1);
      ring.strokeRoundedRect(-s / 2 - 4, -s / 2 - 4, s + 8, s + 8, s * 0.16);
      ring.setAlpha(0);
      root.add([back, face, picture, ring]);
      // The tap target is its own zone (a container's hit area can leave dead spots).
      const zone = this.add.zone(pos.x, pos.y, s, s).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => this.onTap(i));
      this.cards.push({ root, back, face, picture, ring });
    });
  }

  /** A theme picture that isn't on the board, beside it, bobbing; it hops on a match. */
  private buildMascot(): void {
    const M = this.cfg.mascot;
    const dealt = new Set(this.board.pictures);
    const free = Array.from({ length: this.cfg.picturesPerTheme }, (_, i) => i).filter((p) => !dealt.has(p));
    if (free.length === 0) return;
    const frame = free[Math.floor(Math.random() * free.length)];
    this.mascot = this.add.image(M.x, M.bottomY, PAIR_PALS_PICTURE_KEYS[this.theme], frame);
    this.mascot.setDisplaySize(M.sizePx, M.sizePx).setOrigin(0.5, 1).setDepth(Z.mascot);
    this.tweens.add({
      targets: this.mascot,
      y: M.bottomY - M.bobPx,
      duration: M.bobMs,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut',
    });
  }

  private buildTopBar(): void {
    const { width } = this.scale;
    const B = this.cfg.topBar;
    this.add.rectangle(0, 0, width, B.height, 0x0b1020, 0.45).setOrigin(0).setDepth(Z.bar);
    this.turnsText = text(this, 24, B.y, '', 'sectionLabel').setOrigin(0, 0.5).setDepth(Z.bar);
    this.pairsText = text(this, width / 2, B.y, '', 'accent')
      .setOrigin(0.5)
      .setDepth(Z.bar);
    applyTextOutline(this.turnsText);
    applyTextOutline(this.pairsText);
    this.refreshCounts();

    // Pause (right) and mute beside it, as on every game's top bar.
    const w = 44;
    const pause = createIconButton({
      scene: this,
      x: width - 16 - w / 2,
      y: B.y,
      width: w,
      height: 36,
      render: (container) => {
        container.add([this.add.rectangle(-6, 0, 5, 18, 0xeaeaf2), this.add.rectangle(6, 0, 5, 18, 0xeaeaf2)]);
        return undefined;
      },
      onActivate: () => this.openPause(),
    });
    pause.setDepth(Z.bar);
    createMuteIconButton(this, width - 16 - w - 24 - w / 2, B.y).setDepth(Z.bar);
  }

  private buildHint(): void {
    const H = this.cfg.hint;
    this.hint = createTapHint(this, {
      x: this.cfg.board.centerX,
      y: H.y,
      label: '👆 Tap two cards to find a match!',
      heightPx: H.heightPx,
      backdropAlpha: H.backdropAlpha,
    });
    this.hint.show();
  }

  private bindKeys(): void {
    const kb = this.input.keyboard;
    if (!kb) return;
    const dirs: Array<[string, Direction]> = [
      ['keydown-LEFT', 'left'],
      ['keydown-RIGHT', 'right'],
      ['keydown-UP', 'up'],
      ['keydown-DOWN', 'down'],
    ];
    for (const [event, dir] of dirs) kb.on(event, () => this.moveFocusBy(dir));
    kb.on('keydown-SPACE', () => this.tapFocused());
    kb.on('keydown-ENTER', () => this.tapFocused());
    kb.on('keydown-ESC', () => {
      if (Date.now() - this.resumedAt < 250) return;
      this.openPause();
    });
  }

  /**
   * The card theme's own track (`PAIR_PALS_MUSIC`). It loads in the
   * background the first time (about 1 MB), so the board never waits; the
   * music starts when it's ready (paused straight away if the game is).
   */
  private startMusic(): void {
    const key = PAIR_PALS_MUSIC[this.theme];
    this.musicKey = key;
    loadAudioOnDemand(this, key, () => {
      if (this.musicKey !== key) return;
      getAudioManager().playLoop(key, 'music');
      if (this.paused) getAudioManager().pauseAllLoops();
    });
  }

  // ----- Play ------------------------------------------------------------

  private onTap(i: number): void {
    if (this.paused || this.won || this.time.now < this.lockedUntil) return;
    const outcome = tapCard(this.board, i);
    if (outcome.kind === 'ignored') return;
    this.hideHint();
    this.lockedUntil = this.time.now + this.cfg.flipHalfMs * 2;

    switch (outcome.kind) {
      case 'release':
        this.cancelHold();
        for (const c of outcome.cards) this.flip(c, false);
        return;
      case 'first':
        if (outcome.releasing !== null) {
          this.cancelHold();
          for (const c of outcome.releasing) this.flip(c, false);
        }
        getAudioManager().play(pickTileFlipSfx(), 'sfx');
        this.flip(outcome.card, true);
        return;
      case 'match':
        this.refreshCounts();
        this.flip(outcome.cards[1], true, () => this.showMatch(outcome.cards, outcome.won));
        return;
      case 'miss':
        this.refreshCounts();
        this.flip(outcome.cards[1], true, () => this.showMiss(outcome.cards));
        return;
    }
  }

  /** Turn a card face up or down: squash to edge-on, swap, open, with a slight lift. */
  private flip(i: number, up: boolean, onDone?: () => void): void {
    const card = this.cards[i];
    const half = this.cfg.flipHalfMs;
    this.tweens.killTweensOf(card.root);
    card.root.setScale(1).setAngle(0); // a killed miss wiggle leaves its tilt behind
    this.tweens.add({
      targets: card.root,
      scaleX: 0,
      scaleY: this.cfg.flipLiftScale,
      duration: half,
      ease: 'Sine.In',
      onComplete: () => {
        card.back.setVisible(!up);
        card.face.setVisible(up);
        card.picture.setVisible(up);
        this.tweens.add({
          targets: card.root,
          scaleX: 1,
          scaleY: 1,
          duration: half,
          ease: 'Sine.Out',
          onComplete: () => onDone?.(),
        });
      },
    });
  }

  /** A pair: a pop, a green ring that then fades, a little dimming, sparkles and a mascot hop. */
  private showMatch(cards: [number, number], won: boolean): void {
    getAudioManager().play(pickPairPalsMatchSfx(), 'sfx');
    for (const c of cards) {
      const card = this.cards[c];
      card.ring.setAlpha(1);
      this.tweens.add({
        targets: card.root,
        scale: this.cfg.matchPopScale,
        duration: this.cfg.matchPopMs,
        yoyo: true,
        ease: 'Back.Out',
      });
      this.tweens.add({
        targets: card.ring,
        alpha: 0,
        delay: this.cfg.matchPopMs * 2,
        duration: this.cfg.matchedSettleMs,
      });
      this.tweens.add({
        targets: card.root,
        alpha: this.cfg.matchedAlpha,
        delay: this.cfg.matchPopMs * 2,
        duration: this.cfg.matchedSettleMs,
      });
      this.sparkle(card.root.x, card.root.y);
    }
    this.hopMascot();
    if (won) this.win();
  }

  /** A miss: a tiny wiggle (misses are most turns; nothing scolds), then the hold before they turn back. */
  private showMiss(cards: [number, number]): void {
    getAudioManager().play(pickPairPalsMissSfx(), 'sfx');
    for (const c of cards) {
      const card = this.cards[c];
      this.tweens.add({
        targets: card.root,
        angle: { from: -this.cfg.missWiggleDeg, to: this.cfg.missWiggleDeg },
        duration: 70,
        yoyo: true,
        repeat: 1,
        onComplete: () => card.root.setAngle(0),
      });
    }
    this.cancelHold();
    this.holdTimer = this.time.delayedCall(this.cfg.missHoldMs, () => {
      this.holdTimer = undefined;
      const held = releaseMiss(this.board);
      if (held) for (const c of held) this.flip(c, false);
    });
  }

  private cancelHold(): void {
    this.holdTimer?.remove(false);
    this.holdTimer = undefined;
  }

  private refreshCounts(): void {
    this.turnsText.setText(`Turns: ${String(this.board.turns)}`);
    this.pairsText.setText(`Pairs: ${String(this.board.pairsFound)} / ${String(totalPairs(this.board))}`);
  }

  private sparkle(x: number, y: number): void {
    const burst = this.add.particles(x, y, ParticleSpriteKeys.Star05, {
      speed: { min: 70, max: 190 },
      scale: { start: 0.4, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 520,
      tint: [0xffc21a, 0xff6fa8, 0x9b6bff, 0x37c3ff],
      emitting: false,
    });
    burst.setDepth(Z.focus + 1);
    burst.explode(this.cfg.sparkleCount);
    this.time.delayedCall(600, () => burst.destroy());
  }

  private hopMascot(): void {
    const m = this.mascot;
    if (!m) return;
    const M = this.cfg.mascot;
    this.tweens.add({ targets: m, scaleY: m.scaleY * 0.9, duration: 80, yoyo: true });
    this.tweens.add({
      targets: m,
      y: `-=${String(M.hopPx)}`,
      duration: M.hopMs / 2,
      yoyo: true,
      ease: 'Quad.Out',
    });
  }

  private hideHint(): void {
    this.hint?.destroy();
    this.hint = undefined;
  }

  // ----- Keyboard --------------------------------------------------------

  private moveFocusBy(dir: Direction): void {
    if (this.paused || this.won) return;
    const { cols, rows } = this.cfg.sizes[this.size];
    this.focusIndex = this.focusIndex < 0 ? 0 : moveFocus(this.focusIndex, dir, cols, rows);
    this.drawFocus();
  }

  private tapFocused(): void {
    if (this.paused || this.won) return;
    if (this.focusIndex < 0) {
      this.focusIndex = 0;
      this.drawFocus();
      return;
    }
    this.onTap(this.focusIndex);
  }

  private drawFocus(): void {
    const card = this.cards[this.focusIndex];
    const s = this.cardPx + 18;
    this.focusRing ??= this.add.graphics().setDepth(Z.focus);
    this.focusRing.clear();
    this.focusRing.lineStyle(5, 0xfacc15, 1);
    this.focusRing.strokeRoundedRect(card.root.x - s / 2, card.root.y - s / 2, s, s, s * 0.16);
  }

  // ----- Pause -----------------------------------------------------------

  private openPause(): void {
    if (this.paused || this.won || this.scene.isActive(SceneKeys.PauseOverlay)) return;
    this.paused = true;
    this.tweens.pauseAll();
    this.time.paused = true;
    getAudioManager().pauseAllLoops();
    _th.logToAi('GamePaused', SeverityLevel.Information, this.props());
    const init: PauseOverlayInit = {
      resumeFn: () => this.resume(),
      puzzleQuitFn: (destination) => this.quit(destination),
    };
    this.scene.launch(SceneKeys.PauseOverlay, init);
  }

  private resume(): void {
    if (this.scene.isActive(SceneKeys.PauseOverlay)) this.scene.stop(SceneKeys.PauseOverlay);
    this.paused = false;
    this.resumedAt = Date.now();
    this.time.paused = false;
    this.tweens.resumeAll();
    getAudioManager().resumeAllLoops();
    _th.logToAi('GameResumed', SeverityLevel.Information, this.props());
  }

  private quit(destination: PuzzleQuitDestination): void {
    this.resume();
    _th.logToAi('PairPalsQuit', SeverityLevel.Information, { ...this.props(), reason: destination });
    this.settle(false, 0);
    if (destination === 'setup') this.scene.start(SceneKeys.PairPalsSetup);
    else openPuzzlePicker(this);
  }

  // ----- The win ---------------------------------------------------------

  /**
   * Count the game's points once: "This visit" and My Scores (finished = a
   * win). Left before the first turn, it isn't a game.
   */
  private settle(finished: boolean, points: number): void {
    if (this.settled) return;
    this.settled = true;
    SessionTotalScore.add(points);
    if (finished || this.board.turns > 0) getMyScores().record('pair-pals', points, finished);
  }

  private win(): void {
    this.won = true;
    this.focusRing?.clear();
    const result = getPairPalsProgress().recordWin(this.size, this.board.turns);
    const { cols, rows } = this.cfg.sizes[this.size];
    const points = pairPalsPoints(this.size, cols * rows, this.board.turns);
    this.settle(true, points);
    _th.logToAi('PairPalsCompleted', SeverityLevel.Information, {
      ...this.props(),
      turns: String(result.turns),
      newBest: String(result.newBest),
      roundScore: String(points),
    });
    // Every card does a little wave, in reading order, and the mascot cheers.
    this.cards.forEach((card, i) => {
      this.tweens.add({
        targets: card.root,
        y: card.root.y - 14,
        delay: this.cfg.matchPopMs * 2 + i * this.cfg.winWaveStaggerMs,
        duration: this.cfg.winWaveMs / 2,
        yoyo: true,
        ease: 'Sine.Out',
      });
    });
    this.time.delayedCall(this.cfg.matchPopMs * 2, () => {
      this.hopMascot();
      const { width, height } = this.scale;
      for (let k = 0; k < 4; k++) {
        this.time.delayedCall(k * 180, () => this.sparkle(width * (0.3 + 0.13 * k), height * 0.4));
      }
    });
    this.time.delayedCall(this.cfg.winPanelDelayMs, () => this.showWinPanel(result, points));
  }

  private showWinPanel(result: GameResult, points: number): void {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;
    this.add.rectangle(0, 0, width, height, 0x000000, 0.45).setOrigin(0).setDepth(Z.panel);
    this.add.rectangle(cx, cy, 680, 480, 0x1f2740, 0.96).setStrokeStyle(4, 0xfacc15).setDepth(Z.panel);
    const [found, best] = winLines(totalPairs(this.board), result);
    text(this, cx, cy - 176, 'You did it!', 'success')
      .setOrigin(0.5)
      .setDepth(Z.panel);
    text(this, cx, cy - 104, found, 'bodyLarge')
      .setOrigin(0.5)
      .setDepth(Z.panel);
    text(this, cx, cy - 60, `${formatPoints(points)} points!`, 'accent')
      .setOrigin(0.5)
      .setDepth(Z.panel);
    const bestText = text(this, cx, cy - 18, best, result.newBest ? 'accent' : 'bodyAccent');
    bestText.setOrigin(0.5).setDepth(Z.panel);
    if (result.newBest) {
      this.tweens.add({ targets: bestText, scale: { from: 0.6, to: 1 }, duration: 320, ease: 'Back.Out' });
    }

    const playAgain = new PlaceholderButton({
      scene: this,
      x: cx,
      y: cy + 56,
      width: 320,
      height: 72,
      label: 'Play Again',
      onClick: () => this.scene.restart(),
    }).setDepth(Z.panel);
    // The setup screen, where the cards and the difficulty are picked.
    const row = (dx: number, w: number, label: string, onClick: () => void): PlaceholderButton =>
      new PlaceholderButton({ scene: this, x: cx + dx, y: cy + 148, width: w, height: 64, label, onClick }).setDepth(
        Z.panel,
      );
    const change = row(-100, 340, 'Change Cards or Difficulty', () => this.scene.start(SceneKeys.PairPalsSetup));
    // Menu: the game picker, on the Puzzles tab.
    const menu = row(190, 200, 'Menu', () => openPuzzlePicker(this));
    new KeyboardNavigator(this, [playAgain, change, menu]);
  }

  // ----- Shared ----------------------------------------------------------

  private props(): { gameId: string; theme: string; boardSize: string } {
    return { gameId: 'pair-pals', theme: this.theme, boardSize: this.size };
  }

  private cleanUp(): void {
    this.cancelHold();
    this.time.paused = false;
    this.input.keyboard?.removeAllListeners();
    if (this.musicKey !== null) getAudioManager().stopLoop(this.musicKey);
    this.musicKey = null;
    for (const key of [SceneKeys.PauseOverlay, SceneKeys.Settings]) {
      if (this.scene.isActive(key)) this.scene.stop(key);
    }
  }
}
