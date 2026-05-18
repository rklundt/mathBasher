// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import {
  _resetCachedSpriteTier,
  getCachedSpriteTier,
  pickSpriteTier,
} from '@/core/spriteKeys';

/**
 * Sprint 0.7 Story 13 (D5 from sprint 0.6.3 wrap-up review) — unit
 * test for `pickSpriteTier(viewportWidth, dpr)`.
 *
 * The function is pure (no side effects, no DOM access — viewport +
 * DPR are passed in) and load-bearing for ADR-0010's two-tier sprite
 * strategy. The JSDoc on the function lists 5 example viewports +
 * their expected tier choices — those exact examples are tested here
 * so a future change can't quietly drift the heuristic.
 *
 * Threshold: viewportWidth × dpr ≥ 1920 → 192 tier; else → 128 tier.
 */
describe('pickSpriteTier', () => {
  describe('JSDoc example viewports', () => {
    it('iPhone 14 (390×844 @ DPR 3 = 1170 effective) → 128', () => {
      expect(pickSpriteTier(390, 3)).toBe(128);
    });

    it('iPad Air (1024×768 @ DPR 2 = 2048 effective) → 192', () => {
      expect(pickSpriteTier(1024, 2)).toBe(192);
    });

    it('1080p desktop (1920×1080 @ DPR 1) → 192', () => {
      expect(pickSpriteTier(1920, 1)).toBe(192);
    });

    it('1366 laptop (1366×768 @ DPR 1) → 128', () => {
      expect(pickSpriteTier(1366, 1)).toBe(128);
    });

    it('Retina 14" MacBook (1440×900 @ DPR 2 = 2880 effective) → 192', () => {
      expect(pickSpriteTier(1440, 2)).toBe(192);
    });
  });

  describe('threshold edge cases (viewportWidth × dpr = exactly 1920)', () => {
    it('1920×1 = 1920 (the boundary) → 192 (≥ is the rule, not >)', () => {
      expect(pickSpriteTier(1920, 1)).toBe(192);
    });

    it('960×2 = 1920 (also exactly the boundary) → 192', () => {
      expect(pickSpriteTier(960, 2)).toBe(192);
    });

    it('1919×1 = 1919 (just under) → 128', () => {
      expect(pickSpriteTier(1919, 1)).toBe(128);
    });
  });

  describe('extreme inputs (defensive)', () => {
    it('zero viewport width → 128 (effective 0 < 1920)', () => {
      expect(pickSpriteTier(0, 1)).toBe(128);
    });

    it('zero DPR → 128 (effective 0 < 1920; defensive — DPR shouldn\'t be 0 in practice)', () => {
      expect(pickSpriteTier(2000, 0)).toBe(128);
    });

    it('huge 4K viewport (3840×1) → 192', () => {
      expect(pickSpriteTier(3840, 1)).toBe(192);
    });

    it('retina 4K (3840×2 = 7680 effective) → 192', () => {
      expect(pickSpriteTier(3840, 2)).toBe(192);
    });
  });
});

/**
 * Sprint 2.1.6 — `getCachedSpriteTier` memoizes the boot-time tier
 * choice so per-game preloads pick the same value as BootScene. Both
 * `_resetCachedSpriteTier` (test-only) and the cache-hit invariant
 * need locking so a future refactor doesn't quietly break the
 * one-tier-per-session contract.
 */
describe('getCachedSpriteTier', () => {
  // Default vitest env is `node` (no DOM). We stub a minimal `window`
  // shim on globalThis to satisfy `getCachedSpriteTier`'s direct read
  // of `window.innerWidth` / `window.devicePixelRatio`. Avoids
  // adding jsdom as a dev dependency just for these 3 tests.
  type WindowShim = { innerWidth: number; devicePixelRatio: number };
  const setWindow = (innerWidth: number, devicePixelRatio: number): void => {
    (globalThis as unknown as { window: WindowShim }).window = { innerWidth, devicePixelRatio };
  };
  const clearWindow = (): void => {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (globalThis as unknown as { window?: WindowShim }).window;
  };

  beforeEach(() => {
    _resetCachedSpriteTier();
  });

  afterEach(() => {
    _resetCachedSpriteTier();
    clearWindow();
  });

  it('first call reads window viewport × DPR via pickSpriteTier', () => {
    setWindow(1920, 1);
    expect(getCachedSpriteTier()).toBe(192);
  });

  it('subsequent calls return the cached value even if window changes', () => {
    setWindow(1920, 1);
    const first = getCachedSpriteTier();
    // Mid-session window change shouldn't affect the cached choice —
    // boot-time tier decision is final per ADR-0010 D4.
    setWindow(200, 1);
    expect(getCachedSpriteTier()).toBe(first);
  });

  it('_resetCachedSpriteTier forces recomputation on next call', () => {
    setWindow(1920, 1);
    expect(getCachedSpriteTier()).toBe(192);
    _resetCachedSpriteTier();
    setWindow(200, 1);
    expect(getCachedSpriteTier()).toBe(128);
  });
});
