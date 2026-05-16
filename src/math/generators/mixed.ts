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
 * Inject the delegate-picker function. Called by registry.ts EXACTLY
 * ONCE, right after its `generators` map is defined. Sprint 1.5 wrap-up
 * (InfoSec + Sr Dev should-fix): throws on second call to enforce the
 * write-once contract — a second call would indicate a programming
 * error (e.g. a runtime bundle override or a missed test cleanup) and
 * silently overwriting would mask the bug. If a future test genuinely
 * needs to swap the picker, use `__resetMixedDelegateForTests()` below
 * (test-only escape hatch).
 */
export function setMixedDelegate(picker: MixedDelegatePicker): void {
  if (_picker !== null) {
    throw new Error(
      'setMixedDelegate called twice — write-once contract violated. ' +
        'This usually means registry.ts was loaded twice (test isolation bug) ' +
        'or a foreign module attempted to override the production picker. ' +
        'For legitimate test re-injection, call __resetMixedDelegateForTests() first.',
    );
  }
  _picker = picker;
}

/**
 * Test-only escape hatch — resets `_picker` so a subsequent
 * `setMixedDelegate` call won't throw. Production code MUST NOT call
 * this. Named with `__` prefix to flag the unusual nature; production
 * code that wants to swap pickers should be flagged in review.
 */
export function __resetMixedDelegateForTests(): void {
  _picker = null;
}

const mixed: QuestionGenerator = {
  id: 'mixed',
  // Sprint 1.5 wrap-up — renamed "Mixed" → "Mixed Math" per Support
  // reviewer feedback. Original "Mixed" was opaque to first-time
  // players (mixed what? colors? difficulties?); "Mixed Math" is
  // self-descriptive without needing the subtitle that all other math
  // tiles dropped in sprint 1.5 Story 5. Label fits the existing 220px
  // tile width with margin.
  label: 'Mixed Math',
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
