// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type { MathId } from '@/core/config';

/**
 * A single math question with the correct answer and a shuffled set of choices
 * including the correct one. `choices.length` matches `config.layout.targetLanes`
 * (4) — one per descending alien per the gameplay design.
 *
 * ## Display layer (sprint 2.4 story 1 — for fractions and any future
 * non-integer math type)
 *
 * The numeric fields (`correctAnswer` / `choices`) carry the values used for
 * equality checks, scoring math, and distractor-distinctness checks. They are
 * **never displayed directly** when a generator wants control over how the
 * answer renders. Integer generators leave the display fields undefined — the
 * renderer falls back to `String(value)` and shows the bare number, exactly as
 * before.
 *
 * Fraction generators set the display fields so `3/8` renders as `"3/8"` (and
 * NOT as `"0.375"`). Mixed numbers render as `"1 1/2"`. The numeric value
 * (`0.375` for `3/8`, `1.5` for `1 1/2`) is then ONLY used for internal
 * equality / distractor math — never shown to the kid.
 *
 * **Contract — all-or-none:** a generator either supplies display strings for
 * ALL choices or NONE. Partial display layers (e.g. `correctDisplay` set but
 * `choiceDisplays` absent, or `choiceDisplays.length !== choices.length`) are
 * a programming error. Renderers MAY assume the all-or-none invariant.
 */
export interface Question {
  /** Human-readable prompt, e.g. `"7 + 5 = ?"` (or `"1/4 + 1/8 = ?"` for fractions). */
  prompt: string;
  /**
   * The correct answer as a numeric value. For integer math types this is the
   * number the kid picks (e.g. `12`). For non-integer math types (fractions)
   * this is the decimal value used internally for equality + distractor checks
   * (e.g. `3/8` → `0.375`); the kid sees `correctDisplay` instead.
   */
  correctAnswer: number;
  /** Shuffled answer choices; always includes `correctAnswer`. */
  choices: number[];
  /**
   * Optional display string for `correctAnswer` (e.g. `"3/8"`, `"1 1/2"`).
   * When present, `choiceDisplays` MUST also be present with the same length
   * as `choices`. When both are absent (every integer generator today),
   * renderers fall back to `String(value)`.
   */
  correctDisplay?: string;
  /**
   * Optional display strings parallel to `choices` (same length, same order).
   * `choiceDisplays[i]` is the rendered form of `choices[i]`. See
   * `correctDisplay` above for the all-or-none contract.
   */
  choiceDisplays?: string[];
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

