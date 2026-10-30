// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import { screenNamesShown } from '@/core/screenNames';

describe('screenNamesShown', () => {
  it('shows when running locally', () => {
    expect(screenNamesShown({ DEV: true })).toBe(true);
  });

  it('shows on a build with VITE_SHOW_SCREEN_NAMES=true (the dev site)', () => {
    expect(screenNamesShown({ DEV: false, VITE_SHOW_SCREEN_NAMES: 'true' })).toBe(true);
  });

  it('hides on a production build (no variable)', () => {
    expect(screenNamesShown({ DEV: false })).toBe(false);
  });

  it('hides for any other value', () => {
    expect(screenNamesShown({ DEV: false, VITE_SHOW_SCREEN_NAMES: '1' })).toBe(false);
    expect(screenNamesShown({ DEV: false, VITE_SHOW_SCREEN_NAMES: 'false' })).toBe(false);
  });
});
