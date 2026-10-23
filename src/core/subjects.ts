// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { config, type MathId } from '@/core/config';

/**
 * Sprint 2.9.1 — subjects and their challenge types (ADR-0014). The player
 * picks Subject → Challenge type → Game → Difficulty; the challenge picker
 * shows one tab per subject here.
 *
 * Deliberately small: this lists which challenges belong to which subject,
 * in picker order, and nothing else. A challenge's label stays with its
 * question generator (`src/math/registry.ts`) and its points with
 * `config.scoring`, so nothing is copied here.
 *
 * Today Math is the only subject, so a challenge id IS a math type id
 * (`ChallengeId = MathId`): scoring, timing and telemetry (`mathId`) keep
 * working unchanged. A second subject widens `SubjectId` and `ChallengeId`
 * and adds its entry below (with its own generators and scoring rows).
 */
export type SubjectId = 'math';

/** A challenge type (Add to 10, Subtract Fractions…). Today every challenge is a math type. */
export type ChallengeId = MathId;

export interface Subject {
  readonly id: SubjectId;
  /** The tab label on the challenge picker. */
  readonly label: string;
  /** Its challenges, in picker order. */
  readonly challenges: readonly ChallengeId[];
}

export const SUBJECTS: readonly Subject[] = [
  {
    id: 'math',
    label: 'Math',
    // The scoring table's order: whole numbers, then Mixed and fractions.
    challenges: Object.keys(config.scoring.mathDifficulty) as MathId[],
  },
];

/** The subject a challenge belongs to. */
export function subjectOf(id: ChallengeId): Subject {
  const subject = SUBJECTS.find((s) => s.challenges.includes(id));
  if (subject === undefined) throw new Error(`Challenge "${id}" is not in any subject`);
  return subject;
}
