// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Sprint 2.7 — split a math string into runs so a mixed number's whole part
 * can be drawn bigger than its fraction ("1 1/2" must never read as "11/2").
 * Pure: no Phaser. `MathText` (src/game/ui) does the drawing.
 *
 * A mixed number is digits, one space, then a fraction (`formatFraction`'s
 * "W N/D"). The space is dropped: the renderer draws its own gap after the
 * whole part. Digits that end a fraction ("1/2 3/4") are not a whole part.
 */
export interface MathTextSegment {
  readonly text: string;
  /** True for a mixed number's whole part (drawn bigger, a gap after it). */
  readonly whole: boolean;
}

const MIXED_WHOLE = /(?<![\d/])(\d+) (?=\d+\/\d+)/g;

export function splitMixedNumbers(value: string): MathTextSegment[] {
  const out: MathTextSegment[] = [];
  let last = 0;
  for (const m of value.matchAll(MIXED_WHOLE)) {
    if (m.index > last) out.push({ text: value.slice(last, m.index), whole: false });
    out.push({ text: m[1], whole: true });
    last = m.index + m[0].length;
  }
  if (last < value.length) out.push({ text: value.slice(last), whole: false });
  return out;
}
