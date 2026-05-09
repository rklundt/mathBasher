// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { AudioManager, DEFAULT_VOLUME, type MinimalStorage } from '@/services/AudioManager';

/**
 * Phaser-coupled AudioManager. Holds a reference to whichever scene most
 * recently called `init`, and uses that scene's sound manager to play
 * loaded sounds.
 *
 * Why scene-bound and not engine-bound: Phaser exposes audio playback via
 * `scene.sound`, which is itself a thin wrapper over a `WebAudioSoundManager`
 * shared across the whole game. Holding a scene reference (rather than the
 * sound manager directly) lets `init` be called from whichever scene first
 * handles a user gesture (MenuScene's Start button) — the scene reference
 * gets updated as scenes change but the underlying sound manager is the
 * same instance, so loaded assets persist.
 */
export class PhaserAudioManager extends AudioManager {
  private scene: Phaser.Scene | null = null;

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

  /**
   * Play a loaded sound. Volume is always capped to `DEFAULT_VOLUME` — the
   * caller cannot override this. Missing keys log a Warning and return
   * silently (the fire loop must NOT crash because of an asset miss).
   */
  override play(key: string): void {
    if (this.muted) return;
    if (!this.scene) {
      _th.logToAi('AudioManager.play.notInitialized', SeverityLevel.Warning, {
        reason: key,
      });
      return;
    }
    if (!this.scene.cache.audio.exists(key)) {
      _th.logToAi('AudioManager.play.keyMissing', SeverityLevel.Warning, {
        reason: key,
      });
      return;
    }
    this.scene.sound.play(key, { volume: DEFAULT_VOLUME });
  }
}
