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

  it('add(-N) subtracts (no clamp by design)', () => {
    // No current code path adds negative scores, but the contract
    // is documented as "delta is added as-is". If a future feature
    // (e.g. penalty round) wants to subtract, the behavior is
    // explicit — clamping at zero would mask the intent silently.
    SessionTotalScore.add(300);
    SessionTotalScore.add(-50);
    expect(SessionTotalScore.get()).toBe(250);
  });

  // ----- Last-displayed tracker (HUD count-up animation) -----

  it('getLastDisplayed() starts at 0', () => {
    expect(SessionTotalScore.getLastDisplayed()).toBe(0);
  });

  it('markDisplayedAs(n) updates the last-displayed tracker', () => {
    SessionTotalScore.add(1000);
    expect(SessionTotalScore.getLastDisplayed()).toBe(0); // not auto-synced
    SessionTotalScore.markDisplayedAs(1000);
    expect(SessionTotalScore.getLastDisplayed()).toBe(1000);
  });

  it('add() does NOT auto-update last-displayed (caller must mark explicitly)', () => {
    // This is the load-bearing contract for HudScene's count-up
    // tween: add() updates `_total` immediately, but the HUD
    // animates from `_lastDisplayed` to `_total` and only marks
    // at the END of the tween. If add() auto-synced last-displayed,
    // the HUD would have nothing to animate FROM.
    SessionTotalScore.add(500);
    expect(SessionTotalScore.get()).toBe(500);
    expect(SessionTotalScore.getLastDisplayed()).toBe(0);
  });

  it('reset() clears both total and last-displayed', () => {
    SessionTotalScore.add(700);
    SessionTotalScore.markDisplayedAs(700);
    SessionTotalScore.reset();
    expect(SessionTotalScore.get()).toBe(0);
    expect(SessionTotalScore.getLastDisplayed()).toBe(0);
  });
});
