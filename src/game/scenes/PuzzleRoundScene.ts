// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel, type TelemetryProps } from '@/core/telemetry';
import { config, type PuzzleLevel } from '@/core/config';
import { SceneKeys } from '@/core/sceneKeys';
import { openPuzzlePicker } from '@/game/services/challengeSelection';
import type { RoundPuzzleId } from '@/core/gameIds';
import { puzzleById } from '@/core/puzzles';
import { PUZZLE_BACKDROP_KEYS } from '@/core/spriteKeys';
import { GAME_MUSIC_MAP, pickBonusCheerSfx, pickPairPalsMatchSfx, pickPairPalsMissSfx } from '@/core/audioKeys';
import { getAudioManager } from '@/services/audioManagerFactory';
import { Settings } from '@/services/Settings';
import { getPuzzleProgress } from '@/services/PuzzleProgress';
import { PuzzleScore } from '@/services/puzzlePoints';
import { SessionTotalScore } from '@/services/SessionTotalScore';
import { getMyScores } from '@/services/MyScores';
import { formatPoints } from '@/services/challengePoints';
import { speedMarks } from '@/game/ui/speedPhrases';
import { setupScene } from '@/game/scenes/sceneSetup';
import { loadAudioOnDemand, loadGameBundle } from '@/game/services/assetLoader';
import { PromptPill, PuzzleBackdrop, PuzzleDancers, PuzzleTopBar, showEndPanel } from '@/game/ui/puzzleFrame';
import type { PauseOverlayInit, PuzzleQuitDestination } from '@/game/scenes/PauseOverlay';

/**
 * Sprint 2.14 — what every puzzle-pack round shares: the frame (backdrops,
 * top bar and progress bar, dancers, prompt), the level, green / yellow /
 * red steps, points (`services/puzzlePoints.ts`: shown in the top bar,
 * added to "This visit" and My Scores at the end or on leaving), pause,
 * music (the puzzle's track, loaded on demand), and the end of the round.
 * Each puzzle's scene extends it and plays its 8 puzzles.
 */
export abstract class PuzzleRoundScene extends Phaser.Scene {
  protected id!: RoundPuzzleId;
  protected level: PuzzleLevel = 'easy';
  protected bar!: PuzzleTopBar;
  protected dancers!: PuzzleDancers;
  protected prompt!: PromptPill;
  protected backdrop!: PuzzleBackdrop;
  /** The puzzle being played (0-based). */
  protected index = 0;
  /** Puzzles done green this round (right first try, in time). */
  protected greens = 0;
  protected paused = false;
  protected ended = false;
  private score!: PuzzleScore;
  /** Time on this puzzle so far (paused time doesn't count), for the speed bonus. */
  private elapsedMs = 0;
  /** The round's points are counted (end or leaving); never twice. */
  private settled = false;
  private backdropStart = 0;
  private resumedAt = 0;
  private musicKey: string | null = null;

  /** The puzzle this scene plays, from `Settings.round.gameId` (null: not one of its own). */
  protected abstract puzzleId(): RoundPuzzleId | null;
  /** Build the round (called from `create`, after the frame is up). */
  protected abstract startRound(): void;

  preload(): void {
    const id = this.puzzleId();
    if (id !== null) loadGameBundle(this, id);
  }

  create(): void {
    setupScene(this);
    const id = this.puzzleId();
    if (id === null) {
      _th.logToAi(`${this.scene.key}.notItsPuzzle`, SeverityLevel.Warning, { gameId: Settings.round.gameId });
      this.scene.start(SceneKeys.Menu);
      return;
    }
    this.id = id;
    this.level = getPuzzleProgress().level(id);
    this.index = 0;
    this.greens = 0;
    this.paused = false;
    this.ended = false;
    this.musicKey = null;
    this.score = new PuzzleScore(this.level);
    this.elapsedMs = 0;
    this.settled = false;

    this.backdrop = new PuzzleBackdrop(this, PUZZLE_BACKDROP_KEYS[id]);
    this.backdropStart = Math.floor(Math.random() * PUZZLE_BACKDROP_KEYS[id].length);
    this.backdrop.show(this.backdropStart);
    this.dancers = new PuzzleDancers(this);
    this.bar = new PuzzleTopBar(this, puzzleById(id).label, config.puzzles.perRound, () => this.openPause());
    this.prompt = new PromptPill(this);
    this.refreshTopLeft();

    this.input.keyboard?.on('keydown-ESC', () => {
      if (Date.now() - this.resumedAt < 250) return;
      this.openPause();
    });
    this.events.once('shutdown', () => this.cleanUp());
    this.startMusic();
    _th.logToAi('PuzzleRoundStarted', SeverityLevel.Information, this.props());
    this.startRound();
  }

