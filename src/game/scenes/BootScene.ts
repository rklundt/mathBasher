// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { SceneKeys } from '@/core/sceneKeys';
import { AUDIO_MANIFEST } from '@/core/audioKeys';
import {
  ALIEN_SPRITE_KEYS,
  FRAMES_PER_SPRITE,
  SPRITE_FPS,
  alienAnimKey,
  alienSpritePath,
  pickSpriteTier,
} from '@/core/spriteKeys';

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

  /**
   * The sprite tier picked at preload-time. Cached so the `complete` log
   * + the create-time animation builder both reference the same value
   * without re-deriving from the viewport (which can technically change
   * between preload and create on a slow boot).
   */
  private spriteTier: 128 | 192 = 128;

  constructor() {
    super(BootScene.key);
  }

  /**
   * Preload SFX + sprite assets. Phaser caches audio as decoded PCM
   * AudioBuffers and sprites as GPU textures, so later `scene.sound.play(key)`
   * and `scene.add.sprite(0, 0, key)` calls have zero decode/upload cost.
   *
   * NOTE: BootScene only LOADS the assets here. The AudioManager's `init()`
   * call (which binds to a scene's sound manager) MUST happen later, in
   * MenuScene's first user-gesture handler — not here. iOS Safari blocks
   * WebAudioContext creation outside a user gesture, and an init from
   * BootScene silently fails on iOS even though Chrome/Firefox tolerate it.
   *
   * Sprite tier (128 vs 192) is picked once from the live viewport per
   * ADR-0010. No mid-session re-tier — the loaded textures are baked into
   * the GPU atlas and a viewport resize doesn't trigger a reload.
   */
  preload(): void {
    // AUDIO_MANIFEST in `src/core/audioKeys.ts` is the single source of
    // truth for every preloadable audio asset. Adding a new sound is a
    // 1-line edit there — this loop and the completion log both derive
    // from the manifest, so the count never drifts.
    for (const entry of AUDIO_MANIFEST) {
      this.load.audio(entry.key, entry.url);
    }

    // Sprite preload — pick tier from viewport × DPR, then load every
    // alien spritesheet at that tier. Spritesheet frame width = tier
    // (each WebP is a horizontal row of FRAMES_PER_SPRITE square frames).
    this.spriteTier = pickSpriteTier(window.innerWidth, window.devicePixelRatio);
    for (const key of ALIEN_SPRITE_KEYS) {
      this.load.spritesheet(key, alienSpritePath(key, this.spriteTier), {
        frameWidth: this.spriteTier,
        frameHeight: this.spriteTier,
      });
    }

    this.load.on('complete', () => {
      _th.logToAi('BootScene PreloadedSfx', SeverityLevel.Information, {
        reason: String(AUDIO_MANIFEST.length),
      });
      _th.logToAi('BootScene PreloadedSprites', SeverityLevel.Information, {
        spriteTier: String(this.spriteTier),
        reason: String(ALIEN_SPRITE_KEYS.length),
      });
    });
  }

  create(): void {
    _th.logToAi('BootScene Started', SeverityLevel.Information);

    // Create one looping animation per alien sprite. Phaser's anims manager
    // is global-to-the-game (not per-scene), so these are registered once
    // here and any scene can `sprite.play(alienAnimKey(key))` later.
    for (const key of ALIEN_SPRITE_KEYS) {
      const animKey = alienAnimKey(key);
      if (this.anims.exists(animKey)) continue; // idempotent on hot-reload
      this.anims.create({
        key: animKey,
        frames: this.anims.generateFrameNumbers(key, {
          start: 0,
          end: FRAMES_PER_SPRITE - 1,
        }),
        frameRate: SPRITE_FPS,
        repeat: -1,
      });
    }

    // No title text rendered here anymore — the splash overlay (in
    // index.html, dismissed by main.ts after the first user gesture)
    // already showed the title before this scene even mounted. Repeating
    // the title here would feel like a stutter.
    //
    // The 250ms delay is a deliberate calm-the-flicker beat: the splash
    // dismiss → BootScene mount → MenuScene start chain happens in a
    // single rAF on a fast machine, which produces a visible flash of the
    // empty boot canvas before MenuScene paints. 250ms is just long enough
    // to feel like "the splash faded into the menu" rather than "things
    // popped." Tested values: 0ms / 100ms feel jumpy; 500ms feels sluggish;
    // 250ms is the sweet spot. When a real loading bar lands in the
    // art-polish milestone (asset count grows past trivial), this delay
    // becomes unnecessary — the bar itself fills the same role.
    //
    // The slate background fills the canvas during the brief wait — same
    // color as the splash + the rest of the HUD chrome, so the transition
    // from splash → boot → menu reads as continuous, not flickery.
    this.time.delayedCall(250, () => {
      this.scene.launch(SceneKeys.Attribution);
      this.scene.start(SceneKeys.Menu);
    });

    _th.logToAi('BootScene Completed', SeverityLevel.Information);
  }
}
