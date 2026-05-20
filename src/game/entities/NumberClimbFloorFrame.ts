// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { ParticleSpriteKeys } from '@/core/spriteKeys';

/**
 * One floor's visual frame: a per-floor "room" image inside a black
 * picture-frame (vertical bars on the left + right, a horizontal bar
 * across the top that doubles as the ceiling of this floor / floor of
 * the floor above). The left + right bars leave a slim gap to the
 * playfield edge so `BackgroundScene`'s nebula bleeds through and the
 * climb reads as "inside a structure floating in space" rather than a
 * void.
 *
 * Sprint 2.2 story 13a established this pattern. Story 13b extends it
 * by varying the `bgKey` per floor for visual variety.
 *
 * Frames are created once per floor at `spawnFloor` time and PERSIST
 * for the rest of the round — the kid sees floors stacked below them
 * as they climb, not the floor they're currently on alone. Cleanup
 * happens at scene shutdown via `destroy()`.
 *
 * Z-order: frames live BELOW rungs and hero. The scene calls
 * `setDepth(...)` on the container so all frame children render
 * underneath gameplay sprites without per-child fiddling.
 */

/** Black side-bars on left + right (px). Tuned in the 16-24 range from story 13a's spec. */
const SIDE_BAR_WIDTH = 20;
/** Thickness (px) of the horizontal black separator between floors. */
const SEPARATOR_THICKNESS = 5;
const BLACK = 0x000000;

export interface NumberClimbFloorFrameOpts {
  scene: Phaser.Scene;
  /** Floor center x (typically `(leftBound + rightBound) / 2`). */
  centerX: number;
  /** Floor center y in world coords (same y the rungs spawn at). */
  centerY: number;
  /** Full playfield width — frame stretches across this. */
  playfieldWidth: number;
  /** Vertical span of one floor (typically `FLOOR_SPACING_PX`). */
  floorHeight: number;
  /** Background-image texture key (from `ClimbFloorBgKeys`). */
  bgKey: string;
  /**
   * True for the bottom-most floor only — adds a matching separator at
   * the BOTTOM of the frame so the climb visually "stands on" something
   * instead of fading off the canvas.
   */
  drawGroundBar: boolean;
  /**
   * Sprint 2.2 story 13e — escape-ship sprite key. When present, a
   * spaceship overlay is added inside the frame, parked at 1/3 from the
   * frame's bottom. The frame exposes `playEscapeAnimation()` which
   * detaches the ship from the container and tweens it off-screen with
   * a smoke trail (the "you escaped" win beat). Set ONLY for the top
   * floor's frame (Escape bg + 2× height).
   */
  escapeShipKey?: string;
}


export class NumberClimbFloorFrame extends Phaser.GameObjects.Container {
  /** Optional escape-ship overlay — set when `opts.escapeShipKey` provided. */
  private escapeShip: Phaser.GameObjects.Image | null = null;

