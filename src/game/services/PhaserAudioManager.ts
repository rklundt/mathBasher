// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import {
  AudioManager,
  type AudioKind,
  type LoopHandle,
  type MinimalStorage,
} from '@/services/AudioManager';

/**
 * Phaser-coupled AudioManager. Holds a reference to whichever scene most
 * recently called `init`, and uses that scene's sound manager to play
 * loaded sounds (one-shots) and tracked loops.
 *
 * Why scene-bound and not engine-bound: Phaser exposes audio playback via
 * `scene.sound`, which is itself a thin wrapper over a `WebAudioSoundManager`
 * shared across the whole game. Holding a scene reference (rather than the
 * sound manager directly) lets `init` be called from whichever scene first
 * handles a user gesture (MenuScene's Start button) — the scene reference
 * gets updated as scenes change but the underlying sound manager is the
 * same instance, so loaded assets persist.
 *
 * LOOP TRACKING. The base class promises one loop per asset key.
 * `loops` maps key → {kind, sound} so we can:
 *   - reject re-`playLoop` calls on a key already looping (return existing handle)
 *   - look up the sound to stop / pause / resume / live-volume-update
 *   - iterate by kind for per-kind volume updates
 */
interface LoopRecord {
  readonly kind: AudioKind;
  readonly sound: Phaser.Sound.BaseSound;
}

export class PhaserAudioManager extends AudioManager {
  private scene: Phaser.Scene | null = null;
  private readonly loops: Map<string, LoopRecord> = new Map();

  constructor(storage?: MinimalStorage) {
    super(storage);
  }

  /**
   * Bind to a Phaser scene. Every scene that plays audio (one-shots OR
   * loops, including PlaceholderButton click SFX) MUST call this at the
   * TOP of its `create()` method, before any button or other audio-emitting
   * object is constructed.
   *
   * Why every scene re-binds: PlaceholderButton's pointerdown handler plays
   * the click SFX BEFORE invoking the user's onClick. If the audio manager
   * is bound to a stopped scene (the previous scene that `scene.start()`-ed
   * away), `ensureReady()` finds a stale scene reference and the first
   * click in the new scene is silently dropped. Re-binding at the start of
   * each scene's create() keeps the reference fresh.
   *
   * iOS Safari note: the historical concern was that AudioContext creation
   * required a user gesture. Sprint 0.5.4's splash overlay solves that by
   * constructing `Phaser.Game` inside the splash button's click handler —
   * the AudioContext is created (and unlocked) within that gesture. After
   * that, `init` is just a scene-reference swap; no AudioContext mutation
   * happens here, so calling it from `create()` (not from a user gesture)
   * is safe on iOS.
   *
   * Idempotent: a second `init` call swaps the scene reference but doesn't
   * re-create the underlying sound manager (Phaser owns that lifetime).
   */
  override init(scene: Phaser.Scene): void {
    // Subclass narrows the parameter from `unknown` (on the pure facade)
    // to `Phaser.Scene` here. TypeScript permits this narrowing for
    // method shorthand syntax (parameter bivariance) and the runtime
    // contract is unchanged — every call site that reaches this method
    // is in a Phaser scene module, where `Phaser.Scene` is the natural
    // type. The pure base class still types `init(scene: unknown)` so
    // pure callers (none today) wouldn't drag Phaser into their import
    // graph.
    this.scene = scene;
  }

  // ----- One-shot playback -----------------------------------------------

  /**
   * Play a loaded sound. Volume is determined by the kind's slider value
   * combined with the master mute (see `effectiveVolume01`). Missing keys
   * log Warning and return silently.
   */
  override play(key: string, kind: AudioKind = 'sfx'): void {
    if (!this.ensureReady(key)) return;
    const volume = this.effectiveVolume01(kind);
    if (volume === 0) return; // silent — nothing to play
    this.scene!.sound.play(key, { volume });
  }

  // ----- Loop playback ---------------------------------------------------

  /**
   * Start a looping sound. One loop per key; calling again on an already-
   * looping key returns the existing handle (no-op).
   */
  override playLoop(key: string, kind: AudioKind): LoopHandle {
    // Already looping for this key — return existing handle, do nothing.
    if (this.loops.has(key)) return key;
    if (!this.ensureReady(key)) return key;
    const sound = this.scene!.sound.add(key, {
      loop: true,
      volume: this.effectiveVolume01(kind),
    });
    sound.play();
    this.loops.set(key, { kind, sound });
    return key;
  }

