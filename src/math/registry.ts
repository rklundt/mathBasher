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
import divTo100 from '@/math/generators/divTo100';
import divTo144 from '@/math/generators/divTo144';
import mixed, { setMixedDelegate } from '@/math/generators/mixed';
import type { QuestionGenerator } from '@/math/types';

/**
 * Map every `MathId` (== every key of `config.scoring.mathDifficulty`) to its
 * generator. Adding a new math type means: (1) adding a key to
 * `config.scoring.mathDifficulty`, (2) writing a generator file, (3) wiring it
 * here. No engine changes required.
 *
 * Keys must stay in sync with config; the test suite verifies this.
 *
 * Sprint 1.1: all Phase 1 add/sub/mult generators are real implementations.
 * Sprint 1.5: division (div-to-100, div-to-144) + Mixed added. All 9 Phase 1
 * MathIds now have real generators; no stubs remain. If a future sprint
 * pre-adds a key to `config.scoring.mathDifficulty` ahead of writing its
 * generator, recreate the `makeStub(id, label)` helper from git history
 * (sprints 0.2 → 1.1 for the canonical pattern: returns a `QuestionGenerator`
 * with `isStub: true` whose `.generate()` throws an actionable error
 * pointing at the missing generator file).
 *
 * Note on `mixed`: its file (`generators/mixed.ts`) creates a CIRCULAR
 * import (mixed imports this registry to delegate; this registry imports
 * mixed to put it in the map). ES modules handle this fine because the
 * `generators` and `getImplementedIds` symbols inside `mixed.ts` are live-
 * bound and only accessed at CALL time (during `mixed.generate()`),
 * never at module-load time. See the comment in `mixed.ts` for details.
 */
export const generators: Record<MathId, QuestionGenerator> = {
  'add-to-10': addTo10,
  'add-to-20': addTo20,
  'sub-to-10': subTo10,
  'sub-to-20': subTo20,
  'mult-to-100': multTo100,
  'mult-to-144': multTo144,
  'div-to-100': divTo100,
  'div-to-144': divTo144,
  mixed,
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

// Sprint 1.5 — wire up the Mixed generator's delegate picker. This MUST
// happen AFTER `generators` and `getImplementedIds` are defined above,
// because the closure below captures them. The dependency injection
// pattern lets `mixed.ts` stay free of any registry imports (see the
// long comment in `mixed.ts` for why we use this instead of a direct
// circular import — the short version is that default-export bindings
// don't reliably live-update through Vite's ESM/TypeScript transpile
// when there's a cycle).
setMixedDelegate((rng) => {
  const delegateIds = getImplementedIds().filter((id) => id !== 'mixed');
  if (delegateIds.length === 0) {
    throw new Error(
      "mixed delegate picker: no non-Mixed implemented generators in the registry " +
        "— cannot delegate. This is a registry-setup bug.",
    );
  }
  const idx = Math.floor(rng() * delegateIds.length);
  const pickedId = delegateIds[idx]!;
  return generators[pickedId].generate(rng);
});
