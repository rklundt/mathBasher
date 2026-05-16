// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AudioManager,
  AUDIO_MUTE_STORAGE_KEY,
  AUDIO_KINDS,
  DEFAULT_VOLUMES,
  type AudioKind,
  type MinimalStorage,
} from '@/services/AudioManager';

/**
 * Pure-TS tests for the AudioManager facade. The Phaser-coupled subclass
 * (PhaserAudioManager) lives in `src/game/services/` and is verified
 * by the manual playtest checklist (it can't be unit-tested without
 * spinning up a scene, per the project's test-layer rule).
 *
 * These tests cover the part the facade owns:
 *   - mute persistence to/from localStorage
 *   - per-kind volume persistence + clamping + corrupted-storage fallback
 *   - master mute interaction (mute wins over slider values)
 *   - loop API contract (one loop per key, idempotent stop)
 *   - hooks (`onMuteChanged`, `onVolumeChanged`) fire on state change
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

const VOLUME_KEY = (kind: AudioKind): string => `mathbasher.audio.volume.${kind}`;

describe('AudioManager', () => {
  let storage: FakeStorage;

  beforeEach(() => {
    storage = new FakeStorage();
  });

  describe('mute is session-scoped (NOT persisted)', () => {
    /**
     * Per user direction: mute must NEVER survive a page reload. A previous
     * audio bug accidentally persisted muted=true and made the next session
     * mysteriously silent; the reaction was "do not mute by default. period."
     * These tests codify that policy so a future change can't quietly
     * re-introduce mute persistence without breaking them.
     */

    it('starts unmuted when storage has no record', () => {
      const am = new AudioManager(storage);
      expect(am.isMuted()).toBe(false);
    });

    it('STARTS UNMUTED EVEN IF STORAGE HAS A LEFTOVER "true" VALUE', () => {
      // The load-bearing test: a stale persisted mute from a prior session
      // (or a previous bug) does NOT carry over. Fresh page = unmuted.
      storage.setItem(AUDIO_MUTE_STORAGE_KEY, 'true');
      const am = new AudioManager(storage);
      expect(am.isMuted()).toBe(false);
    });

    it('clears the storage entry on construction so leftover values do not linger', () => {
      // One-time migration safety net: the constructor scrubs the key.
      // After AudioManager is constructed once, the storage key is empty.
      storage.setItem(AUDIO_MUTE_STORAGE_KEY, 'true');
      new AudioManager(storage);
      expect(storage.getItem(AUDIO_MUTE_STORAGE_KEY)).toBeNull();
    });
  });

  describe('setMuted (session-scoped behavior)', () => {
    it('updates in-memory state', () => {
      const am = new AudioManager(storage);
      expect(am.isMuted()).toBe(false);
      am.setMuted(true);
      expect(am.isMuted()).toBe(true);
      am.setMuted(false);
      expect(am.isMuted()).toBe(false);
    });

    it('does NOT write to storage', () => {
      // Mute is intentionally session-scoped — setMuted should leave the
      // storage backend untouched (other than the constructor's one-time
      // cleanup).
      const am = new AudioManager(storage);
      const baseline = storage.peek().size;
      am.setMuted(true);
      am.setMuted(false);
      am.setMuted(true);
      expect(storage.peek().size).toBe(baseline);
      expect(storage.getItem(AUDIO_MUTE_STORAGE_KEY)).toBeNull();
    });

    it('is idempotent — setting the same value twice does nothing', () => {
      const am = new AudioManager(storage);
      am.setMuted(true);
      const stateBeforeRedundantSet = am.isMuted();
      am.setMuted(true); // same value again
      expect(am.isMuted()).toBe(stateBeforeRedundantSet);
    });

    it('mute does NOT survive a fresh AudioManager on the same storage (refresh resets to unmuted)', () => {
      // Simulates a page refresh: shared storage, new AudioManager instance.
      // The "first" session set mute; the "second" session must start
      // unmuted regardless.
      const first = new AudioManager(storage);
      first.setMuted(true);

      const second = new AudioManager(storage);
      expect(second.isMuted()).toBe(false);
    });
  });

  describe('per-kind volume — defaults + persistence', () => {
    it('returns the kind defaults when storage is empty', () => {
      const am = new AudioManager(storage);
      expect(am.getVolume('sfx')).toBe(DEFAULT_VOLUMES.sfx);
      expect(am.getVolume('midground')).toBe(DEFAULT_VOLUMES.midground);
      expect(am.getVolume('music')).toBe(DEFAULT_VOLUMES.music);
    });

    it('persists setVolume to storage immediately', () => {
      const am = new AudioManager(storage);
      am.setVolume('sfx', 30);
      expect(storage.getItem(VOLUME_KEY('sfx'))).toBe('30');
      am.setVolume('music', 100);
      expect(storage.getItem(VOLUME_KEY('music'))).toBe('100');
    });

    it('persistence survives a fresh AudioManager on the same storage', () => {
      const first = new AudioManager(storage);
      first.setVolume('sfx', 25);
      first.setVolume('midground', 80);

      const second = new AudioManager(storage);
      expect(second.getVolume('sfx')).toBe(25);
      expect(second.getVolume('midground')).toBe(80);
      // Untouched kind reads its default.
      expect(second.getVolume('music')).toBe(DEFAULT_VOLUMES.music);
    });

    it('idempotent: setting the same value does not write again', () => {
      const am = new AudioManager(storage);
      am.setVolume('sfx', 50);
      const writes1 = storage.peek().size;
      am.setVolume('sfx', 50);
      const writes2 = storage.peek().size;
      expect(writes2).toBe(writes1);
    });
  });

  describe('per-kind volume — clamping + corrupted-storage defense', () => {
    it('clamps inputs above 100 to 100', () => {
      const am = new AudioManager(storage);
      am.setVolume('sfx', 150);
      expect(am.getVolume('sfx')).toBe(100);
    });

    it('clamps inputs below 0 to 0', () => {
      const am = new AudioManager(storage);
      am.setVolume('sfx', -25);
      expect(am.getVolume('sfx')).toBe(0);
    });

    it('truncates floats to integers', () => {
      const am = new AudioManager(storage);
      am.setVolume('sfx', 33.7);
      expect(am.getVolume('sfx')).toBe(33);
    });

    it('treats NaN inputs as 0 (defensive)', () => {
      const am = new AudioManager(storage);
      am.setVolume('sfx', Number.NaN);
      expect(am.getVolume('sfx')).toBe(0);
    });

    it('falls back to default when storage has a non-numeric value', () => {
      storage.setItem(VOLUME_KEY('sfx'), 'abc');
      const am = new AudioManager(storage);
      expect(am.getVolume('sfx')).toBe(DEFAULT_VOLUMES.sfx);
    });

    it('falls back to default when storage has an out-of-range value', () => {
      storage.setItem(VOLUME_KEY('sfx'), '999');
      const am = new AudioManager(storage);
      expect(am.getVolume('sfx')).toBe(DEFAULT_VOLUMES.sfx);
    });

    it('falls back to default when storage has a negative value', () => {
      storage.setItem(VOLUME_KEY('sfx'), '-5');
      const am = new AudioManager(storage);
      expect(am.getVolume('sfx')).toBe(DEFAULT_VOLUMES.sfx);
    });
  });

  describe('master mute interaction (mute wins over sliders)', () => {
    /**
     * The base class is a no-op for `play`, so we verify the contract via
     * the protected `effectiveVolume01` (exposed indirectly via a
     * subclass for testing). Mute returning 0 effective volume regardless
     * of slider position is the load-bearing rule.
     */
    class ProbedAudioManager extends AudioManager {
      probeEffectiveVolume(kind: AudioKind): number {
        return this.effectiveVolume01(kind);
      }
    }

    it('effective volume reflects the slider value when not muted', () => {
      const am = new ProbedAudioManager(storage);
      am.setVolume('sfx', 50);
      expect(am.probeEffectiveVolume('sfx')).toBeCloseTo(0.5, 3);
    });

    it('effective volume is 0 for every kind when muted, regardless of slider position', () => {
      const am = new ProbedAudioManager(storage);
      am.setVolume('sfx', 100);
      am.setVolume('midground', 90);
      am.setVolume('music', 80);
      am.setMuted(true);
      expect(am.probeEffectiveVolume('sfx')).toBe(0);
      expect(am.probeEffectiveVolume('midground')).toBe(0);
      expect(am.probeEffectiveVolume('music')).toBe(0);
    });

    it('sliders preserve their values across mute/unmute cycles', () => {
      const am = new ProbedAudioManager(storage);
      am.setVolume('sfx', 30);
      am.setVolume('music', 80);
      am.setMuted(true);
      // Sliders themselves DO NOT auto-zero on mute.
      expect(am.getVolume('sfx')).toBe(30);
      expect(am.getVolume('music')).toBe(80);
      am.setMuted(false);
      // Effective volume is restored to slider value.
      // Sprint 0.7.5 Story 6 — music gets a 0.5× attenuation on top of
      // the slider value, so slider 80 → effective 0.4 (was 0.8 pre-Story
      // 6). SFX is unchanged at 1.0× attenuation.
      expect(am.probeEffectiveVolume('sfx')).toBeCloseTo(0.3, 3);
      expect(am.probeEffectiveVolume('music')).toBeCloseTo(0.4, 3);
    });
  });

  describe('music attenuation (Sprint 0.7.5 Story 6)', () => {
    /**
     * Music is globally halved on top of the slider value to fix a
     * playtest balance problem (real music tracks landed louder than
     * the encoder's LUFS pass implied). Locking the rule in tests so a
     * future "let me simplify this" refactor doesn't silently restore
     * the prior scale.
     */
    class ProbedAudioManager extends AudioManager {
      probeEffectiveVolume(kind: AudioKind): number {
        return this.effectiveVolume01(kind);
      }
    }

    it('music slider 100 → effective 0.5 (halved)', () => {
      const am = new ProbedAudioManager(storage);
      am.setVolume('music', 100);
      expect(am.probeEffectiveVolume('music')).toBeCloseTo(0.5, 3);
    });

    it('music slider 10 → effective 0.05 (halved from the prior 0.10)', () => {
      const am = new ProbedAudioManager(storage);
      am.setVolume('music', 10);
      expect(am.probeEffectiveVolume('music')).toBeCloseTo(0.05, 3);
    });

    it('sfx slider 100 → effective 1.0 (unchanged — attenuation is music-only)', () => {
      const am = new ProbedAudioManager(storage);
      am.setVolume('sfx', 100);
      expect(am.probeEffectiveVolume('sfx')).toBeCloseTo(1.0, 3);
    });

    it('midground slider 100 → effective 1.0 (unchanged — attenuation is music-only)', () => {
      const am = new ProbedAudioManager(storage);
      am.setVolume('midground', 100);
      expect(am.probeEffectiveVolume('midground')).toBeCloseTo(1.0, 3);
    });

    it('the displayed/persisted slider value is NOT altered by the attenuation', () => {
      // The user sets slider to 80%; SettingsScene reads back 80%, NOT 40%.
      // Only the gain handed to Phaser is halved.
      const am = new ProbedAudioManager(storage);
      am.setVolume('music', 80);
      expect(am.getVolume('music')).toBe(80);
      expect(am.probeEffectiveVolume('music')).toBeCloseTo(0.4, 3);
    });
  });

  describe('subclass hooks', () => {
    /**
     * onMuteChanged and onVolumeChanged are protected hooks subclasses
     * override (PhaserAudioManager uses them to live-update active loops).
     * These tests verify the hook fires once per actual state change and
     * carries the expected arguments.
     */
    class HookSpyAudioManager extends AudioManager {
      muteCalls: boolean[] = [];
      volumeCalls: Array<[AudioKind, number]> = [];
      protected override onMuteChanged(muted: boolean): void {
        this.muteCalls.push(muted);
      }
      protected override onVolumeChanged(kind: AudioKind, percent: number): void {
        this.volumeCalls.push([kind, percent]);
      }
    }

    it('onMuteChanged fires on toggle, NOT on idempotent re-set', () => {
      const am = new HookSpyAudioManager(storage);
      am.setMuted(true);
      am.setMuted(true);
      am.setMuted(false);
      expect(am.muteCalls).toEqual([true, false]);
    });

    it('onVolumeChanged fires on change, NOT on idempotent re-set', () => {
      const am = new HookSpyAudioManager(storage);
      am.setVolume('sfx', 50);
      am.setVolume('sfx', 50);
      am.setVolume('music', 25);
      expect(am.volumeCalls).toEqual([
        ['sfx', 50],
        ['music', 25],
      ]);
    });

    it('onVolumeChanged carries the post-clamp value, not the raw input', () => {
      const am = new HookSpyAudioManager(storage);
      am.setVolume('sfx', 150); // clamps to 100
      expect(am.volumeCalls).toEqual([['sfx', 100]]);
    });
  });

  describe('loop API contract (base-class shape)', () => {
    /**
     * Base class is a no-op for the actual playback (no engine), but the
     * contract is meaningful even at the facade level: handle stability,
     * idempotent stop, no throws.
     */
    it('playLoop returns an opaque handle (the key in v1)', () => {
      const am = new AudioManager(storage);
      const h = am.playLoop('skittering-1', 'midground');
      expect(h).toBe('skittering-1');
    });

    it('playLoop on the same key returns a stable handle', () => {
      const am = new AudioManager(storage);
      const a = am.playLoop('skittering-1', 'midground');
      const b = am.playLoop('skittering-1', 'midground');
      expect(b).toBe(a);
    });

    it('stopLoop on an unknown handle does not throw', () => {
      const am = new AudioManager(storage);
      expect(() => am.stopLoop('this-handle-was-never-issued')).not.toThrow();
    });

    it('stopLoop is idempotent — second call after stop is also a no-op', () => {
      const am = new AudioManager(storage);
      const h = am.playLoop('skittering-1', 'midground');
      expect(() => {
        am.stopLoop(h);
        am.stopLoop(h);
      }).not.toThrow();
    });

    it('pauseAllLoops / resumeAllLoops do not throw on an empty manager', () => {
      const am = new AudioManager(storage);
      expect(() => am.pauseAllLoops()).not.toThrow();
      expect(() => am.resumeAllLoops()).not.toThrow();
    });
  });

  describe('AUDIO_KINDS + DEFAULT_VOLUMES contract', () => {
    it('AUDIO_KINDS lists all three kinds in slider order', () => {
      // Codifies the order SettingsScene uses to render its rows so a
      // future "voice" kind addition that changes order is a deliberate
      // choice that fails this test until updated.
      expect([...AUDIO_KINDS]).toEqual(['sfx', 'midground', 'music']);
    });

    it('DEFAULT_VOLUMES has an entry for every kind', () => {
      for (const kind of AUDIO_KINDS) {
        expect(DEFAULT_VOLUMES[kind]).toBeGreaterThanOrEqual(0);
        expect(DEFAULT_VOLUMES[kind]).toBeLessThanOrEqual(100);
      }
    });

    it('all default volumes are moderate (≤ 80) — never blast-loud', () => {
      // Codifies the project's audio anti-pattern rule: defaults stay
      // moderate so a kid putting on headphones isn't blasted at boot.
      for (const kind of AUDIO_KINDS) {
        expect(DEFAULT_VOLUMES[kind]).toBeLessThanOrEqual(80);
      }
    });
  });

  describe('contract surface (carryover from sprint 0.5.2)', () => {
    it('play() on a missing key is a silent no-op (base class)', () => {
      const am = new AudioManager(storage);
      expect(() => am.play('this-key-was-never-loaded')).not.toThrow();
      expect(() => am.play('also-missing', 'music')).not.toThrow();
    });

    it('init() with arbitrary value is a no-op on the base class', () => {
      const am = new AudioManager(storage);
      expect(() => am.init({ pretendThisIsAScene: true })).not.toThrow();
    });
  });
});
