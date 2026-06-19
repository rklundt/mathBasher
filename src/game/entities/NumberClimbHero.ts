// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { config } from '@/core/config';
import { getAudioManager } from '@/services/audioManagerFactory';
import { SfxKeys, pickRandomHitWrongSfx } from '@/core/audioKeys';
import { Settings } from '@/services/Settings';
import { ClimbHeroSkinKeys } from '@/core/spriteKeys';

/**
 * Number Climb hero — the climber who jumps between rungs.
 *
 * Sprint 2.2 story 6 — initial implementation uses a PROCEDURAL
 * placeholder (rounded rectangle with optional eyes) so the gameplay
 * loop can land without art. Story 1 (asset delivery) swaps the
 * procedural rendering for a real Midjourney-generated climber
 * sprite — same approach the asteroid heroes used (sprint 2.1).
 *
 * Coordinate model: world-space. The scene's camera tweens to follow
 * the hero (option 2 from sprint-2.2's camera-feel decision — hero
 * visibly rises, camera trails). Hero never moves horizontally on
 * its own; only `jumpTo` moves it, with the destination x/y supplied
 * by the FloorSystem (story 7) so the rungs control where the hero
 * lands.
 *
 * Three tween methods drive the animation surface:
 *  - `jumpTo(targetX, targetY, onComplete)` — arc up to a rung the
 *    kid picked. Plays a brief jump SFX (reuses Fire1 as a click-y
 *    placeholder; could get a dedicated jump SFX later).
 *  - `fallBackToFloor(floorY, onComplete)` — wrong-rung mulligan.
 *    Hero falls back DOWN to the level's base. Plays `hit-wrong-3.mp3`
 *    per the sprint spec. ~400ms.
 *  - `fallOffScreen(onComplete)` — round-end fall. Hero accelerates
 *    off the bottom of the canvas. Plays a long fall SFX (reuses
 *    hit-wrong-3 again for now; could get a dedicated fall SFX).
 *
 * All three tweens use Phaser tween chains; onComplete fires after
 * the visible motion settles so the scene can sequence its own
 * follow-up logic (next-floor reveal, GameOver transition, etc.).
 */
// Sprint 2.2.1 story 5 — dimensions lifted to `config.numberClimb.hero`.
const HERO_WIDTH = config.numberClimb.hero.widthPx;
const HERO_HEIGHT = config.numberClimb.hero.heightPx;
/** Hero's body color — warm amber to read clearly against any backdrop. */
const HERO_FILL_COLOR = 0xfbbf24;
/** Hero's outline color — darker for definition. */
const HERO_OUTLINE_COLOR = 0x713f12;

export interface NumberClimbHeroOpts {
  scene: Phaser.Scene;
  /** Initial x in world coords (typically playfield center). */
  x: number;
  /** Initial y in world coords (typically near the bottom of the playfield). */
  y: number;
}

export class NumberClimbHero extends Phaser.GameObjects.Container {
  /** Rough collision/silhouette dimensions — exposed for FloorSystem layout math. */
  static readonly WIDTH = HERO_WIDTH;
  static readonly HEIGHT = HERO_HEIGHT;

  /**
   * The visible body. Sprint 2.4.2 hotfix — the Climb hero now has
   * TWO skin paths, chosen at construction time from `Settings.heroSkin`:
   *   - `'og-yellow'`: the original procedural amber-rectangle (with
   *     two eye dots). Pre-2.4.2 default behavior, preserved as an
   *     opt-in option.
   *   - `'space-robot'` (default for new + existing players): a
   *     `Phaser.GameObjects.Image` using the `ClimbHeroSkinKeys.SpaceRobot`
   *     texture, scaled to fit `HERO_WIDTH × HERO_HEIGHT`.
   *
   * Only ONE of the two body fields is non-null per instance. The
   * scene reads neither directly — both render inside this Container
   * and inherit its world-space transform (jumpTo / fallBackToFloor
   * tween the Container itself).
   *
   * Skin is captured at constructor time (per scene mount). A
   * mid-round skin change via Settings → Game → Hero doesn't
   * hot-swap; the new skin takes effect on the next round.
   */
  private readonly bodyGraphics: Phaser.GameObjects.Graphics | null;
  private readonly bodyImage: Phaser.GameObjects.Image | null;

  constructor(opts: NumberClimbHeroOpts) {
    super(opts.scene, opts.x, opts.y);
    opts.scene.add.existing(this);

    const skin = Settings.getHeroSkin();
    if (skin === 'space-robot' && opts.scene.textures.exists(ClimbHeroSkinKeys.SpaceRobot)) {
      // Sprite path. Image origin (0.5, 0.5) so the texture centers
      // on the Container's transform — matches the rectangle's
      // -W/2..+W/2 / -H/2..+H/2 layout above.
      this.bodyImage = opts.scene.add.image(0, 0, ClimbHeroSkinKeys.SpaceRobot).setOrigin(0.5);
      const tex = opts.scene.textures.get(ClimbHeroSkinKeys.SpaceRobot).getSourceImage();
      const maxDim = Math.max(tex.width, tex.height) || 1;
      // Scale to fit the larger of width/height into the hero's
      // collision box — preserves aspect, avoids stretching.
      const fitScale = Math.max(HERO_WIDTH, HERO_HEIGHT) / maxDim;
      this.bodyImage.setScale(fitScale);
      this.bodyGraphics = null;
      this.add(this.bodyImage);
    } else {
      // Procedural-rectangle path. Used when skin is explicitly
      // 'og-yellow' OR (defensively) when the space-robot texture
      // hasn't loaded yet — better to render the placeholder than
      // flash a missing-texture box.
      this.bodyGraphics = opts.scene.add.graphics();
      this.paintBody();
      this.bodyImage = null;
      this.add(this.bodyGraphics);
    }

    this.setSize(HERO_WIDTH, HERO_HEIGHT);
  }

