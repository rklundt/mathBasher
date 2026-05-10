// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { SceneKeys } from '@/core/sceneKeys';
import { AUDIO_MANIFEST } from '@/core/audioKeys';

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
    // AUDIO_MANIFEST in `src/core/audioKeys.ts` is the single source of
    // truth for every preloadable audio asset. Adding a new sound is a
    // 1-line edit there — this loop and the completion log both derive
    // from the manifest, so the count never drifts.
    for (const entry of AUDIO_MANIFEST) {
      this.load.audio(entry.key, entry.url);
    }
    this.load.on('complete', () => {
      _th.logToAi('BootScene PreloadedSfx', SeverityLevel.Information, {
        reason: String(AUDIO_MANIFEST.length),
      });
    });
  }

  create(): void {
    _th.logToAi('BootScene Started', SeverityLevel.Information);

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
