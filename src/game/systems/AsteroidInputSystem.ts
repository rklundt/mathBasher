// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';

/**
 * Input pipeline for the Asteroid Field game mode. Different shape from
 * Alien Shoot's `InputSystem` because the player needs both AIM (continuous
 * directional input) AND FIRE (discrete trigger), where Alien Shoot only
 * has fire (the hero's auto-traverse handles "aim").
 *
 * Three input pathways converge:
 *
 *   - **Mouse (desktop)**: pointer position drives `aimAngle` continuously
 *     toward wherever the cursor is. Click on the canvas = fire.
 *   - **Touch (mobile)**: drag-anywhere on the LEFT half of the screen
 *     rotates the hero (delta-x of drag → delta-aim, clamped to the
 *     per-second rotation speed cap). Tap on the RIGHT half (or
 *     TouchFireButton) = fire.
 *   - **Keyboard**: Left/Right arrows continuously rotate (held = keep
 *     turning at `maxRotationRadPerSec`). Space = fire.
 *
 * Aim state is exposed via `getAimAngle()` for the scene to feed into the
 * hero each frame. Fire is event-driven (`onFire` callback) with cooldown
 * gating (same `config.hero.fireCooldownMs` as Alien Shoot).
 *
 * Lifecycle: instantiate in AsteroidFieldScene.create, call `update(dt)`
 * each frame to advance the aim state from held keys/drag, and
 * `destroy()` on scene shutdown.
 */
export class AsteroidInputSystem {
  private aimAngle = 0;
  private readonly callbacks: Array<() => void> = [];
  private lastFireTimeMs = -Infinity;
  private destroyed = false;
  private paused = false;

  // Keyboard rotation state
  private rotatingLeft = false;
  private rotatingRight = false;

  // Touch-drag state
  private dragActive = false;
  private dragLastX = 0;

  // Cached scene + handler refs for `destroy()` cleanup
  private readonly handlePointerDown: (pointer: Phaser.Input.Pointer) => void;
  private readonly handlePointerUp: (pointer: Phaser.Input.Pointer) => void;
  private readonly handlePointerMove: (pointer: Phaser.Input.Pointer) => void;
  private readonly handleSpaceDown: () => void;
  private readonly handleLeftDown: () => void;
  private readonly handleLeftUp: () => void;
  private readonly handleRightDown: () => void;
  private readonly handleRightUp: () => void;

