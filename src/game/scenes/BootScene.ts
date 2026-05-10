// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { SceneKeys } from '@/core/sceneKeys';
import {
  SfxKeys,
  MidgroundKeys,
  MusicKeys,
  midgroundPath,
  musicPath,
  sfxPath,
} from '@/core/audioKeys';

/**
 * BootScene — entry point. Briefly displays the project name, launches the
 * persistent AttributionScene (AGPL §7(b) requirement), then hands off to
 * MenuScene.
 *
 * In a later art-polish revision this scene will gain preload duties and a
 * loading bar; for now it just renders the project name to verify the toolchain
 * and orchestrates the initial scene transitions.
 */
export class BootScene extends Phaser.Scene {
  static readonly key = SceneKeys.Boot;

  constructor() {
    super(BootScene.key);
  }

  /**
   * Preload SFX assets. Phaser caches them as decoded PCM AudioBuffers, so
   * later `scene.sound.play(key)` calls have zero decode cost — perfect for
   * arcade-style fire-on-keypress where any latency is felt.
   *
   * NOTE: BootScene only LOADS the assets here. The AudioManager's `init()`
   * call (which binds to a scene's sound manager) MUST happen later, in
   * MenuScene's first user-gesture handler — not here. iOS Safari blocks
   * WebAudioContext creation outside a user gesture, and an init from
   * BootScene silently fails on iOS even though Chrome/Firefox tolerate it.
   */
  preload(): void {
    // Single source-of-truth list of every audio asset the game needs at
    // boot. Each entry is `[key, urlPath]`. The load loop AND the completion
    // log both derive from this list, so adding a new asset is a single-line
    // change with no chance of the count drifting from the queue.
    const audioToLoad: ReadonlyArray<readonly [string, string]> = [
      // SFX (one-shots)
      [SfxKeys.Fire1, sfxPath(SfxKeys.Fire1)],
      [SfxKeys.Fire2, sfxPath(SfxKeys.Fire2)],
      // Midground loops (atmospheric layers under SFX)
      [MidgroundKeys.Skittering1, midgroundPath(MidgroundKeys.Skittering1)],
      // Music loops (background atmosphere)
      [MusicKeys.Loop1, musicPath(MusicKeys.Loop1)],
    ];
    for (const [key, url] of audioToLoad) {
      this.load.audio(key, url);
    }
    this.load.on('complete', () => {
      _th.logToAi('BootScene PreloadedSfx', SeverityLevel.Information, {
        // Derived from the list above so the count never drifts.
        reason: String(audioToLoad.length),
      });
    });
  }

  create(): void {
    _th.logToAi('BootScene Started', SeverityLevel.Information);

    const { width, height } = this.scale;
    this.add
      .text(width / 2, height / 2, 'mathBasher', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '64px',
        color: '#eaeaf2',
      })
      .setOrigin(0.5);

    // Briefly show the title, launch the persistent attribution footer, and
    // transition to the Menu. 800ms is enough that a kid actually reads the
    // title rather than seeing it flicker; faster (e.g. 400ms) feels broken.
    // Real preload + loading bar lands in the art-polish milestone.
    this.time.delayedCall(800, () => {
      this.scene.launch(SceneKeys.Attribution);
      this.scene.start(SceneKeys.Menu);
    });

    _th.logToAi('BootScene Completed', SeverityLevel.Information);
  }
}
