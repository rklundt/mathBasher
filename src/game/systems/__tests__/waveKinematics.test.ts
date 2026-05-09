// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, it, expect } from 'vitest';
import { advanceY, simulatePauseAwareAdvance } from '@/game/systems/waveKinematics';

/**
 * Pure-logic tests for the wave's pause-aware kinematics. These mirror the
 * 0.5.1 sprint contract:
 *   - "A paused system does not advance alien Y positions on update(dt)"
 *   - "Resume restores motion from the same Y position — no snap, no drift
 *      accumulation while paused"
 *
 * No phaser import per the project's test-layer rule. The logic under test
 * is the small kinematics helper that both Alien.advance and the pause-aware
 * simulation use.
 */
describe('waveKinematics', () => {
  describe('advanceY', () => {
    it('advances by speed*dt over one millisecond', () => {
      // 1000 px/s for 1 ms = 1 px
      expect(advanceY(0, 1, 1000)).toBe(1);
    });

    it('handles fractional ms and odd speeds', () => {
      // 250 px/s for 4 ms = 1 px
      expect(advanceY(100, 4, 250)).toBe(101);
    });

    it('returns the same Y for a zero-ms tick', () => {
      expect(advanceY(50, 0, 500)).toBe(50);
    });

    it('returns the same Y for a zero-speed alien', () => {
      expect(advanceY(50, 100, 0)).toBe(50);
    });

    it('handles negative dt as reverse motion (caller is responsible for guarding)', () => {
      // Documenting current behavior — callers are expected to pass dt >= 0.
      // If a Phaser frame ever delivers dt < 0 (clock skew on tab refocus),
      // this returns a smaller Y; WaveSystem's reached-hero check still
      // catches the bottom case correctly.
      expect(advanceY(50, -10, 100)).toBeCloseTo(49, 6);
    });
  });

  describe('simulatePauseAwareAdvance', () => {
    it('advances normally when no frames are paused', () => {
      // 100 px/s for 100 ms total = 10 px advance
      const result = simulatePauseAwareAdvance(0, 100, [
        { dtMs: 50, paused: false },
        { dtMs: 50, paused: false },
      ]);
      expect(result).toBeCloseTo(10, 6);
    });

    it('does NOT advance during paused frames', () => {
      // Same 100 ms total, but every frame is paused: Y stays at 0.
      const result = simulatePauseAwareAdvance(0, 100, [
        { dtMs: 50, paused: true },
        { dtMs: 50, paused: true },
      ]);
      expect(result).toBe(0);
    });

    it('preserves position across a pause-then-resume gap (no snap, no drift)', () => {
      // 50 ms of motion at 100 px/s → 5 px.
      // Then 1000 ms paused → no change.
      // Then 50 ms more motion → another 5 px.
      // Final Y = 10. The "1000 ms while paused" must not contribute a single
      // pixel of motion, AND the resume must continue from exactly where
      // pause left off.
      const result = simulatePauseAwareAdvance(0, 100, [
        { dtMs: 50, paused: false },
        { dtMs: 1000, paused: true },
        { dtMs: 50, paused: false },
      ]);
      expect(result).toBeCloseTo(10, 6);
    });

    it('produces identical results regardless of where pauses are inserted', () => {
      // Same total moving time (100 ms at 100 px/s = 10 px) split differently
      // around pauses. Final Y must be identical — the pause/resume cycle
      // doesn't accumulate, leak, or drift.
      const noPause = simulatePauseAwareAdvance(0, 100, [{ dtMs: 100, paused: false }]);

      const onePauseInMiddle = simulatePauseAwareAdvance(0, 100, [
        { dtMs: 50, paused: false },
        { dtMs: 5000, paused: true },
        { dtMs: 50, paused: false },
      ]);

      const manyShortPauses = simulatePauseAwareAdvance(0, 100, [
        { dtMs: 25, paused: false },
        { dtMs: 100, paused: true },
        { dtMs: 25, paused: false },
        { dtMs: 200, paused: true },
        { dtMs: 25, paused: false },
        { dtMs: 50, paused: true },
        { dtMs: 25, paused: false },
      ]);

      expect(onePauseInMiddle).toBeCloseTo(noPause, 6);
      expect(manyShortPauses).toBeCloseTo(noPause, 6);
    });

    it('returns initialY for an empty frames list', () => {
      expect(simulatePauseAwareAdvance(42, 100, [])).toBe(42);
    });
  });
});
