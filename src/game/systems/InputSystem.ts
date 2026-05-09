// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';

/**
 * Listens for fire input from any of the supported sources and emits a single
 * `'fire'` event when the cooldown allows. Three input pathways converge:
 *
 *   - Keyboard: Space
 *   - Mouse: pointerdown anywhere on the canvas
 *   - Touch: pointerdown anywhere on the canvas (the on-screen fire button
 *     in sprint 0.6 will pipe its own pointerdown into this same flow)
 *
 * Cooldown comes from `config.hero.fireCooldownMs`. While in cooldown, fire
 * input is silently dropped — no event emitted.
 *
 * Lifecycle: instantiate in GameScene.create, register a callback via
 * `onFire(...)`, and call `destroy()` on scene shutdown to remove handlers.
 */
export class InputSystem {
  private readonly callbacks: Array<() => void> = [];
  private lastFireTimeMs = -Infinity;
  private destroyed = false;
  private paused = false;
  private readonly handlePointerDown: () => void;
  private readonly handleSpaceDown: () => void;

  /**
   * While paused, fire input is silently dropped — Space and pointerdown
   * still trigger their handlers (we can't `off` them without losing the
   * binding for resume), but the cooldown gate logic refuses to emit. Used
   * by GameScene during the pause overlay.
   */
  setPaused(p: boolean): void {
    this.paused = p;
  }

  constructor(private readonly scene: Phaser.Scene) {
    this.handlePointerDown = this.tryFire.bind(this);
    this.handleSpaceDown = this.tryFire.bind(this);

    // Keyboard: Space. We don't need to call `addKey` — the
    // 'keydown-SPACE' event fires regardless, and storing a `Key` instance
    // we never read introduced a leak (the key was never `removeKey`'d in
    // `destroy`). Plain event subscription with a paired `off` is cleaner.
    if (scene.input.keyboard) {
      scene.input.keyboard.on('keydown-SPACE', this.handleSpaceDown);
    }

    // Pointer (mouse + touch). Fires anywhere on the canvas.
    scene.input.on('pointerdown', this.handlePointerDown);

    // Auto-clean on scene shutdown so we don't double-bind on a restart.
    scene.events.once('shutdown', () => this.destroy());
    scene.events.once('destroy', () => this.destroy());
  }

  /** Register a callback to fire each time the input system emits 'fire'. */
  onFire(callback: () => void): void {
    this.callbacks.push(callback);
  }

  /**
   * Programmatically attempt to fire (used by the on-screen TouchFireButton in
   * sprint 0.6 when its own pointerdown wants to skip the canvas-wide listener).
   */
  fire(): void {
    this.tryFire();
  }

  private tryFire(): void {
    if (this.destroyed) return;
    if (this.paused) return;
    const now = this.scene.time.now;
    if (now - this.lastFireTimeMs < config.hero.fireCooldownMs) return;
    this.lastFireTimeMs = now;
    for (const cb of this.callbacks) cb();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scene.input.off('pointerdown', this.handlePointerDown);
    if (this.scene.input.keyboard) {
      this.scene.input.keyboard.off('keydown-SPACE', this.handleSpaceDown);
    }
    this.callbacks.length = 0;
  }
}