  /**
   * @param scene  Phaser scene whose input plugin we attach to
   * @param heroX  Hero's world-X (for converting absolute mouse positions
   *               to aim angles via atan2). Hero is static in Asteroid
   *               Field so this is a one-time setup constant.
   * @param heroY  Hero's world-Y (same)
   */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly heroX: number,
    private readonly heroY: number,
  ) {
    this.handlePointerDown = this.onPointerDown.bind(this);
    this.handlePointerUp = this.onPointerUp.bind(this);
    this.handlePointerMove = this.onPointerMove.bind(this);
    this.handleSpaceDown = this.tryFire.bind(this);
    this.handleLeftDown = () => {
      this.rotatingLeft = true;
    };
    this.handleLeftUp = () => {
      this.rotatingLeft = false;
    };
    this.handleRightDown = () => {
      this.rotatingRight = true;
    };
    this.handleRightUp = () => {
      this.rotatingRight = false;
    };

    // Pointer events (mouse + touch unified by Phaser).
    scene.input.on('pointerdown', this.handlePointerDown);
    scene.input.on('pointerup', this.handlePointerUp);
    scene.input.on('pointermove', this.handlePointerMove);

    // Keyboard: Space fires, Left/Right arrows rotate.
    if (scene.input.keyboard) {
      scene.input.keyboard.on('keydown-SPACE', this.handleSpaceDown);
      scene.input.keyboard.on('keydown-LEFT', this.handleLeftDown);
      scene.input.keyboard.on('keyup-LEFT', this.handleLeftUp);
      scene.input.keyboard.on('keydown-RIGHT', this.handleRightDown);
      scene.input.keyboard.on('keyup-RIGHT', this.handleRightUp);
    }

    scene.events.once('shutdown', () => this.destroy());
    scene.events.once('destroy', () => this.destroy());
  }

  /**
   * Per-frame aim update. Called from the scene's `update(time, dt)`.
   * Advances aim angle from held keyboard keys (continuous rotation
   * while held). Mouse aim updates instantly in `onPointerMove` and
   * touch-drag updates instantly in `onPointerMove` — neither needs
   * the per-frame tick.
   */
  update(dt: number): void {
    if (this.destroyed || this.paused) return;
    if (this.rotatingLeft || this.rotatingRight) {
      const radPerMs = config.asteroidField.heroRotationRadPerSec / 1000;
      const direction = (this.rotatingRight ? 1 : 0) - (this.rotatingLeft ? 1 : 0);
      this.aimAngle += direction * radPerMs * dt;
      this.wrapAimAngle();
    }
  }

  /** Current aim angle in radians (0 = right, π/2 = down, -π/2 = up). */
  getAimAngle(): number {
    return this.aimAngle;
  }

  /** Register a callback to invoke each time the input system emits 'fire'. */
  onFire(callback: () => void): void {
    this.callbacks.push(callback);
  }

  /**
   * Programmatically attempt to fire — used by the on-screen TouchFireButton
   * (same pattern as Alien Shoot's InputSystem.fire()).
   */
  fire(): void {
    this.tryFire();
  }

  /**
   * Pause aim + fire processing. Used while the pause overlay is up.
   * The drag/key handlers stay bound (so resume restores naturally) but
   * `update()` and `tryFire()` early-return while paused.
   */
  setPaused(p: boolean): void {
    this.paused = p;
    // Drop any in-flight drag so resuming doesn't replay a stale delta.
    this.dragActive = false;
    this.rotatingLeft = false;
    this.rotatingRight = false;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scene.input.off('pointerdown', this.handlePointerDown);
    this.scene.input.off('pointerup', this.handlePointerUp);
    this.scene.input.off('pointermove', this.handlePointerMove);
    if (this.scene.input.keyboard) {
      this.scene.input.keyboard.off('keydown-SPACE', this.handleSpaceDown);
      this.scene.input.keyboard.off('keydown-LEFT', this.handleLeftDown);
      this.scene.input.keyboard.off('keyup-LEFT', this.handleLeftUp);
      this.scene.input.keyboard.off('keydown-RIGHT', this.handleRightDown);
      this.scene.input.keyboard.off('keyup-RIGHT', this.handleRightUp);
    }
    this.callbacks.length = 0;
  }

  // ----- Internal: pointer dispatch + fire path ----------------------------

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.destroyed || this.paused) return;
    const isLeftHalf = pointer.x < this.scene.scale.width / 2;
    if (isLeftHalf && pointer.wasTouch) {
      // Touch drag start on left half = begin rotation drag.
      this.dragActive = true;
      this.dragLastX = pointer.x;
    } else {
      // Mouse click anywhere OR touch on right half = fire.
      // Mouse on the left half ALSO fires (mouse has no drag-joystick
      // metaphor — the cursor handles aim continuously).
      // For mouse on the left half, the aim has already been tracking via
      // pointermove; this click just triggers a shot.
      this.tryFire();
    }
  }

  private onPointerUp(_pointer: Phaser.Input.Pointer): void {
    this.dragActive = false;
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.destroyed || this.paused) return;
    if (!pointer.wasTouch) {
      // Mouse: continuous absolute aim toward cursor position. atan2 of
      // delta from hero center. (`wasTouch` is Phaser's reliable way to
      // distinguish mouse from touch input — DOM pointerType isn't on
      // the Phaser Pointer type directly.)
      const dx = pointer.x - this.heroX;
      const dy = pointer.y - this.heroY;
      this.aimAngle = Math.atan2(dy, dx);
      return;
    }
    // Touch: drag accumulates rotation only while a drag-on-left-half is active.
    if (this.dragActive) {
      const dx = pointer.x - this.dragLastX;
      this.dragLastX = pointer.x;
      // 1 px of horizontal drag = `dragRadPerPx` radians of rotation.
      // Tuned so a typical thumb-sweep (~200 px) covers most of a half-
      // rotation (~π radians). 200 / π ≈ 64; so 1/64 rad per px ≈ 0.0156.
      const dragRadPerPx = Math.PI / 200;
      this.aimAngle += dx * dragRadPerPx;
      this.wrapAimAngle();
    }
  }

  private tryFire(): void {
    if (this.destroyed) return;
    if (this.paused) return;
    const now = this.scene.time.now;
    if (now - this.lastFireTimeMs < config.hero.fireCooldownMs) return;
    this.lastFireTimeMs = now;
    for (const cb of this.callbacks) cb();
  }

  private wrapAimAngle(): void {
    while (this.aimAngle > Math.PI) this.aimAngle -= Math.PI * 2;
    while (this.aimAngle < -Math.PI) this.aimAngle += Math.PI * 2;
  }
}
