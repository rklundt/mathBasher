// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { SceneKeys } from '@/core/sceneKeys';
import { AUDIO_MANIFEST } from '@/core/audioKeys';
import {
  ALIEN_SPRITE_KEYS,
  SPRITE_FPS,
  SPRITE_MANIFEST,
  alienAnimKey,
  alienSpritePath,
  pickSpriteTier,
  type SpriteTier,
} from '@/core/spriteKeys';
import { text } from '@/game/ui/typography';

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
  private spriteTier: SpriteTier = 128;

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
    // Loading bar (sprint 0.6.3) — prior to 0.6.3, BootScene preloaded
    // ~0.5 MB of audio in <100ms and an empty canvas was tolerable. With
    // the 45-spritesheet preload (10-20 MB depending on tier), a 1-3
    // second hang felt like the app froze. The bar fills the gap visually
    // and replaces the prior 250ms `delayedCall` mask in `create()`.
    this.buildLoadingBar();

    // AUDIO_MANIFEST in `src/core/audioKeys.ts` is the single source of
    // truth for every preloadable audio asset. Adding a new sound is a
    // 1-line edit there — this loop and the completion log both derive
    // from the manifest, so the count never drifts.
    for (const entry of AUDIO_MANIFEST) {
      this.load.audio(entry.key, entry.url);
    }

    // === Alien sprites (tiered, animated spritesheets) ===
    // Pick tier from viewport × DPR, then load every alien spritesheet
    // at that tier. Spritesheet frame width = tier (each WebP is a
    // horizontal row of frames, each tier×tier px square). Frame COUNT
    // per spritesheet varies per batch (see comment in create() below);
    // we don't pass it to load.spritesheet — Phaser derives count at
    // animation-build time from the loaded texture's actual width.
    this.spriteTier = pickSpriteTier(window.innerWidth, window.devicePixelRatio);
    for (const key of ALIEN_SPRITE_KEYS) {
      this.load.spritesheet(key, alienSpritePath(key, this.spriteTier), {
        frameWidth: this.spriteTier,
        frameHeight: this.spriteTier,
      });
    }

    // === Non-alien sprites (single-frame images OR spritesheets) ===
    // SPRITE_MANIFEST is derived from per-kind const objects in
    // `src/core/spriteKeys.ts` (Hero/Projectile/Ui/Particle/Bg).
    // Adding a new asset is a 1-line edit in spriteKeys.ts — this loop
    // automatically picks it up. Each entry's `url` is already kind-aware
    // (e.g. `/assets/sprites/hero/speeder-1.png`, no tier subfolder for
    // non-alien kinds per ADR-0010's "aliens-only tier strategy" decision).
    //
    // Branches on the optional `frameWidth` field: entries WITH it are
    // animated spritesheets (use `load.spritesheet`); entries WITHOUT it
    // are static single-frame images (use `load.image`). All current
    // Story 1 entries are static — none of them have `frameWidth` set —
    // so today this loop only ever takes the `load.image` path. The
    // future-proofing exists so adding the first animated non-alien
    // sprite is a data change in spriteKeys.ts (just set frameWidth on
    // that entry), not a code change here.
    for (const entry of SPRITE_MANIFEST) {
      if (entry.frameWidth !== undefined) {
        this.load.spritesheet(entry.key, entry.url, {
          frameWidth: entry.frameWidth,
          frameHeight: entry.frameHeight ?? entry.frameWidth,
        });
      } else {
        this.load.image(entry.key, entry.url);
      }
    }

    this.load.on('complete', () => {
      _th.logToAi('BootScene PreloadedSfx', SeverityLevel.Information, {
        reason: String(AUDIO_MANIFEST.length),
      });
      // Per-kind sprite count breakdown, packed as a space-delimited
      // `key=value` string in the `reason` field. Eyeballable in logs;
      // queryable in App Insights via `where reason contains 'hero='`.
      // Zero-count kinds (e.g. projectile, since Story 1 uses runtime
      // rendering for projectiles) are omitted naturally — the loop
      // below only sees kinds that have at least one manifest entry.
      const perKindCount: Record<string, number> = { alien: ALIEN_SPRITE_KEYS.length };
      for (const entry of SPRITE_MANIFEST) {
        perKindCount[entry.kind] = (perKindCount[entry.kind] ?? 0) + 1;
      }
      const perKindReason = Object.entries(perKindCount)
        .map(([k, v]) => `${k}=${v}`)
        .join(' ');
      _th.logToAi('BootScene PreloadedSprites', SeverityLevel.Information, {
        spriteTier: String(this.spriteTier),
        reason: perKindReason,
      });
    });
  }

  /**
   * Render a centered progress bar + "Loading…" label. Wires
   * `load.on('progress', ...)` so the bar fills as assets arrive. All
   * geometry is in design-canvas units (1280×720); FIT scaling handles
   * device-pixel translation per `boot.ts`'s scale config.
   *
   * Visual: dark slate background plate (matches `#0b1020` canvas bg
   * + the index.html splash palette so the splash → boot transition
   * reads as continuous), thin amber fill that grows left-to-right,
   * "Loading…" label above. No assets needed — pure shapes + text.
   */
  private buildLoadingBar(): void {
    const W = this.scale.gameSize.width;
    const H = this.scale.gameSize.height;
    const BAR_W = 400;
    const BAR_H = 24;
    const BAR_PAD = 2; // inner gap between background and fill
    const FILL_MAX = BAR_W - BAR_PAD * 2;

    // Label above the bar.
    text(this, W / 2, H / 2 - 32, 'Loading…', 'bodyLarge').setOrigin(0.5);

    // Bar background — slate plate with subtle outline.
    this.add
      .rectangle(W / 2, H / 2, BAR_W, BAR_H, 0x1e293b)
      .setStrokeStyle(2, 0x475569);

    // Bar fill — amber (matches the FIRE button + UI accent palette).
    // Origin (0, 0.5) so width can grow from the LEFT edge anchored at
    // (W/2 - FILL_MAX/2). Updated each `progress` event.
    const fill = this.add
      .rectangle(W / 2 - FILL_MAX / 2, H / 2, 0, BAR_H - BAR_PAD * 2, 0xfbbf24)
      .setOrigin(0, 0.5);

    this.load.on('progress', (value: number) => {
      fill.width = FILL_MAX * value;
    });
  }

  create(): void {
    _th.logToAi('BootScene Started', SeverityLevel.Information);

    // Create one looping animation per alien sprite. Phaser's anims manager
    // is global-to-the-game (not per-scene), so these are registered once
    // here and any scene can `sprite.play(alienAnimKey(key))` later.
    //
    // We use the spritesheet's ACTUAL frame count (Phaser's default when
    // `end` is omitted = "last frame in the spritesheet") rather than the
    // canonical FRAMES_PER_SPRITE constant. Variable frame counts across
    // batches are normal: ffmpeg's frame-rate filter can dedup repeated
    // source frames, so a "5.21s × 12 fps" source might produce 47-63
    // frames depending on encoding quirks. Hardcoding `end: 62` against
    // a 47-frame WebP made Phaser fall back to frame 0 for the missing
    // 15 frames, breaking the loop visibly. (Story 6 of sprint 0.6.3.)
    for (const key of ALIEN_SPRITE_KEYS) {
      const animKey = alienAnimKey(key);
      if (this.anims.exists(animKey)) continue; // idempotent on hot-reload
      this.anims.create({
        key: animKey,
        // Omit `end` → Phaser uses all frames present in the spritesheet.
        frames: this.anims.generateFrameNumbers(key, { start: 0 }),
        frameRate: SPRITE_FPS,
        repeat: -1,
      });
    }

    // Hand off to the menu. Two parallel scenes get launched alongside:
    //   - BackgroundScene first → renders BELOW everything else (nebula
    //     + parallax stars; sprint 0.7 Story 6). Scene-registration order
    //     in `boot.ts` puts Background early in the array so it draws
    //     under Menu/Game/etc.
    //   - AttributionScene last → renders ABOVE everything else (AGPL
    //     §7(b) footer). Registration order puts it last in the array.
    //
    // The 250ms `delayedCall` calm-the-flicker beat that lived here in
    // 0.5/0.6 was a workaround for "empty canvas flash" when preload was
    // trivial (~0.5 MB audio in <100ms). Sprint 0.6.3's 45-spritesheet
    // preload (10-20 MB) takes long enough that the loading bar in
    // `preload()` is the visible content; the delay is no longer needed
    // and removing it makes the boot feel snappier on fast loads.
    // (See `buildLoadingBar()` in `preload()` above.)
    this.scene.launch(SceneKeys.Background);
    this.scene.launch(SceneKeys.Attribution);
    this.scene.start(SceneKeys.Menu);

    _th.logToAi('BootScene Completed', SeverityLevel.Information);
  }
}
