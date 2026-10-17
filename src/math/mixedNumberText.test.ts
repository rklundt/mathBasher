// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import { splitMixedNumbers } from '@/math/mixedNumberText';
import { formatFraction } from '@/math/fractionMath';

describe('splitMixedNumbers', () => {
  it('splits a mixed number into a whole part and its fraction (space dropped)', () => {
    expect(splitMixedNumbers('1 1/2')).toEqual([
      { text: '1', whole: true },
      { text: '1/2', whole: false },
    ]);
  });

  it('leaves whole numbers and plain fractions as one run', () => {
    expect(splitMixedNumbers('12')).toEqual([{ text: '12', whole: false }]);
    expect(splitMixedNumbers('3/4')).toEqual([{ text: '3/4', whole: false }]);
    expect(splitMixedNumbers('')).toEqual([]);
  });

  it('finds every mixed number in a question prompt', () => {
    expect(splitMixedNumbers('2 1/3 + 1 5/12 = ?')).toEqual([
      { text: '2', whole: true },
      { text: '1/3 + ', whole: false },
      { text: '1', whole: true },
      { text: '5/12 = ?', whole: false },
    ]);
  });

  it('does not treat the end of a fraction, or a lone number before an operator, as a whole part', () => {
    expect(splitMixedNumbers('1/2 3/4')).toEqual([{ text: '1/2 3/4', whole: false }]);
    expect(splitMixedNumbers('3 + 4 = ?')).toEqual([{ text: '3 + 4 = ?', whole: false }]);
    expect(splitMixedNumbers('3/4 + 1/4 = ?')).toEqual([{ text: '3/4 + 1/4 = ?', whole: false }]);
  });

  it("matches formatFraction's mixed-number format", () => {
    const s = formatFraction(7, 4);
    expect(splitMixedNumbers(s).map((p) => p.whole)).toEqual([true, false]);
  });
});
