// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';

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
}

export class NumberClimbFloorFrame extends Phaser.GameObjects.Container {
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
  }
}
