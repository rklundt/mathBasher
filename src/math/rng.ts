// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Production RNG for the math layer.
 *
 * Math.random wrapped as a function reference so callers always pass a
 * function (even when they don't care about determinism). Tests inject a
 * seeded RNG via the same `() => number` shape — see
 * `src/test-utils/mulberry32.ts`.
 *
 * NOT cryptographically secure. Math.random is fine for picking math
 * problems and shuffling answer choices; do not reach for it for tokens,
 * score signing, session ids, or anything that needs to be hard to predict.
 */
export const defaultRng: () => number = Math.random;
