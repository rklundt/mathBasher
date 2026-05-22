// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { SceneKeys } from '@/core/sceneKeys';
import { GAME_BG_MAP, ParticleSpriteKeys } from '@/core/spriteKeys';
import { Settings } from '@/services/Settings';

/**
 * Persistent parallel scene that renders the gameplay backdrop — a static
 * dark nebula image with three layers of parallax stars scrolling downward
 * over it, plus a subtle bottom-darkening band that gives the hero ship
 * better contrast against the brighter parts of the nebula.
 *
 * Lifecycle: launched once from BootScene immediately after preload
 * finishes; runs for the lifetime of the page (never stopped). The scene
 * order in `src/app/boot.ts` places this scene EARLY in the registration
 * list so it renders BELOW Menu / Game / etc. AttributionScene is
 * registered LAST so its footer renders ON TOP of everything (including
 * this background).
 *
 * Performance: ~60 star sprites updated per frame on the main thread.
 * Each update is just `star.y += dy` + a wrap check — trivial cost,
 * fine on any target device.
 *
 * Sprint 0.7 Story 6.
 */

/** One parallax layer of stars. All stars in a layer share the same scroll speed. */
interface StarLayer {
  readonly stars: Phaser.GameObjects.Image[];
  readonly speedPxPerSec: number;
}

/**
 * Fraction of canvas height covered by the bottom-darkening fade band.
 * 0.4 = bottom 40% of the canvas darkens toward `#0b1020`. Gives the
 * hero ship (which lives in the bottom ~10% of the canvas) good contrast
 * against the bright center of the nebula above it.
 */
const FADE_BAND_RATIO = 0.4;

/**
 * Alpha at the BOTTOM of the fade band (most opaque). Top of band fades
 * to 0 (transparent). 0.7 gives strong-but-not-total darkening — nebula
 * still readable through it, hero pops above it.
 */
const FADE_BAND_BOTTOM_ALPHA = 0.7;

export class BackgroundScene extends Phaser.Scene {
  static readonly key = SceneKeys.Background;

  private starLayers: StarLayer[] = [];
  private cachedWidth = 0;
  private cachedHeight = 0;
  /**
   * The static backdrop image. Held as a field (rather than created
   * + forgotten) so `Settings.onGameIdChange` can swap its texture
   * when the player enters a different game mode. Sprint 2.1.1
   * established the per-game bg architecture; Alien Shoot uses
   * `Nebula`, Asteroid Field uses `AsteroidBelt`, future modes add
   * to `GAME_BG_MAP` in `spriteKeys.ts`.
   */
  private backdrop?: Phaser.GameObjects.Image;

  constructor() {
    super(BackgroundScene.key);
  }