  constructor(opts: NumberClimbFloorFrameOpts) {
    super(opts.scene, opts.centerX, opts.centerY);
    opts.scene.add.existing(this);

    const halfW = opts.playfieldWidth / 2;
    const halfH = opts.floorHeight / 2;
    // Inner area where the bg image draws (between the two side bars).
    const innerWidth = opts.playfieldWidth - 2 * SIDE_BAR_WIDTH;

    // === Bg image — the per-floor "room" ===
    // Scaled to fill the inner area. The source image is 8:1 (1280×160
    // after the sprite pipeline); we stretch to the floor band's
    // dimensions. Tiny aspect-ratio drift between source and floor band
    // is invisible at this size.
    const bg = opts.scene.add.image(0, 0, opts.bgKey);
    bg.setDisplaySize(innerWidth, opts.floorHeight);
    this.add(bg);

    // === Side bars — left + right vertical black strips ===
    const leftBar = opts.scene.add.rectangle(
      -halfW + SIDE_BAR_WIDTH / 2,
      0,
      SIDE_BAR_WIDTH,
      opts.floorHeight,
      BLACK,
    );
    const rightBar = opts.scene.add.rectangle(
      halfW - SIDE_BAR_WIDTH / 2,
      0,
      SIDE_BAR_WIDTH,
      opts.floorHeight,
      BLACK,
    );
    this.add(leftBar);
    this.add(rightBar);

    // === Top separator — horizontal bar at the ceiling of this floor ===
    const topSeparator = opts.scene.add.rectangle(
      0,
      -halfH,
      opts.playfieldWidth,
      SEPARATOR_THICKNESS,
      BLACK,
    );
    this.add(topSeparator);

    // === Ground bar — only on the bottom floor ===
    if (opts.drawGroundBar) {
      const groundBar = opts.scene.add.rectangle(
        0,
        halfH,
        opts.playfieldWidth,
        SEPARATOR_THICKNESS,
        BLACK,
      );
      this.add(groundBar);
    }

    // === Escape ship overlay (story 13e — top floor only) ===
    // Positioned 1/3 of the way up from the frame's bottom edge — in
    // local space that's y = halfH - floorHeight/3 = floorHeight/6.
    // Centered horizontally inside the inner area.
    if (opts.escapeShipKey !== undefined) {
      const shipY = opts.floorHeight / 6;
      this.escapeShip = opts.scene.add.image(0, shipY, opts.escapeShipKey);
      this.add(this.escapeShip);
    }
  }

  /**
   * Sprint 2.2 story 13e — the WIN beat. Detach the ship from this
   * container, re-add it to the scene's display list at the equivalent
   * world position, then tween it upward off-screen with a smoke trail.
   * No-op (immediate onComplete) if this frame doesn't have an escape
   * ship (e.g. called on a normal floor frame by mistake).
   *
   * Why detach the ship from the container before animating: the smoke
   * emitter follows the ship via per-frame x/y reads, which need WORLD
   * coords. If the ship stayed a child of the frame container, its
   * .x / .y would be local coords and the emitter would emit at the
   * wrong screen position. Re-parenting to the scene lets us read
   * absolute world position cleanly.
   */
  playEscapeAnimation(onComplete?: () => void): void {
    if (this.escapeShip === null) {
      onComplete?.();
      return;
    }
    const ship = this.escapeShip;
    const scene = this.scene;

    // Compute world position before detaching.
    const worldX = this.x + ship.x;
    const worldY = this.y + ship.y;
    this.remove(ship); // detach from container WITHOUT destroying
    scene.add.existing(ship);
    ship.setPosition(worldX, worldY);
    ship.setDepth(this.depth + 1);

    // Smoke emitter — emits downward (angle 60-120 in Phaser's
    // convention where 0=right, 90=down) so the engine plume trails
    // BENEATH the rising ship.
    const emitter = scene.add.particles(worldX, worldY, ParticleSpriteKeys.Smoke05, {
      lifespan: 800,
      speed: { min: 40, max: 120 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 0.8, end: 0 },
      angle: { min: 60, max: 120 },
      frequency: 25,
      quantity: 2,
    });
    emitter.setDepth(this.depth + 1);

    // Tween ship upward — off the top of the canvas. ~1.5s with Quad.In
    // gives that "engines spool up then it launches" pacing. onUpdate
    // keeps the emitter glued to the ship's moving position.
    const targetY = worldY - 900;
    scene.tweens.add({
      targets: ship,
      y: targetY,
      duration: 1500,
      ease: 'Quad.In',
      onUpdate: () => {
        emitter.x = ship.x;
        emitter.y = ship.y;
      },
      onComplete: () => {
        // Let trailing particles fade out, then clean up.
        scene.time.delayedCall(900, () => {
          emitter.destroy();
          ship.destroy();
        });
        onComplete?.();
      },
    });

    this.escapeShip = null;
  }

  /** True if this frame has an escape-ship overlay attached. */
  hasEscapeShip(): boolean {
    return this.escapeShip !== null;
  }
}
