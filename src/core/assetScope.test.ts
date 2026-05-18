// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import { isBootScope, isGameScope, type AssetScope } from '@/core/assetScope';

/**
 * Sprint 2.1.6 — partition-helper contracts. Tiny pure functions; the
 * tests exist mostly to lock the truth-table so a future refactor
 * (e.g. promoting `always` to lazy-only) flips one place and the
 * tests' broken assertions point to every consumer that needs review.
 */
describe('assetScope partition helpers', () => {
  describe('isBootScope', () => {
    it('eager → boot-loaded', () => {
      expect(isBootScope('eager')).toBe(true);
    });
    it('always → boot-loaded', () => {
      expect(isBootScope('always')).toBe(true);
    });
    it('game:alien-shoot → NOT boot-loaded', () => {
      expect(isBootScope('game:alien-shoot' as AssetScope)).toBe(false);
    });
    it('game:asteroid-field → NOT boot-loaded', () => {
      expect(isBootScope('game:asteroid-field' as AssetScope)).toBe(false);
    });
  });

  describe('isGameScope', () => {
    it('always → loaded for every game', () => {
      expect(isGameScope('always', 'alien-shoot')).toBe(true);
      expect(isGameScope('always', 'asteroid-field')).toBe(true);
    });
    it('eager → NOT loaded by game preloader (already boot-loaded)', () => {
      expect(isGameScope('eager', 'alien-shoot')).toBe(false);
      expect(isGameScope('eager', 'asteroid-field')).toBe(false);
    });
    it('game:<id> → loaded ONLY when the matching game is picked', () => {
      expect(isGameScope('game:alien-shoot', 'alien-shoot')).toBe(true);
      expect(isGameScope('game:alien-shoot', 'asteroid-field')).toBe(false);
      expect(isGameScope('game:asteroid-field', 'asteroid-field')).toBe(true);
      expect(isGameScope('game:asteroid-field', 'alien-shoot')).toBe(false);
    });
  });
});
