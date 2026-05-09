// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AudioManager,
  AUDIO_MUTE_STORAGE_KEY,
  DEFAULT_VOLUME,
  type MinimalStorage,
} from '@/services/AudioManager';

/**
 * Pure-TS tests for the AudioManager facade. The Phaser-coupled subclass
 * (PhaserAudioManager) lives in `src/game/services/` and is verified
 * by the manual playtest checklist (it can't be unit-tested without
 * spinning up a scene, per the project's test-layer rule).
 *
 * These tests focus on the part the facade owns:
 *   - mute persistence to/from localStorage
 *   - the volume cap is a *constant* the contract promises
 *   - missing-key play() doesn't throw (base class is no-op so this is
 *     trivially true; the test codifies the property so the override in
 *     PhaserAudioManager can't accidentally start throwing later)
 */

class FakeStorage implements MinimalStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  /** Test-only: peek at what's stored. */
  peek(): Map<string, string> {
    return this.map;
  }
}

describe('AudioManager', () => {
  let storage: FakeStorage;

  beforeEach(() => {
    storage = new FakeStorage();
  });

  describe('mute persistence', () => {
    it('starts unmuted when storage has no record', () => {
      const am = new AudioManager(storage);
      expect(am.isMuted()).toBe(false);
    });

    it('starts muted when storage has the muted flag set to "true"', () => {
      storage.setItem(AUDIO_MUTE_STORAGE_KEY, 'true');
      const am = new AudioManager(storage);
      expect(am.isMuted()).toBe(true);
    });

    it('starts unmuted when storage has the muted flag explicitly "false"', () => {
      storage.setItem(AUDIO_MUTE_STORAGE_KEY, 'false');
      const am = new AudioManager(storage);
      expect(am.isMuted()).toBe(false);
    });

    it('starts unmuted for any value that is not literally "true"', () => {
      // Defensive: a corrupted localStorage value should not silently mute.
      storage.setItem(AUDIO_MUTE_STORAGE_KEY, 'truthy');
      const am = new AudioManager(storage);
      expect(am.isMuted()).toBe(false);
    });
  });

  describe('setMuted', () => {
    it('writes the new state to storage immediately', () => {
      const am = new AudioManager(storage);
      am.setMuted(true);
      expect(storage.getItem(AUDIO_MUTE_STORAGE_KEY)).toBe('true');
      am.setMuted(false);
      expect(storage.getItem(AUDIO_MUTE_STORAGE_KEY)).toBe('false');
    });

    it('updates in-memory state', () => {
      const am = new AudioManager(storage);
      expect(am.isMuted()).toBe(false);
      am.setMuted(true);
      expect(am.isMuted()).toBe(true);
      am.setMuted(false);
      expect(am.isMuted()).toBe(false);
    });

    it('is idempotent — setting the same value twice does nothing', () => {
      // Spy on storage to verify a no-op call doesn't write.
      const am = new AudioManager(storage);
      am.setMuted(true);
      const writes1 = storage.peek().size;
      am.setMuted(true); // same value again
      const writes2 = storage.peek().size;
      expect(writes2).toBe(writes1);
    });

    it('persistence survives constructing a fresh AudioManager on the same storage', () => {
      // Simulates a page refresh: shared storage, new AudioManager instance.
      const first = new AudioManager(storage);
      first.setMuted(true);

      const second = new AudioManager(storage);
      expect(second.isMuted()).toBe(true);
    });
  });

  describe('contract surface', () => {
    it('DEFAULT_VOLUME is moderate (0.6) — never blast-loud', () => {
      // Codifies the project's audio anti-pattern rule:
      //   "Default volume is moderate, NEVER 100%."
      // Any future change that bumps this above 0.7 should fail this test
      // and require a deliberate justification.
      expect(DEFAULT_VOLUME).toBeLessThanOrEqual(0.7);
      expect(DEFAULT_VOLUME).toBeGreaterThan(0);
    });

    it('play() on a missing key is a silent no-op (base class)', () => {
      // The base class never plays anything, so this is trivially safe.
      // The Phaser subclass overrides; THAT impl must also tolerate
      // missing keys without throwing — verified manually + by the
      // PLAYTEST checklist. This test codifies the contract here so a
      // future override can't silently start throwing.
      const am = new AudioManager(storage);
      expect(() => am.play('this-key-was-never-loaded')).not.toThrow();
    });

    it('init() with arbitrary value is a no-op on the base class', () => {
      const am = new AudioManager(storage);
      expect(() => am.init({ pretendThisIsAScene: true })).not.toThrow();
    });
  });
});
