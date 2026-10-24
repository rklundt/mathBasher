// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import { SPEED_PHRASES, pickSpeedPhrase, speedMarks } from '@/game/ui/speedPhrases';

describe('speed phrases (sprint 2.11)', () => {
  it('has a pool of 50+ phrases, none repeated', () => {
    const all = [...SPEED_PHRASES[3], ...SPEED_PHRASES[2], ...SPEED_PHRASES[1]];
    expect(all.length).toBeGreaterThanOrEqual(50);
    expect(new Set(all).size).toBe(all.length);
  });

  it('keeps each phrase short enough for the popup', () => {
    for (const p of [...SPEED_PHRASES[3], ...SPEED_PHRASES[2], ...SPEED_PHRASES[1]]) {
      expect(p.length, p).toBeLessThanOrEqual(20);
    }
  });

  it('picks from the tier, never the same phrase twice in a row', () => {
    for (const tier of [1, 2, 3] as const) {
      let prev = pickSpeedPhrase(tier);
      for (let i = 0; i < 100; i++) {
        const next = pickSpeedPhrase(tier);
        expect(SPEED_PHRASES[tier]).toContain(next);
        expect(next).not.toBe(prev);
        prev = next;
      }
    }
  });

  it('shows one ⚡ per tier', () => {
    expect(speedMarks(3)).toBe('⚡⚡⚡');
    expect(speedMarks(1)).toBe('⚡');
    expect(speedMarks(0)).toBe('');
  });
});
