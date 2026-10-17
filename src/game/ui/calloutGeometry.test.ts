// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import { clampNoteX } from '@/game/ui/calloutGeometry';

describe('clampNoteX', () => {
  it('leaves a note in the middle where it is', () => {
    expect(clampNoteX(640, 1280, 150)).toBe(640);
  });

  it('pulls a note near the left edge in to the margin', () => {
    expect(clampNoteX(40, 1280, 150)).toBe(150);
  });

  it('pulls a note near the right edge in to the margin', () => {
    expect(clampNoteX(1260, 1280, 150)).toBe(1130);
  });

  it('keeps exactly-at-margin positions', () => {
    expect(clampNoteX(150, 1280, 150)).toBe(150);
    expect(clampNoteX(1130, 1280, 150)).toBe(1130);
  });
});