  /**
   * Stop a looping sound. Idempotent — stopping an unknown handle, or a
   * handle whose sound has already ended/been destroyed, is a safe no-op.
   * The Sound instance is destroyed (not cached) since Phaser keeps the
   * decoded buffer in `cache.audio`; a future `playLoop` re-creates a
   * fresh Sound from that cache.
   */
  override stopLoop(handle: LoopHandle): void {
    const record = this.loops.get(handle);
    if (!record) return;
    this.loops.delete(handle);
    try {
      record.sound.stop();
      record.sound.destroy();
    } catch {
      // Defensive: Phaser sometimes throws if the sound was already
      // destroyed externally. The map entry is gone either way; that's
      // what callers care about.
    }
  }

  /**
   * Pause every active loop. Used by GameScene.pause(). Idempotent.
   */
  override pauseAllLoops(): void {
    for (const { sound } of this.loops.values()) {
      if (sound.isPlaying) sound.pause();
    }
  }

  /**
   * Resume every paused loop. Used by GameScene.resume(). Idempotent.
   */
  override resumeAllLoops(): void {
    for (const { sound } of this.loops.values()) {
      if (sound.isPaused) sound.resume();
    }
  }

  // ----- Hooks: live volume + mute updates -------------------------------

  /**
   * When mute toggles, update every active loop's volume to its current
   * effective value. Mute drops them to 0 silently (loops keep PLAYING,
   * just at zero volume); unmute restores them to their kind's slider
   * value. This avoids a hard stop+restart on mute, which feels jarring.
   */
  protected override onMuteChanged(_muted: boolean): void {
    for (const { kind, sound } of this.loops.values()) {
      this.applyVolume(sound, kind);
    }
  }

  /**
   * When a per-kind slider moves, update every active loop OF THAT KIND
   * to the new effective volume. Sliders for other kinds don't affect
   * this kind's loops.
   */
  protected override onVolumeChanged(kind: AudioKind, _percent: number): void {
    for (const record of this.loops.values()) {
      if (record.kind === kind) {
        this.applyVolume(record.sound, kind);
      }
    }
  }

  // ----- Internal --------------------------------------------------------

  /**
   * Returns true if `play`/`playLoop` should proceed: scene bound, asset
   * key in cache. Logs the appropriate Warning otherwise.
   */
  private ensureReady(key: string): boolean {
    if (!this.scene) {
      _th.logToAi('AudioManager.play.notInitialized', SeverityLevel.Warning, {
        reason: key,
      });
      return false;
    }
    if (!this.scene.cache.audio.exists(key)) {
      _th.logToAi('AudioManager.play.keyMissing', SeverityLevel.Warning, {
        reason: key,
      });
      return false;
    }
    return true;
  }

  /**
   * Apply the current effective volume for a kind to a single sound.
   * Used by both onMuteChanged and onVolumeChanged so the rule is in one
   * place: "volume = effectiveVolume01(kind)".
   */
  private applyVolume(sound: Phaser.Sound.BaseSound, kind: AudioKind): void {
    setSoundVolume(sound, this.effectiveVolume01(kind));
  }
}

/**
 * Set a Phaser sound's volume — a thin shim around the cast that
 * `Phaser.Sound.BaseSound` makes necessary.
 *
 * Why a cast is required: Phaser's three concrete sound classes
 * (`WebAudioSound`, `HTML5AudioSound`, `NoAudioSound`) ALL implement
 * `setVolume(v: number)`, but the abstract `BaseSound` type doesn't
 * declare it. Phaser's typing surfaces only the lowest common denominator
 * to keep `BaseSound` truly abstract; consumers that hold a `BaseSound`
 * reference (like our loop tracker) have to assert the volume capability
 * themselves. The cast is safe at runtime — every concrete subclass has
 * the method — and is centralized here so there's one place to audit if
 * a future Phaser version changes the shape (none expected; setVolume has
 * been on BaseSound's concrete subclasses since Phaser 3.0).
 */
function setSoundVolume(sound: Phaser.Sound.BaseSound, v: number): void {
  (sound as Phaser.Sound.BaseSound & { setVolume(v: number): void }).setVolume(v);
}
