// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { config, type MathId } from '@/core/config';
import addTo10 from '@/math/generators/addTo10';
import addTo20 from '@/math/generators/addTo20';
import subTo10 from '@/math/generators/subTo10';
import subTo20 from '@/math/generators/subTo20';
import multTo100 from '@/math/generators/multTo100';
import multTo144 from '@/math/generators/multTo144';
import type { QuestionGenerator } from '@/math/types';

/**
 * Map every `MathId` (== every key of `config.scoring.mathDifficulty`) to its
 * generator. Adding a new math type means: (1) adding a key to
 * `config.scoring.mathDifficulty`, (2) writing a generator file, (3) wiring it
 * here. No engine changes required.
 *
 * Keys must stay in sync with config; the test suite verifies this.
 *
 * Sprint 1.1: all Phase 1 generators (add-to-10/20, sub-to-10/20, mult-to-100/144)
 * are now real implementations. No stubs remain. If a future sprint pre-adds a
 * key to `config.scoring.mathDifficulty` ahead of writing its generator,
 * recreate the `makeStub(id, label)` helper from git history (sprints 0.2 → 1.1
 * for the canonical pattern: returns a `QuestionGenerator` with `isStub: true`
 * whose `.generate()` throws an actionable error pointing at the missing
 * generator file).
 */
export const generators: Record<MathId, QuestionGenerator> = {
  'add-to-10': addTo10,
  'add-to-20': addTo20,
  'sub-to-10': subTo10,
  'sub-to-20': subTo20,
  'mult-to-100': multTo100,
  'mult-to-144': multTo144,
};

/**
 * Resolve a `MathId` to its generator. Always returns a generator (never
 * undefined) because TypeScript ensures `id` is one of the known keys.
 */
export function getGenerator(id: MathId): QuestionGenerator {
  return generators[id];
}

/**
 * The set of math difficulty ids whose generators are real (not stubs).
 * The difficulty-select UI uses this to decide which tiles are enabled.
 */
export function getImplementedIds(): MathId[] {
  return (Object.keys(config.scoring.mathDifficulty) as MathId[]).filter(
    (id) => !generators[id].isStub,
  );
}
