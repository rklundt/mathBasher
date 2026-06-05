// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { SceneKeys } from '@/core/sceneKeys';
import { Settings } from '@/services/Settings';
import { AUDIO_MANIFEST } from '@/core/audioKeys';
import {
  ALIEN_SPRITE_KEYS,
  ALIEN_SPRITE_SCOPE,
  SPRITE_MANIFEST,
  alienSpritePath,
  getCachedSpriteTier,
  type SpriteTier,
} from '@/core/spriteKeys';
import { createAlienAnims } from '@/game/services/alienAnims';
import { shouldLoadAtBoot } from '@/game/services/assetLoader';
import { isBootScope } from '@/core/assetScope';

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
    // Sprint 2.1.8 — the boot loading bar now lives in the DOM
    // splash overlay (see `index.html` + `boot.ts`). The Phaser-side
    // `attachLoadingOverlay` from sprint 2.1.6 was removed because
    // it couldn't render during the post-tap construction delay —
    // Phaser's canvas hadn't painted its first frame yet. The DOM
    // bar paints immediately on click. The progress + complete
    // hooks set up by `boot.ts` are wired up to Phaser's loader at
    // the BOTTOM of this preload() so they're queued AFTER all
    // load.image/audio/spritesheet calls below.

    // AUDIO_MANIFEST in `src/core/audioKeys.ts` is the single source of
    // truth for every preloadable audio asset. Sprint 2.1.6 — only
    // boot-scoped entries (eager/always) load here; per-game-scoped
    // entries defer to the game scene's own preload() via
    // `loadGameBundle`.
    for (const entry of AUDIO_MANIFEST) {
      if (!shouldLoadAtBoot(entry)) continue;
      this.load.audio(entry.key, entry.url);
    }

    // === Alien sprites (tiered, animated spritesheets) ===
    // Pick tier from viewport × DPR (memoized via `getCachedSpriteTier` —
    // same call from per-game preloads in stories 4 + 6 returns the
    // same value), then load every alien spritesheet at that tier IF
    // the whole pool is still boot-scoped. Sprint 2.1.6 story 7 will
    // flip `ALIEN_SPRITE_SCOPE` to `'game:alien-shoot'` so this block
    // becomes a no-op at boot.
    this.spriteTier = getCachedSpriteTier();
    if (isBootScope(ALIEN_SPRITE_SCOPE)) {
      for (const key of ALIEN_SPRITE_KEYS) {
        this.load.spritesheet(key, alienSpritePath(key, this.spriteTier), {
          frameWidth: this.spriteTier,
          frameHeight: this.spriteTier,
        });
      }
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
      if (!shouldLoadAtBoot(entry)) continue;
      if (entry.frameWidth !== undefined) {
        this.load.spritesheet(entry.key, entry.url, {
          frameWidth: entry.frameWidth,
          frameHeight: entry.frameHeight ?? entry.frameWidth,
        });
      } else {
        this.load.image(entry.key, entry.url);
      }
    }

    // Sprint 2.1.8 — boot loading bar now lives in the DOM splash
    // (see index.html + boot.ts), NOT in Phaser. The Phaser canvas
    // hasn't painted its first frame yet during the construction →
    // BootScene preload delay, so a Phaser-based bar wasn't visible
    // until it was almost done. The DOM bar renders the instant
    // "Tap to play" is clicked. We just drive its progress + dismiss
    // hooks here from Phaser's loader events. The `window` namespace
    // (`__mbBootHooks`) is private + cleaned up after `complete`.
    type BootHooks = { onProgress: (value: number) => void; onComplete: () => void };
    const hooks = (window as unknown as { __mbBootHooks?: BootHooks }).__mbBootHooks;
    if (hooks !== undefined) {
      this.load.on('progress', hooks.onProgress);
      // Use `on` not `once` for symmetry with the progress handler —
      // even though `complete` fires once, the splash's own
      // setTimeout handles the min-display-floor.
      this.load.once('complete', hooks.onComplete);
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

  // Sprint 2.1.6 — `buildLoadingBar()` extracted to
  // `src/game/ui/LoadingOverlay.ts` for the per-game `preload()` calls
  // (sprint 2.1.8 confirmed those still use the Phaser overlay since
  // the per-game preloads happen mid-session with Phaser already
  // painting). The BootScene-only path uses the DOM splash bar
  // instead (sprint 2.1.8) since the boot path runs while Phaser is
  // still constructing.

  create(): void {
    _th.logToAi('BootScene Started', SeverityLevel.Information);

    // Sprint 2.1.6 — alien-anim registration extracted to
    // `createAlienAnims` (`src/game/services/alienAnims.ts`) so
    // GameScene can call the same helper from its own create() once
    // story 7 moves alien spritesheets to game:alien-shoot scope.
    // The helper is doubly-idempotent: skips already-registered
    // anims AND skips keys whose texture hasn't loaded yet. While
    // alien sprites are still eager-loaded (pre-story-7), this call
    // does the work; after story 7, the textures aren't yet loaded
    // here so the helper short-circuits and GameScene's
    // post-preload call does the registration instead.
    createAlienAnims(this);

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

    // Sprint 2.5 story 4 — first-run hero pick gate. If the kid has
    // never picked one (Settings.getChosenHero() === null) we route
    // them to the HeroChooserScene; otherwise straight to Menu.
    // Persistence is localStorage-backed, so subsequent visits skip
    // this. ?autostart still flows through Menu (the dev shortcut is
    // exercised after the picker, not before — flagging here in case
    // future work needs to override).
    const nextScene = Settings.getChosenHero() === null ? SceneKeys.HeroChooser : SceneKeys.Menu;
    this.scene.start(nextScene);

    _th.logToAi('BootScene Completed', SeverityLevel.Information);
  }
}
