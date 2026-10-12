// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import { QuestionClock } from '@/game/systems/roundRules';

describe('QuestionClock', () => {
  it('expires exactly once per start, then stays quiet', () => {
    const c = new QuestionClock();
    c.start(1000);
    expect(c.tick(600)).toBe(false);
    expect(c.tick(600)).toBe(true);
    expect(c.remainingSec).toBe(0);
    // The extra frame after the last question's timeout: no second expiry.
    expect(c.tick(16)).toBe(false);
    expect(c.tick(5000)).toBe(false);
  });

  it('never expires after stop() (round over / question resolved)', () => {
    const c = new QuestionClock();
    c.start(100);
    c.stop();
    expect(c.tick(1000)).toBe(false);
  });

  it('restarts cleanly for the next question', () => {
    const c = new QuestionClock();
    c.start(50);
    expect(c.tick(50)).toBe(true);
    c.start(2000);
    expect(c.remainingSec).toBe(2);
    expect(c.tick(10)).toBe(false);
  });
});