  /** Call when puzzle `i` begins: the backdrop changes, the progress bar points at it, dancers swap now and then. */
  protected beginPuzzle(i: number, promptText: string): void {
    this.index = i;
    this.backdrop.show(this.backdropStart + i);
    this.bar.setCurrent(i);
    this.prompt.setText(promptText);
    this.restartClock();
    if (i > 0 && i % config.puzzles.timings.dancerSwapEvery === 0) this.dancers.swap();
  }

  update(_time: number, delta: number): void {
    if (!this.paused && !this.ended) this.elapsedMs += delta;
  }

  /** The speed bonus counts from now (a puzzle begins; Copy Cat: "Your turn!"). */
  protected restartClock(): void {
    this.elapsedMs = 0;
  }

  /** The seconds an untimed puzzle's speed bonus counts against (Copy Cat: by its sequence). */
  protected speedSeconds(): number {
    const seconds = config.puzzles.points.speedSeconds as Partial<Record<string, number>>;
    return seconds[this.id] ?? 30;
  }

  /** The top bar's left label: the points (Copy Cat adds its sequence length). */
  protected topLeftLabel(): string {
    return `Points: ${formatPoints(this.score.points)}`;
  }

  protected refreshTopLeft(): void {
    this.bar.setLeft(this.topLeftLabel());
  }

  /** Green or yellow for a right answer: green needs no misses and, on a timed puzzle, little of the time used. */
  protected stepFor(misses: number, timeUsed = 0): 'green' | 'yellow' {
    return misses === 0 && timeUsed <= config.puzzles.steps.greenShare ? 'green' : 'yellow';
  }

  /** True once a puzzle has had all the misses it gets (it goes red). */
  protected outOfTries(misses: number): boolean {
    return misses >= config.puzzles.steps.maxMisses;
  }

  /**
   * A right answer after `misses` wrong picks: sound, cheer, a green or
   * yellow step, the points, and the note. Then `next` after a moment.
   * `sandUsed`: the timed puzzles' share of the sand gone (it also decides
   * green); null on the untimed ones, which use the clock.
   */
  protected markRight(misses: number, sandUsed: number | null, note: string, next: () => void): void {
    const step = this.stepFor(misses, sandUsed ?? 0);
    const got = this.score.right(misses, sandUsed ?? this.elapsedMs / 1000 / this.speedSeconds());
    this.refreshTopLeft();
    this.bar.popPoints(`+${formatPoints(got.points)}${got.tier > 0 ? ` ${speedMarks(got.tier)}` : ''}`);
    getAudioManager().play(pickPairPalsMatchSfx(), 'sfx');
    this.dancers.cheer();
    this.bar.mark(this.index, step);
    if (step === 'green') this.greens++;
    this.prompt.flash(note, 'good', config.puzzles.timings.rightHoldMs + 400);
    this.time.delayedCall(config.puzzles.timings.rightHoldMs, next);
  }

  /** A wrong answer: a soft sound, "Oh!" from the dancers, "Try again!". */
  protected markWrong(msg = 'Try again!'): void {
    getAudioManager().play(pickPairPalsMissSfx(), 'sfx');
    this.dancers.oops();
    this.prompt.flash(msg, 'retry');
  }

  /** Missed (too many misses, or the time ran out): a red step, the answer shown, then `next`. */
  protected markRed(note: string, next: () => void): void {
    getAudioManager().play(pickPairPalsMissSfx(), 'sfx');
    this.dancers.oops();
    this.bar.mark(this.index, 'red');
    this.prompt.flash(note, 'retry', config.puzzles.steps.redHoldMs + 300);
    this.time.delayedCall(config.puzzles.steps.redHoldMs, next);
  }

