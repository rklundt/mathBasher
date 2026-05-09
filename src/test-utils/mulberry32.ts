// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Mulberry32 — small, fast, seedable PRNG used by tests for deterministic
 * randomness. Math.random can't be seeded, so anything that wants reproducible
 * test runs needs an alternative. This is the standard Mulberry32 reference
 * implementation; it's good enough for property-style tests but is NOT
 * cryptographically secure (do not use for tokens, score signing, etc.).
 *
 * Test files only — production code uses Math.random via `defaultRng`.
 */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
