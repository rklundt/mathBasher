// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel, type TelemetryProps } from '@/core/telemetry';
import { config, type PuzzleLevel } from '@/core/config';
import { SceneKeys } from '@/core/sceneKeys';
import type { RoundPuzzleId } from '@/core/gameIds';
import { puzzleById } from '@/core/puzzles';
import { PUZZLE_BACKDROP_KEYS } from '@/core/spriteKeys';
import { GAME_MUSIC_MAP, pickBonusCheerSfx, pickPairPalsMatchSfx, pickPairPalsMissSfx } from '@/core/audioKeys';
import { getAudioManager } from '@/services/audioManagerFactory';
import { Settings } from '@/services/Settings';
import { getPuzzleProgress } from '@/services/PuzzleProgress';
import { setupScene } from '@/game/scenes/sceneSetup';
import { loadAudioOnDemand, loadGameBundle } from '@/game/services/assetLoader';
import { PromptPill, PuzzleBackdrop, PuzzleDancers, PuzzleTopBar, showEndPanel } from '@/game/ui/puzzleFrame';
import type { PauseOverlayInit, PuzzleQuitDestination } from '@/game/scenes/PauseOverlay';

/**
 * Sprint 2.14 — what every puzzle-pack round shares: the frame (backdrops,
 * top bar and progress bar, dancers, prompt), the level, first-try counting,
 * pause, music (the puzzle's track, loaded on demand), and the end of the
 * round. Each puzzle's scene extends it and plays its 8 puzzles.
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

    this.backdrop = new PuzzleBackdrop(this, PUZZLE_BACKDROP_KEYS[id]);
    this.backdropStart = Math.floor(Math.random() * PUZZLE_BACKDROP_KEYS[id].length);
    this.backdrop.show(this.backdropStart);
    this.dancers = new PuzzleDancers(this);
    this.bar = new PuzzleTopBar(this, puzzleById(id).label, config.puzzles.perRound, () => this.openPause());
    this.prompt = new PromptPill(this);

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
    if (i > 0 && i % config.puzzles.timings.dancerSwapEvery === 0) this.dancers.swap();
  }

  /** Green or yellow for a right answer: green needs no misses and, on a timed puzzle, little of the time used. */
  protected stepFor(misses: number, timeUsed = 0): 'green' | 'yellow' {
    return misses === 0 && timeUsed <= config.puzzles.steps.greenShare ? 'green' : 'yellow';
  }

  /** True once a puzzle has had all the misses it gets (it goes red). */
  protected outOfTries(misses: number): boolean {
    return misses >= config.puzzles.steps.maxMisses;
  }

  /** A right answer: sound, cheer, a green or yellow step, and the note. Then `next` after a moment. */
  protected markRight(step: 'green' | 'yellow', note: string, next: () => void): void {
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
    const result = getPuzzleProgress().recordRound(this.id, this.level, this.greens);
    _th.logToAi('PuzzleRoundCompleted', SeverityLevel.Information, {
      ...this.props(),
      firstTry: String(result.firstTry),
      stars: String(result.stars),
      newBest: String(result.newBest),
    });
    getAudioManager().play(pickBonusCheerSfx(), 'sfx');
    this.dancers.cheer();
    const total = config.puzzles.perRound;
    const bestLine =
      result.previousBest === null
        ? 'Your first round at this level!'
        : result.newBest
          ? 'New best!'
          : `Your best is ${String(result.previousBest)} of ${String(total)}`;
    this.time.delayedCall(config.puzzles.timings.endPanelDelayMs, () =>
      showEndPanel(this, {
        title: result.stars === 3 ? 'Amazing!' : 'You did it!',
        lines: [`${String(result.firstTry)} of ${String(total)} green!`, bestLine],
        stars: result.stars,
        newBest: result.newBest && result.previousBest !== null,
        changeLabel: 'Change Difficulty',
        onPlayAgain: () => this.scene.restart(),
        onChange: () => this.scene.start(SceneKeys.PuzzleSetup),
        onMenu: () => this.scene.start(SceneKeys.Menu),
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
    });
    this.scene.start(destination === 'setup' ? SceneKeys.PuzzleSetup : SceneKeys.Menu);
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
