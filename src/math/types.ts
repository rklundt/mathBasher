// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type { MathId } from '@/core/config';

/**
 * A single math question with the correct answer and a shuffled set of choices
 * including the correct one. `choices.length` matches `config.layout.targetLanes`
 * (4) — one per descending alien per the gameplay design.
 */
export interface Question {
  /** Human-readable prompt, e.g. `"7 + 5 = ?"`. */
  prompt: string;
  /** The correct numeric answer. */
  correctAnswer: number;
  /** Shuffled answer choices; always includes `correctAnswer`. */
  choices: number[];
}

/**
 * A pluggable question generator. One instance per math difficulty (Add to 10,
 * Sub to 20, etc.). Adding a new math type = adding one of these and registering
 * it in `src/math/registry.ts`. No engine changes required.
 *
 * The optional `rng` parameter is the only randomness input; passing a seeded
 * RNG enables deterministic tests. When omitted, generators use `Math.random`.
 */
export interface QuestionGenerator {
  /** Stable identifier matching a key in `config.scoring.mathDifficulty`. */
  id: MathId;
  /** Short human-readable name used on the difficulty-select tile. */
  label: string;
  // NOTE (sprint 1.5 wrap-up): the previous `description` field was
  // deleted as dead code — it became unread once DifficultyScene
  // Story 5 dropped the subtitle rendering. If a future
  // sprint adds tooltips, hover popups, or a help screen that needs
  // per-generator description text, restore the field from git history
  // (e.g. `git show HEAD~10:src/math/types.ts`); the prior commit had
  // each generator already providing a kid-friendly description string.
  /**
   * If true, this generator is a placeholder for a math type whose real
   * implementation hasn't landed yet. The difficulty-select UI uses this to
   * disable the corresponding tile, and `generate()` will throw rather than
   * produce a Question.
   */
  isStub?: boolean;
  /**
   * Produce one fresh question. `rng()` should return a float in [0, 1) like
   * `Math.random` — the function (not the value) is injected so callers can
   * supply seeded generators in tests.
   */
  generate(rng?: () => number): Question;
}

