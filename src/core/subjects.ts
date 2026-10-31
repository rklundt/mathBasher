// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { config, type MathId } from '@/core/config';
import { PUZZLES, type PuzzleId } from '@/core/puzzles';

/**
 * Sprint 2.9.1 — subjects and their challenge types (ADR-0014). Sprint 2.15
 * (ADR-0015): the Game Chooser's first step shows one tile per subject here,
 * and the math type is picked on each game's setup screen.
 *
 * Deliberately small: this lists which challenges belong to which subject,
 * in picker order, and nothing else. A challenge's label stays with its
 * question generator (`src/math/registry.ts`) and its points with
 * `config.scoring`, so nothing is copied here.
 *
 * Math is the only challenge subject, so a challenge id IS a math type id
 * (`ChallengeId = MathId`): scoring, timing and telemetry (`mathId`) keep
 * working unchanged.
 *
 * Sprint 2.13 — a second kind of subject: **Puzzles**, whose tab lists
 * puzzle games (`core/puzzles.ts`) instead of challenges. A puzzle has no
 * challenge, points or Difficulty; it opens its own setup screen.
 */
export type SubjectId = 'math' | 'puzzles';

/** A challenge type (Add to 10, Subtract Fractions…). Today every challenge is a math type. */
export type ChallengeId = MathId;

/** A subject of challenges, played in any game (Math). */
export interface ChallengeSubject {
  readonly kind: 'challenges';
  readonly id: SubjectId;
  /** The subject's name (its chooser tile and trail chip). */
  readonly label: string;
  /** Its challenges, in picker order. */
  readonly challenges: readonly ChallengeId[];
}

/** A subject of puzzle games, each with its own setup (Puzzles). */
export interface PuzzleSubject {
  readonly kind: 'puzzles';
  readonly id: SubjectId;
  readonly label: string;
  /** Its puzzles, in picker order. */
  readonly puzzles: readonly PuzzleId[];
}

export type Subject = ChallengeSubject | PuzzleSubject;

const MATH: ChallengeSubject = {
  kind: 'challenges',
  id: 'math',
  label: 'Math',
  // The scoring table's order: whole numbers, then Mixed and fractions.
  challenges: Object.keys(config.scoring.mathDifficulty) as MathId[],
};

const PUZZLE_SUBJECT: PuzzleSubject = {
  kind: 'puzzles',
  id: 'puzzles',
  label: 'Puzzles',
  puzzles: PUZZLES.map((p) => p.id),
};

/** Every subject, in tab order. */
export const SUBJECTS: readonly Subject[] = [MATH, PUZZLE_SUBJECT];

/** The subjects with challenges (My Scores, the pause card). */
export const CHALLENGE_SUBJECTS: readonly ChallengeSubject[] = SUBJECTS.filter(
  (s): s is ChallengeSubject => s.kind === 'challenges',
);

/** The subject a challenge belongs to. */
export function subjectOf(id: ChallengeId): ChallengeSubject {
  const subject = CHALLENGE_SUBJECTS.find((s) => s.challenges.includes(id));
  if (subject === undefined) throw new Error(`Challenge "${id}" is not in any subject`);
  return subject;
}

/** The subject with this id. */
export function subjectById(id: SubjectId): Subject {
  const subject = SUBJECTS.find((s) => s.id === id);
  if (subject === undefined) throw new Error(`Unknown subject "${id}"`);
  return subject;
}
