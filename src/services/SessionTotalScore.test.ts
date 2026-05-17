// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { beforeEach, describe, expect, it } from 'vitest';
import { SessionTotalScore } from '@/services/SessionTotalScore';

/**
 * Tests for the session-total score accumulator. Tiny module so a tiny
 * test file — but the contract matters (HUD reads `get()` on every
 * questionEnded; game scenes call `add(score)` at round end).
 *
 * Module state is global; tests reset before each so they're
 * independent.
 */
describe('SessionTotalScore', () => {
  beforeEach(() => {
    SessionTotalScore.reset();
  });

  it('starts at 0', () => {
    expect(SessionTotalScore.get()).toBe(0);
  });

  it('add() accumulates across calls', () => {
    SessionTotalScore.add(100);
    expect(SessionTotalScore.get()).toBe(100);
    SessionTotalScore.add(250);
    expect(SessionTotalScore.get()).toBe(350);
    SessionTotalScore.add(50);
    expect(SessionTotalScore.get()).toBe(400);
  });

  it('add(0) is a no-op (safe to call with zero-score rounds)', () => {
    SessionTotalScore.add(100);
    SessionTotalScore.add(0);
    expect(SessionTotalScore.get()).toBe(100);
  });

  it('reset() returns to 0', () => {
    SessionTotalScore.add(500);
    expect(SessionTotalScore.get()).toBe(500);
    SessionTotalScore.reset();
    expect(SessionTotalScore.get()).toBe(0);
  });

  it('handles negative deltas (no clamp — caller responsibility)', () => {
    // No current code path adds negative scores, but the contract
    // is documented as "delta is added as-is". If a future feature
    // (e.g. penalty round) wants to subtract, it should work.
    SessionTotalScore.add(300);
    SessionTotalScore.add(-50);
    expect(SessionTotalScore.get()).toBe(250);
  });
});
