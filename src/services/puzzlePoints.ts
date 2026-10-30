// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { config, type PuzzleLevel, type SpeedKey } from '@/core/config';
import { finishBonus, perfectBonus, speedBonusFor, speedTier, type SpeedTier } from '@/services/ScoreCalculator';
import { maxRoundScore } from '@/services/challengePoints';

/**
 * Sprint 2.14 — points for the puzzles (owner, 2026-10-28), measured against
 * an Add to 10 round at the same difficulty, so every number moves with
 * `config.scoring`:
 *
 *  - **The puzzle pack:** a round is worth up to `roundShare` (half) of an
 *    Add to 10 round. No challenge multiplier; the level's multiplier is
 *    the math difficulty's (Easy 1×, Medium 1.25×, Hard 1.5×). A right
 *    answer earns its worth (halved after a miss, as in math) plus the
 *    math speed bonus; a red one earns nothing. A finished round adds the
 *    Finish Bonus, and an all-green one the Perfect Round bonus, both at
 *    the same share.
 *  - **Pair Pals:** a win is worth up to a whole Add to 10 round. Full
 *    points in at most one turn per card; past that, every `stepShareOfCards`
 *    of the cards in extra turns (rounded up, the player's way) takes
 *    `dropPerStep` of the points off.
 */

const PP = config.puzzles.points;

/** The math difficulty a puzzle level scores like. */
export function levelSpeed(level: PuzzleLevel): SpeedKey {
  return level === 'easy' ? 'slow' : level === 'medium' ? 'medium' : 'fast';
}

/** An Add to 10 round's most points at this level's difficulty (Easy 2,400). */
function addTo10Max(level: PuzzleLevel): number {
  return maxRoundScore('add-to-10', levelSpeed(level), config.round.questionsPerRound);
}

/**
 * One right puzzle's worth (before a miss halves it): an Add to 10 answer
 * at this difficulty, times the share, spread over a puzzle round's 8
 * puzzles instead of math's 12 questions (Easy 75).
 */
export function puzzleAnswerWorth(level: PuzzleLevel): number {
  const { basePerCorrect, speed } = config.scoring;
  return (
    (basePerCorrect * speed[levelSpeed(level)].multiplier * PP.roundShare * config.round.questionsPerRound) /
    config.puzzles.perRound
  );
}

/** A puzzle round's most points: all green, all fastest, both bonuses (Easy 1,200, half of Add to 10's 2,400). */
export function puzzleRoundMax(level: PuzzleLevel): number {
  const answer = puzzleAnswerWorth(level);
  const end = puzzleEndBonuses(level, true, true);
  return Math.round(config.puzzles.perRound * (answer + speedBonusFor(answer, 3)) + end.finish + end.perfect);
}

/** The end-of-round bonuses: Finish for reaching the end, Perfect for every puzzle green. */
export function puzzleEndBonuses(
  level: PuzzleLevel,
  finished: boolean,
  allGreen: boolean,
): { finish: number; perfect: number } {
  if (!finished) return { finish: 0, perfect: 0 };
  const speed = levelSpeed(level);
  return {
    finish: finishBonus('add-to-10', speed) * PP.roundShare,
    perfect: allGreen ? perfectBonus('add-to-10', speed) * PP.roundShare : 0,
  };
}

/** One answer's points: what it earned and its speed tier (for the "⚡" note). */
export interface PuzzleAnswerPoints {
  readonly points: number;
  readonly tier: SpeedTier;
}

/** A round's running points. One per round; feed it each right answer. */
export class PuzzleScore {
  private _points = 0;

  constructor(private readonly level: PuzzleLevel) {}

  /** A right answer after `misses` wrong picks, `timeUsed` of its time gone (0–1). */
  right(misses: number, timeUsed: number): PuzzleAnswerPoints {
    const base = puzzleAnswerWorth(this.level) * (misses > 0 ? config.scoring.afterWrongShotMultiplier : 1);
    const tier = speedTier(timeUsed);
    // Not rounded, like math's answers (screens round totals).
    const points = base + speedBonusFor(base, tier);
    this._points += points;
    return { points, tier };
  }

  /** Add the end-of-round bonuses; returns them. */
  finish(allGreen: boolean): { finish: number; perfect: number } {
    const end = puzzleEndBonuses(this.level, true, allGreen);
    this._points += end.finish + end.perfect;
    return end;
  }

  get points(): number {
    return this._points;
  }
}

/** Pair Pals' most points at a level: a whole Add to 10 round (Easy 2,400). */
export function pairPalsMaxPoints(level: PuzzleLevel): number {
  return addTo10Max(level);
}

/**
 * Pair Pals' points for a win in `turns` turns on a board of `cards`:
 * full up to `fullTurnsPerCard` × cards, then `dropPerStep` off for every
 * step of extra turns (a step is `stepShareOfCards` of the cards, rounded
 * up), never below 0. 30 cards: 30 turns full, 33 turns 90 %.
 */
export function pairPalsPoints(level: PuzzleLevel, cards: number, turns: number): number {
  const P = config.pairPals.points;
  const extra = Math.max(0, turns - Math.floor(cards * P.fullTurnsPerCard));
  const step = Math.max(1, Math.ceil(cards * P.stepShareOfCards - 1e-9));
  const share = Math.max(0, 1 - Math.floor(extra / step) * P.dropPerStep);
  return Math.round(pairPalsMaxPoints(level) * share);
}
