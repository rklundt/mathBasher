// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { defaultRng } from '@/math/rng';
import type { Question, QuestionGenerator } from '@/math/types';

/**
 * Mixed generator — random pick from all OTHER implemented math types.
 *
 * **Why this file has NO import from registry**: registry.ts imports
 * `mixed` (to put it in the generators map). If mixed.ts also imported
 * from registry, we'd have a circular dependency, and the default-export
 * binding doesn't reliably live-update across Vite's ESM-via-TypeScript
 * transpilation (we tried; `generators['mixed']` ended up `undefined` at
 * test-time, which broke registry-sync tests). The cleaner fix:
 *
 *   1. mixed.ts exports a pure-shape QuestionGenerator
 *   2. mixed.ts exports `setMixedDelegate(picker)` so an outside caller
 *      can inject the "how do I pick a non-Mixed generator?" logic
 *   3. registry.ts, AFTER its `generators` map is defined, calls
 *      `setMixedDelegate(...)` with a closure that has full registry
 *      access
 *
 * Result: mixed.ts has zero dependencies on registry shape; no circular
 * import; behavior identical to a direct lookup.
 *
 * **Score multiplier**: `config.scoring.mathDifficulty.mixed` is 2.5 (a
 * representative average between add-to-10's 1.0 and div-to-144's 4.0).
 * Per-question difficulty varies but the score has to be deterministic
 * per tile, so a fixed average works. A future sprint could compute a
 * weighted-average multiplier based on which generators are selected,
 * once a multi-select UI exists.
 *
 * **Anti-recursion**: registry's injected picker already filters
 * `id !== 'mixed'` before delegating. If a future bug ever caused mixed
 * to be picked as its own delegate, generate() would infinite-loop —
 * relying on the registry-side filter is intentional (single point of
 * control).
 */

/** Signature of the picker function registry.ts injects via setMixedDelegate. */
export type MixedDelegatePicker = (rng: () => number) => Question;

let _picker: MixedDelegatePicker | null = null;

/**
 * Inject the delegate-picker function. Called by registry.ts ONCE, right
 * after its `generators` map is defined. Subsequent calls overwrite the
 * picker — useful for test isolation but not used in production.
 */
export function setMixedDelegate(picker: MixedDelegatePicker): void {
  _picker = picker;
}

const mixed: QuestionGenerator = {
  id: 'mixed',
  label: 'Mixed',
  description: 'Random from all math types.',
  generate(rng = defaultRng): Question {
    if (_picker === null) {
      // Registry didn't wire us up — surface as a clear bug rather than
      // a confusing null-deref. In practice this throws only if registry.ts
      // is imported but somehow its bottom-of-file setMixedDelegate call
      // didn't execute (which would be a registry refactor bug).
      throw new Error(
        'mixed.generate(): no delegate picker registered. ' +
          'Did registry.ts forget to call setMixedDelegate after building the generators map?',
      );
    }
    return _picker(rng);
  },
};

export default mixed;