  /** The round is over: record it and show the end panel. */
  protected endRound(): void {
    if (this.ended) return;
    this.ended = true;
    const total = config.puzzles.perRound;
    const bonus = this.score.finish(this.greens === total);
    this.refreshTopLeft();
    this.settle(true);
    const result = getPuzzleProgress().recordRound(this.id, this.level, this.greens);
    _th.logToAi('PuzzleRoundCompleted', SeverityLevel.Information, {
      ...this.props(),
      firstTry: String(result.firstTry),
      stars: String(result.stars),
      newBest: String(result.newBest),
      roundScore: String(this.score.points),
    });
    getAudioManager().play(pickBonusCheerSfx(), 'sfx');
    this.dancers.cheer();
    const pointsLine =
      bonus.perfect > 0
        ? `${formatPoints(this.score.points)} points, with the All Green bonus!`
        : `${formatPoints(this.score.points)} points!`;
    const bestLine =
      result.previousBest === null
        ? 'Your first round at this level!'
        : result.newBest
          ? 'New best!'
          : `Your best is ${String(result.previousBest)} of ${String(total)}`;
    this.time.delayedCall(config.puzzles.timings.endPanelDelayMs, () =>
      showEndPanel(this, {
        title: result.stars === 3 ? 'Amazing!' : 'You did it!',
        lines: [`${String(result.firstTry)} of ${String(total)} green!`, pointsLine, bestLine],
        stars: result.stars,
        newBest: result.newBest && result.previousBest !== null,
        changeLabel: 'Change Difficulty',
        onPlayAgain: () => this.scene.restart(),
        onChange: () => this.scene.start(SceneKeys.PuzzleSetup),
        onMenu: () => openPuzzlePicker(this),
      }),
    );
  }

  /** True while taps should do nothing (paused, or the round is over). */
  protected get blocked(): boolean {
    return this.paused || this.ended;
  }

  protected props(): TelemetryProps {
    return { gameId: this.id, level: this.level };
  }

  // ----- music + pause ---------------------------------------------------

  private startMusic(): void {
    const key = GAME_MUSIC_MAP[this.id];
    this.musicKey = key;
    loadAudioOnDemand(this, key, () => {
      if (this.musicKey !== key) return;
      getAudioManager().playLoop(key, 'music');
      if (this.paused) getAudioManager().pauseAllLoops();
    });
  }

  protected openPause(): void {
    if (this.paused || this.ended || this.scene.isActive(SceneKeys.PauseOverlay)) return;
    this.paused = true;
    this.tweens.pauseAll();
    this.time.paused = true;
    getAudioManager().pauseAllLoops();
    _th.logToAi('GamePaused', SeverityLevel.Information, this.props());
    const init: PauseOverlayInit = {
      resumeFn: () => this.resume(),
      puzzleQuitFn: (destination) => this.quit(destination),
      puzzleChangeLabel: 'Change Difficulty',
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
    _th.logToAi('PuzzleRoundQuit', SeverityLevel.Information, {
      ...this.props(),
      reason: destination,
      questionIndex: String(this.index),
      roundScore: String(this.score.points),
    });
    this.settle(false);
    if (destination === 'setup') this.scene.start(SceneKeys.PuzzleSetup);
    else openPuzzlePicker(this);
  }

  /**
   * Count the round's points once: "This visit" and My Scores (finished =
   * it reached the end). Left before the first answer, it isn't a round.
   */
  private settle(finished: boolean): void {
    if (this.settled) return;
    this.settled = true;
    const points = this.score.points;
    SessionTotalScore.add(points);
    if (finished || this.index > 0 || points > 0) getMyScores().record(this.id, points, finished);
  }

  private cleanUp(): void {
    this.time.paused = false;
    if (this.musicKey !== null) getAudioManager().stopLoop(this.musicKey);
    this.musicKey = null;
    for (const key of [SceneKeys.PauseOverlay, SceneKeys.Settings]) {
      if (this.scene.isActive(key)) this.scene.stop(key);
    }
  }
}