  /**
   * Render the procedural "OG Yellow" body — rounded rectangle with
   * two small eye dots so it reads as a CHARACTER, not a generic box.
   * Sprint 2.4.2 hotfix renamed "placeholder" → the legitimate
   * "OG Yellow" alternative skin (the new default is the Space Robot
   * sprite path in the constructor above).
   */
  private paintBody(): void {
    if (!this.bodyGraphics) return;
    const g = this.bodyGraphics;
    g.clear();
    // Outline + fill.
    g.fillStyle(HERO_FILL_COLOR, 1);
    g.fillRoundedRect(-HERO_WIDTH / 2, -HERO_HEIGHT / 2, HERO_WIDTH, HERO_HEIGHT, 12);
    g.lineStyle(3, HERO_OUTLINE_COLOR, 1);
    g.strokeRoundedRect(-HERO_WIDTH / 2, -HERO_HEIGHT / 2, HERO_WIDTH, HERO_HEIGHT, 12);
    // Eyes — tiny black dots for character.
    g.fillStyle(0x1a1a2e, 1);
    g.fillCircle(-10, -8, 4);
    g.fillCircle(10, -8, 4);
  }

  /**
   * Jump up to a target (rung position). Tween is a slight arc:
   * hero rises straight up + slight overshoot, then settles on the
   * target. ~280ms. Plays a click-y jump SFX (placeholder — reuses
   * the button-click since it's the most "small action" sound today).
   * Caller's `onComplete` fires after the settle.
   *
   * If a previous tween is still running, this `killTweensOf(this)`
   * cuts it off cleanly so rapid taps don't compound.
   */
  jumpTo(targetX: number, targetY: number, onComplete: () => void, opts?: { skipClickSfx?: boolean }): void {
    this.scene.tweens.killTweensOf(this);
    if (opts?.skipClickSfx !== true) {
      void getAudioManager().play(SfxKeys.ButtonClick1, 'sfx');
    }
    // Brief two-stage tween: rise + settle, with a small horizontal
    // shift if the rung is off-center from the hero's current x.
    const apexY = Math.min(targetY, this.y) - 24; // arc peak above the lower of the two
    this.scene.tweens.chain({
      targets: this,
      tweens: [
        {
          x: (this.x + targetX) / 2,
          y: apexY,
          duration: 140,
          ease: 'Quad.Out',
        },
        {
          x: targetX,
          y: targetY,
          duration: 140,
          ease: 'Quad.In',
        },
      ],
      onComplete,
    });
  }

  /**
   * Wrong-rung mulligan. Hero tries to jump, doesn't catch the
   * (wrong) rung, falls back to the floor's base y. Plays a random
   * wrong-hit SFX from the 3-variant pool (picks `hit-wrong-N`; the
   * spec calls out hit-wrong-3 specifically as the climb's wrong-rung
   * sound but using the existing random picker keeps audio variety
   * across the wrong-shot family of events). ~400ms with a slight
   * dip below the floor before settling.
   */
  fallBackToFloor(floorY: number, onComplete: () => void): void {
    this.scene.tweens.killTweensOf(this);
    void getAudioManager().play(pickRandomHitWrongSfx(), 'sfx');
    _th.logToAi('NumberClimbHero.fallBackToFloor', SeverityLevel.Verbose, {
      reason: `y=${String(Math.round(this.y))} → ${String(Math.round(floorY))}`,
    });
    this.scene.tweens.chain({
      targets: this,
      tweens: [
        {
          y: floorY + 12, // dip slightly past the floor to feel like a hard landing
          duration: 240,
          ease: 'Quad.In',
        },
        {
          y: floorY,
          duration: 140,
          ease: 'Quad.Out',
        },
      ],
      onComplete,
    });
  }

  /**
   * Round-end fall. Hero accelerates off the bottom of the canvas.
   * No `killTweensOf` here — by the time this fires, the scene is
   * shutting down. Plays the same wrong-hit family SFX for audible
   * "you fell" feedback.
   *
   * Caller passes the canvas bottom + a beat-after onComplete (e.g.
   * 600ms+ so the kid sees the fall before the GameOver scene takes
   * the canvas). 800ms total fall duration with strong Quad.In
   * acceleration — feels like a fall, not a tween.
   */
  fallOffScreen(canvasBottomY: number, onComplete: () => void): void {
    this.scene.tweens.killTweensOf(this);
    void getAudioManager().play(pickRandomHitWrongSfx(), 'sfx');
    this.scene.tweens.add({
      targets: this,
      y: canvasBottomY + HERO_HEIGHT, // past the bottom edge
      angle: 720, // two spins for visible "I'm falling" motion
      duration: 800,
      ease: 'Quad.In',
      onComplete,
    });
  }

  /**
   * Snap the hero to a position without animation. Used by the
   * scene during setup (initial placement) and during scene-instance
   * reuse to reset position between rounds.
   */
  snapTo(x: number, y: number): void {
    this.scene.tweens.killTweensOf(this);
    this.x = x;
    this.y = y;
  }
}
