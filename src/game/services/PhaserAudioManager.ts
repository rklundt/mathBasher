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

  // PRIOR ATTEMPT NOTE: a one-shot Sound cache was tried in commit 0852b04
  // to avoid the create-on-every-fire / auto-destroy-on-complete churn in
  // Phaser's internal sounds[] array, hypothesizing that churn was causing
  // active loops to stutter on each fire. That hypothesis didn't pan out
  // (user playtest 2026-05-09: behavior changed pattern but didn't resolve).
  // Reverted to the canonical `scene.sound.play(key, config)` shortcut.
  // The actual root cause turned out to be the AudioManager binding to a
  // shut-down scene (MenuScene) instead of the currently-active scene
  // (GameScene); see GameScene.create()'s audio.init(this) call.

  constructor(storage?: MinimalStorage) {
    super(storage);
  }

  /**
   * Bind to a Phaser scene. MUST be called from inside a user-gesture
   * handler on iOS Safari (touch / click) — the WebAudioContext cannot be
   * created or resumed outside of one. Calling `init` from BootScene's
   * `create` works on Chrome/Firefox but silently fails on iOS.
   *
   * Idempotent: a second `init` call swaps the scene reference but doesn't
   * re-create the underlying sound manager (Phaser owns that lifetime).
   */
  override init(scene: unknown): void {
    // The base-class signature uses `unknown` so pure callers don't pull
    // Phaser types into their import graph. Cast at the boundary.
    this.scene = scene as Phaser.Scene;
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

    // TEMPORARY DIAGNOSTIC (sprint 0.5.3 audio bug investigation):
    // capture the state of the sound manager + audio context + every loop
    // BEFORE the play call. The user is reporting alternating audible/
    // silent fires + loop stutter that didn't yield to the cache theory or
    // the scene-rebind theory. Real data should narrow it down.
    this.logSoundState(`pre-play(${key})`);

    const result = this.scene!.sound.play(key, { volume });

    // Capture POST state too — comparing pre/post tells us whether the
    // play call mutated state in a way we can see.
    // eslint-disable-next-line no-console
    console.log(`[audio:diag] play(${key}) returned:`, result);
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
    // TEMPORARY DIAGNOSTIC
    this.logSoundState(`post-playLoop(${key},${kind})`);
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
   * Diagnostic — TEMPORARY for sprint 0.5.3 audio bug investigation.
   * Logs the state of every Sound currently in the manager plus the
   * AudioContext state. Called from `play` and `playLoop` to capture
   * what's actually happening when fire SFX is alternating audible/
   * silent. Remove once the bug is identified and fixed.
   */
  private logSoundState(label: string): void {
    if (!this.scene) return;
    const mgr = this.scene.sound as Phaser.Sound.BaseSoundManager & {
      sounds?: Phaser.Sound.BaseSound[];
      context?: AudioContext;
      locked?: boolean;
    };
    const ctxState = mgr.context?.state ?? '(no-ctx)';
    const ctxTime = mgr.context?.currentTime?.toFixed(3) ?? '(n/a)';
    const locked = mgr.locked ?? '(n/a)';
    const totalSounds = mgr.sounds?.length ?? 0;
    const trackedLoops = Array.from(this.loops.entries()).map(([k, r]) => ({
      key: k,
      kind: r.kind,
      isPlaying: (r.sound as Phaser.Sound.BaseSound).isPlaying,
      isPaused: (r.sound as Phaser.Sound.BaseSound).isPaused,
      pendingRemove: (r.sound as Phaser.Sound.BaseSound & { pendingRemove?: boolean })
        .pendingRemove,
    }));
    const allSounds = (mgr.sounds ?? []).map((s) => ({
      key: (s as Phaser.Sound.BaseSound & { key?: string }).key,
      isPlaying: s.isPlaying,
      isPaused: s.isPaused,
      pendingRemove: (s as Phaser.Sound.BaseSound & { pendingRemove?: boolean }).pendingRemove,
    }));
    // eslint-disable-next-line no-console
    console.log(`[audio:diag] ${label}`, {
      ctx: { state: ctxState, time: ctxTime, locked },
      total: totalSounds,
      trackedLoops,
      allSounds,
    });
  }

  /**
   * Apply the current effective volume for a kind to a single sound.
   * Used by both onMuteChanged and onVolumeChanged so the rule is in one
   * place: "volume = effectiveVolume01(kind)".
   */
  private applyVolume(sound: Phaser.Sound.BaseSound, kind: AudioKind): void {
    const v = this.effectiveVolume01(kind);
    // Phaser sound types vary (WebAudioSound, HTML5AudioSound, NoAudioSound)
    // — they all support setVolume but the BaseSound type doesn't declare
    // it. The cast is safe at runtime; if a future Phaser version drops
    // setVolume from the concrete classes this would surface as a runtime
    // error, but that's also the only realistic way it could go wrong.
    (sound as Phaser.Sound.BaseSound & { setVolume(v: number): void }).setVolume(v);
  }
}
