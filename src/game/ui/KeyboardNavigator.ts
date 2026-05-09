// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';

/**
 * Structural contract for anything KeyboardNavigator can move focus through.
 *
 * `PlaceholderButton` (in menu scenes) and the HUD icon buttons (Pause,
 * Mute) all satisfy this. The interface is deliberately tiny so a custom
 * focusable can be added without subclassing or boilerplate — match these
 * three method shapes and you're in.
 *
 * - `setFocused(value)`: paint the focus ring (or hide it). Called as the
 *   navigator moves focus.
 * - `activate()`: invoke the click handler programmatically (Enter/Space).
 *   No-op when disabled.
 * - `isDisabled()`: skip-stop hint. Disabled focusables are never the
 *   focused index.
 */
export interface Focusable {
  setFocused(value: boolean): void;
  activate(): void;
  isDisabled(): boolean;
}

/**
 * Tiny keyboard-focus manager. Phaser is canvas-based and has no DOM focus
 * model, so we manage focus ourselves: each scene with focusables constructs
 * a `KeyboardNavigator`, hands it the focusables in tab order, and the
 * navigator wires Tab / Shift+Tab / Enter / Space to move focus and activate.
 *
 * Why this matters: a kid on a Chromebook trackpad+keyboard (or any
 * accessibility-tools user) needs a non-pointer way to navigate. Per WCAG
 * 2.1.1.
 *
 * Usage from a scene's `create()`:
 *
 *   const focusables = [startBtn, highScoresBtn];
 *   new KeyboardNavigator(this, focusables);
 *
 * Disabled focusables are skipped during navigation. The navigator updates
 * each one's `focused` state so the focusable can render a visible focus
 * ring distinct from any selected ring.
 */
export class KeyboardNavigator {
  private focusedIndex: number;
  private readonly shiftKey: Phaser.Input.Keyboard.Key;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly buttons: Focusable[],
  ) {
    if (!scene.input.keyboard) {
      // Some test environments lack the keyboard plugin; bail gracefully.
      this.focusedIndex = -1;
      this.shiftKey = {} as Phaser.Input.Keyboard.Key;
      return;
    }

    this.focusedIndex = this.firstFocusableIndex();
    // addKey() calls register the keys with Phaser so the 'keydown-X' events
    // fire below. Only `shift` needs a stored reference (we read isDown to
    // detect Shift+Tab); the others are pure event-driven.
    scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TAB);
    scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
    scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.shiftKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);

    // Phaser fires a global Tab handler that lets the browser default
    // focus-jump escape the canvas. We swallow it here.
    scene.input.keyboard.on('keydown-TAB', this.handleTab, this);
    scene.input.keyboard.on('keydown-ENTER', this.activateFocused, this);
    scene.input.keyboard.on('keydown-SPACE', this.activateFocused, this);

    // Initial paint of the focus state.
    this.applyFocusState();

    // Clean up listeners when the scene shuts down.
    scene.events.once('shutdown', () => this.destroy());
    scene.events.once('destroy', () => this.destroy());
  }

  private firstFocusableIndex(): number {
    return this.buttons.findIndex((b) => !b.isDisabled());
  }

  private handleTab(event: KeyboardEvent): void {
    event.preventDefault();
    if (this.buttons.length === 0) return;
    const direction = this.shiftKey.isDown ? -1 : 1;
    this.moveFocus(direction);
  }

  private moveFocus(direction: 1 | -1): void {
    if (this.focusedIndex < 0) {
      this.focusedIndex = this.firstFocusableIndex();
      this.applyFocusState();
      return;
    }
    // Walk past disabled buttons in the chosen direction; wrap around.
    for (let i = 0; i < this.buttons.length; i++) {
      this.focusedIndex =
        (this.focusedIndex + direction + this.buttons.length) % this.buttons.length;
      if (!this.buttons[this.focusedIndex]!.isDisabled()) break;
    }
    this.applyFocusState();
  }

  private activateFocused(): void {
    const btn = this.buttons[this.focusedIndex];
    if (!btn || btn.isDisabled()) return;
    btn.activate();
  }

  private applyFocusState(): void {
    this.buttons.forEach((btn, i) => btn.setFocused(i === this.focusedIndex));
  }

  destroy(): void {
    if (!this.scene.input.keyboard) return;
    this.scene.input.keyboard.off('keydown-TAB', this.handleTab, this);
    this.scene.input.keyboard.off('keydown-ENTER', this.activateFocused, this);
    this.scene.input.keyboard.off('keydown-SPACE', this.activateFocused, this);
  }
}