  create(): void {
    _th.logToAi('BackgroundScene Started', SeverityLevel.Information);

    const W = this.scale.gameSize.width;
    const H = this.scale.gameSize.height;
    this.cachedWidth = W;
    this.cachedHeight = H;

    // === Layer 1: Static backdrop (per-game-mode) ===
    // Picked from `GAME_BG_MAP` based on the current `Settings.round.gameId`.
    // Sprint 2.1.1 — Alien Shoot keeps the original Midjourney nebula;
    // Asteroid Field gets a Midjourney asteroid-belt vista. Both
    // processed at 40% brightness via the sprite pipeline so they
    // don't compete with foreground sprites. Stretched to fill the
    // design canvas; minor distortion vs the 1280×717 source is
    // invisible.
    //
    // Subscribes to `Settings.onGameIdChange` so the backdrop swaps
    // live when the player picks a different game mode at
    // GameSelectScene (the change fires BEFORE the game scene mounts,
    // so the new backdrop is already showing by the time gameplay
    // starts). BackgroundScene runs for the lifetime of the page —
    // listener never needs to unsubscribe.
    const initialBgKey = GAME_BG_MAP[Settings.round.gameId];
    this.backdrop = this.add.image(W / 2, H / 2, initialBgKey);
    this.backdrop.setDisplaySize(W, H);
    Settings.onGameIdChange((newGameId) => {
      const newKey = GAME_BG_MAP[newGameId];
      this.backdrop?.setTexture(newKey);
      // setDisplaySize must be re-called after setTexture — Phaser
      // resets `displayWidth/Height` to the new texture's native size
      // on texture swap, undoing the original setDisplaySize call.
      this.backdrop?.setDisplaySize(this.cachedWidth, this.cachedHeight);
      this.applyStarVisibility();
    });

    // === Layer 2: Three parallax star layers (back → front) ===
    // Each layer has more stars in a lower count, brighter alpha, larger
    // size, and faster scroll speed than the layer behind it. This gives
    // the eye a sense of depth (background = small/dim/slow, foreground
    // = big/bright/fast).
    this.starLayers = [
      // Far: many small dim stars drifting slowly. Lays the visual base.
      this.createStarLayer(ParticleSpriteKeys.Star03, 35, 6, 0.45, 0.25, 0.55),
      // Mid: fewer medium stars at medium speed.
      this.createStarLayer(ParticleSpriteKeys.Star05, 20, 18, 0.6, 0.4, 0.75),
      // Near: a handful of bigger, brighter stars at higher speed.
      this.createStarLayer(ParticleSpriteKeys.Star07, 10, 36, 0.85, 0.5, 0.9),
    ];
    this.applyStarVisibility();

    // === Layer 3: Bottom darkening overlay (vertical alpha gradient) ===
    // Soft fade from transparent (top of band) to `#0b1020` at
    // FADE_BAND_BOTTOM_ALPHA (bottom of band). Built via Phaser's
    // Graphics.fillGradientStyle four-corner-alpha mode — WebGL only,
    // which our renderer is.
    //
    // Purpose: the user's nebula has a bright center-bottom glow that
    // would otherwise wash out the hero ship at the bottom of the canvas.
    // This band re-darkens that zone without losing the nebula entirely.
    const fadeStartY = Math.floor(H * (1 - FADE_BAND_RATIO));
    const fadeHeight = H - fadeStartY;
    const fade = this.add.graphics();
    fade.fillGradientStyle(
      0x0b1020,
      0x0b1020,
      0x0b1020,
      0x0b1020,
      0,
      0,
      FADE_BAND_BOTTOM_ALPHA,
      FADE_BAND_BOTTOM_ALPHA,
    );
    fade.fillRect(0, fadeStartY, W, fadeHeight);

    _th.logToAi('BackgroundScene Completed', SeverityLevel.Information);

    // Intentionally NO 'shutdown' handler that stops or pauses this scene.
    // It runs for the lifetime of the page so the backdrop stays visible
    // through every scene transition (Menu → Difficulty → Game → GameOver
    // and back). Cheap (~60 sprite-position updates per frame); no reason
    // to tear down and rebuild.
  }

  /**
   * Build a layer of `count` star sprites at random positions across the
   * canvas. Stars share a scroll speed and a size scale; each star gets
   * a randomized alpha within the [minAlpha, maxAlpha] range to add
   * variation (a layer of identical-alpha stars reads as a flat sheet).
   */
  private createStarLayer(
    textureKey: string,
    count: number,
    speedPxPerSec: number,
    scale: number,
    minAlpha: number,
    maxAlpha: number,
  ): StarLayer {
    const W = this.scale.gameSize.width;
    const H = this.scale.gameSize.height;
    const stars: Phaser.GameObjects.Image[] = [];
    for (let i = 0; i < count; i++) {
      const star = this.add.image(Math.random() * W, Math.random() * H, textureKey);
      star.setScale(scale);
      star.setAlpha(minAlpha + Math.random() * (maxAlpha - minAlpha));
      stars.push(star);
    }
    return { stars, speedPxPerSec };
  }

  /**
   * Per-frame star scroll. Move every star down by its layer's speed; when
   * a star drops below the bottom of the canvas, wrap it to the top at a
   * fresh random x. The fresh-x-on-wrap keeps the field from looking like
   * vertical columns of stars after a few seconds.
   */
  override update(_time: number, dt: number): void {
    const H = this.cachedHeight;
    const W = this.cachedWidth;
    for (const layer of this.starLayers) {
      const dy = (layer.speedPxPerSec / 1000) * dt;
      for (const star of layer.stars) {
        star.y += dy;
        if (star.y > H + star.displayHeight) {
          star.y = -star.displayHeight;
          star.x = Math.random() * W;
        }
      }
    }
  }

  /**
   * Sprint 2.2 story 13a — Number Climb plays inside framed floor "rooms",
   * not an outdoor space. The falling-star overlay implies an overhead
   * sky/space that isn't there during the climb, so we hide the stars
   * (nebula still shows through the framed-floor side-bars for visual
   * interest). Other game modes keep stars visible. Called from `create`
   * (initial state) and from the `onGameIdChange` listener (live swap).
   */
  private applyStarVisibility(): void {
    const visible = Settings.round.gameId !== 'number-climb';
    for (const layer of this.starLayers) {
      for (const star of layer.stars) {
        star.setVisible(visible);
      }
    }
  }
}
