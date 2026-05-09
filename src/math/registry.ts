// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { config, type MathId } from '@/core/config';
import addTo10 from '@/math/generators/addTo10';
import type { QuestionGenerator } from '@/math/types';

/**
 * Stub generator for math types whose real implementations haven't landed yet.
 *
 * Keeping these in the registry keeps the keyspace in sync with
 * `config.scoring.mathDifficulty` so the difficulty-select UI can render every
 * tile (with the stubbed ones disabled). Calling `.generate()` on a stub throws
 * a clear error, surfacing accidental use.
 */
function makeStub(id: MathId, label: string): QuestionGenerator {
  return {
    id,
    label,
    description: 'Coming soon.',
    generate(): never {
      throw new Error(`Generator not yet implemented: ${id}`);
    },
  };
}

/**
 * Map every `MathId` (== every key of `config.scoring.mathDifficulty`) to its
 * generator. Adding a new math type means: (1) adding a key to
 * `config.scoring.mathDifficulty`, (2) writing a generator file, (3) wiring it
 * here. No engine changes required.
 *
 * Keys must stay in sync with config; the test suite verifies this.
 */
export const generators: Record<MathId, QuestionGenerator> = {
  'add-to-10': addTo10,
  'add-to-20': makeStub('add-to-20', 'Add to 20'),
  'sub-to-10': makeStub('sub-to-10', 'Subtract within 10'),
  'sub-to-20': makeStub('sub-to-20', 'Subtract within 20'),
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
  return (Object.keys(config.scoring.mathDifficulty) as MathId[]).filter((id) => {
    const gen = generators[id];
    // A stub throws on generate(); detect by trying once with a noop RNG and
    // catching. This avoids tagging stubs explicitly which would couple them.
    try {
      gen.generate(() => 0);
      return true;
    } catch {
      return false;
    }
  });
}
