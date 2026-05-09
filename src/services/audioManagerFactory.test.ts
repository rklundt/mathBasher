// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createAudioManager,
  getAudioManager,
  _resetAudioManagerForTests,
} from '@/services/audioManagerFactory';

/**
 * The factory promises one AudioManager instance per page lifetime. Mute
 * state and the bound scene reference both live on the manager, so a fresh
 * instance per round (or per scene) would lose mute mid-session.
 *
 * This test codifies the singleton contract. The same pattern is used by
 * `scoreStoreFactory` for the same reason.
 */

describe('audioManagerFactory', () => {
  beforeEach(() => {
    _resetAudioManagerForTests();
  });

  it('createAudioManager returns the same instance on repeated calls', () => {
    const a = createAudioManager();
    const b = createAudioManager();
    expect(a).toBe(b);
  });

  it('getAudioManager returns the same instance as createAudioManager', () => {
    const a = createAudioManager();
    const b = getAudioManager();
    expect(a).toBe(b);
  });

  it('after _resetAudioManagerForTests, a NEW instance is returned', () => {
    const first = createAudioManager();
    _resetAudioManagerForTests();
    const second = createAudioManager();
    expect(first).not.toBe(second);
  });
});
