// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { config, type MathId, type SpeedKey } from '@/core/config';
import { getGenerator } from '@/math/registry';
import { ScoreCalculator, type QuestionOutcome } from '@/services/ScoreCalculator';
import type { Question } from '@/math/types';

/**
 * Pure helper that owns the round-level state for any game-mode scene:
 *   - the current question index (0..questionsPerRound-1)
 *   - the anti-repeat sliding window (sprint 1.1 wrap-up)
 *   - the ScoreCalculator (delegated to)
 *
 * Game-mode scenes (e.g. GameScene/Alien Shoot, AsteroidFieldScene) all
 * deal with the same round structure — 20 questions, one math type, one
 * speed, score adds up, pass/fail at the end. The differ-y parts are
 * physics + input + entities; the round bookkeeping is uniform.
 *
 * Extracted in sprint 2.1 (Asteroid Field) before introducing the second
 * game scene, so both scenes can share the bookkeeping without
 * duplicating the anti-repeat code (which has been re-tuned twice and
 * lives at high risk of drift if duplicated).
 *
 * Pure helper: no Phaser dependency. Tested in isolation in
 * `RoundController.test.ts`.
 */
export class RoundController {
  private _questionIndex = 0;
  private readonly recentPrompts: string[] = [];
  private readonly scoreCalculator: ScoreCalculator;
  private readonly mathId: MathId;
  /**
   * Total questions per round. Defaults to `config.round.questionsPerRound`
   * (20 — used by Alien Shoot + Asteroid Field). Sprint 2.2 added the
   * optional constructor override so Number Climb can run 10-floor
   * rounds without dragging the other modes' question count along.
   */
  private readonly _questionsPerRound: number;

  /**
   * @param mathId Selected math type (drives generator pick + score multiplier)
   * @param speed  Selected speed (drives score multiplier; game-mode scenes
   *               separately use this for their own physics tuning)
   * @param questionsPerRoundOverride Optional — round length for this
   *               game-mode. Defaults to `config.round.questionsPerRound`.
   *               Number Climb passes 10; Alien Shoot + Asteroid Field
   *               omit + get the default 20.
   */
  constructor(mathId: MathId, speed: SpeedKey, questionsPerRoundOverride?: number) {
    this.mathId = mathId;
    this.scoreCalculator = new ScoreCalculator(mathId, speed);
    this._questionsPerRound = questionsPerRoundOverride ?? config.round.questionsPerRound;
  }

  /** Total questions for this round (per-mode if the constructor override was used). */
  get questionsPerRound(): number {
    return this._questionsPerRound;
  }

  // ----- Question loop ------------------------------------------------------

  /**
   * Draw the next question (or null if the round is over). Applies the
   * anti-repeat sliding window: if the freshly-drawn prompt matches any of
   * the last `recentPromptHistoryLimit` prompts in this round, re-rolls up
   * to `recentPromptMaxRerolls` times before accepting the last attempt.
   *
   * History resets per-RoundController-instance (i.e. per-round, since
   * scenes construct a new RoundController each round).
   */
  drawNextQuestion(): Question | null {
    if (this._questionIndex >= this._questionsPerRound) return null;

    const generator = getGenerator(this.mathId);
    const historyLimit = config.round.recentPromptHistoryLimit;
    const maxRerolls = config.round.recentPromptMaxRerolls;

    let question: Question = generator.generate();
    if (historyLimit > 0) {
      let attempts = 1;
      while (attempts < maxRerolls && this.recentPrompts.includes(question.prompt)) {
        question = generator.generate();
        attempts += 1;
      }
      // Push the accepted prompt into history AFTER the draw so the
      // in-flight question is itself in-window for the NEXT call (i.e.
      // the immediately-next question can't match this one).
      this.recentPrompts.push(question.prompt);
      while (this.recentPrompts.length > historyLimit) {
        this.recentPrompts.shift();
      }
    }

    return question;
  }

  /**
   * Advance to the next question's index. Called by the game scene AFTER
   * the player's outcome on the current question has been recorded via
   * `recordOutcome`. Separated from `drawNextQuestion` so the caller can
   * inspect the just-completed question's state before moving on.
   */
  advanceQuestionIndex(): void {
    this._questionIndex += 1;
  }

  // ----- Scoring (delegate to ScoreCalculator, expose deltas) ---------------

  /**
   * Record the outcome of the current question and return the score delta
   * (used by the scene to emit `correctHit` events with the delta payload).
   */
  recordOutcome(outcome: QuestionOutcome): { scoreDelta: number; newScore: number } {
    const scoreBefore = this.scoreCalculator.score;
    this.scoreCalculator.recordOutcome(outcome);
    const newScore = this.scoreCalculator.score;
    return { scoreDelta: newScore - scoreBefore, newScore };
  }

  // ----- Round state (read-only views) --------------------------------------

  get questionIndex(): number {
    return this._questionIndex;
  }

  get score(): number {
    return this.scoreCalculator.score;
  }

  get correctCount(): number {
    return this.scoreCalculator.correctCount;
  }

  get passed(): boolean {
    return this.scoreCalculator.passed;
  }

  get stars(): 0 | 1 | 2 | 3 {
    return this.scoreCalculator.stars;
  }

  get isRoundOver(): boolean {
    return this._questionIndex >= this._questionsPerRound;
  }
}
