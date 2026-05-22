// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import type { NumberClimbRung } from '@/game/entities/NumberClimbRung';
import type { NumberClimbFloorSystem } from '@/game/systems/NumberClimbFloorSystem';

/**
 * Number Climb input — tap-commit on a rung. No positioning,
 * no virtual joystick, no left/right movement. Same single-action
 * model the other modes use, picked to keep cognitive load on the
 * math instead of dexterity.
 *
 * Three input paths converge into a single `onPick(rung)` callback:
 *  - Mouse / touch: pointerdown on a specific rung (the rung
 *    GameObject is interactive; its POINTER_DOWN event fires).
 *  - Keyboard: number keys 1-N pick rungs left-to-right. Each rung
 *    knows its 1-based `index` and renders an "N." prefix matching
 *    the keyboard shortcut.
 *  - (Future) — drag-to-position pivot if playtest shows
 *    tap-commit doesn't work for the target age group.
 *
 * Touch-cooldown gate: post-pick, ignore further input for ~500ms
 * so a kid mashing taps doesn't accidentally double-pick (and
 * burn through the floor's one mulligan on a fat-finger sequence).
 * Scene calls `acceptInput()` after the floor advance / mulligan
 * fall-back animations settle to re-enable input.
 */
const POST_PICK_COOLDOWN_MS = 500;

export interface NumberClimbInputSystemOpts {
  scene: Phaser.Scene;
  floorSystem: NumberClimbFloorSystem;
}

export class NumberClimbInputSystem {
  private readonly scene: Phaser.Scene;
  private readonly floorSystem: NumberClimbFloorSystem;
  private onPickCallback: ((rung: NumberClimbRung) => void) | null = null;
  private accepting = true;
  private paused = false;
  /** Rungs whose pointer-handlers we've wired up. Cleared per-floor by `bindRungs`. */
  private boundRungs: NumberClimbRung[] = [];
  /**
   * Handle to the defensive auto-restore timer scheduled in `commitPick`.
   * Cancelled the moment the scene calls `acceptInput()` on its own — so
   * the Warning-level safety net only fires on a genuinely stuck state,
   * not on every normal pick.
   */
  private cooldownTimer: Phaser.Time.TimerEvent | null = null;

  constructor(opts: NumberClimbInputSystemOpts) {
    this.scene = opts.scene;
    this.floorSystem = opts.floorSystem;

    // Keyboard handler — number keys 1-9 (covers up to Hard's 4
    // rungs with room to spare). Number keys above the floor's
    // rung count are silently ignored.
    if (this.scene.input.keyboard !== null) {
      this.scene.input.keyboard.on('keydown', this.handleKeydown);
    }

    // Scene shutdown teardown — keyboard listener cleanup.
    this.scene.events.once('shutdown', () => this.destroy());
  }

  /** Register the scene's pick handler. Called once after construction. */
  onPick(callback: (rung: NumberClimbRung) => void): void {
    this.onPickCallback = callback;
  }

  /**
   * Bind pointer-down handlers to the current floor's rungs. Called
   * by the scene after `floorSystem.spawnFloor(...)` produces the
   * new floor's rungs.
   *
   * Floor 1 → 2 playtest bug (sprint 2.2): previously this method
   * called `prev.off(POINTER_DOWN)` to unbind handlers on the
   * previous floor's rungs. But by the time bindRungs runs for
   * floor 2, the floor 1 rungs are ALREADY DESTROYED by
   * `floorSystem.clearFloor()` — and Phaser's Container.destroy()
   * has ALREADY removed all listeners as part of its teardown.
   * Calling .off() on a destroyed GameObject can throw (Phaser's
   * EventEmitter internals expect the object's `_events` to exist),
   * aborting `bindRungs` mid-loop so the NEW rungs never get their
   * POINTER_DOWN handlers wired. Result: kid can't tap anything on
   * floor 2.
   *
   * Fix: just reset `boundRungs` to []. Destroyed rungs are already
   * cleaned up by Phaser; we don't need to touch them. Only the
   * NEW rungs need handlers wired.
   */
  bindRungs(rungs: NumberClimbRung[]): void {
    this.boundRungs = [];
    for (const rung of rungs) {
      const handler = (): void => {
        if (!this.acceptingInput()) return;
        this.commitPick(rung);
      };
      rung.on(Phaser.Input.Events.POINTER_DOWN, handler);
      this.boundRungs.push(rung);
    }
  }

  /**
   * Re-enable input after the scene's cooldown completes. Scene
   * calls this once per pick after the corresponding animation
   * settles (jump-up for correct, fall-back for mulligan).
   */
  acceptInput(): void {
    this.accepting = true;
    // The scene re-enabled input on its own — cancel the defensive
    // auto-restore timer so its Warning branch never fires on a
    // perfectly normal pick.
    this.cooldownTimer?.remove();
    this.cooldownTimer = null;
  }

  /** Pause / resume hooks — match the lifecycle's pause flow. */
  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  destroy(): void {
    if (this.scene.input.keyboard !== null) {
      this.scene.input.keyboard.off('keydown', this.handleKeydown);
    }
    for (const rung of this.boundRungs) {
      rung.off(Phaser.Input.Events.POINTER_DOWN);
    }
    this.boundRungs = [];
    this.cooldownTimer?.remove();
    this.cooldownTimer = null;
  }

  // ----- Internal ---------------------------------------------------------

  private acceptingInput(): boolean {
    return this.accepting && !this.paused;
  }

  /**
   * Dispatch a rung pick. Sets the cooldown gate (next input is
   * rejected until `acceptInput()` is called by the scene), then
   * fires the callback.
   */
  private commitPick(rung: NumberClimbRung): void {
    this.accepting = false;
    this.onPickCallback?.(rung);
    // Auto-restore in case the scene forgets to call acceptInput
    // (defensive — without this, a stuck callback path would leave
    // input permanently disabled). The timer is cancelled by
    // `acceptInput()` on every normal pick, so this branch only ever
    // FIRES when the scene genuinely failed to re-enable input on its
    // own — a real bug the safety net is papering over — hence the
    // Warning. Cancel any prior pending timer before scheduling a new
    // one so back-to-back picks don't stack stale timers.
    this.cooldownTimer?.remove();
    this.cooldownTimer = this.scene.time.delayedCall(POST_PICK_COOLDOWN_MS * 4, () => {
      this.cooldownTimer = null;
      if (!this.accepting) {
        this.accepting = true;
        _th.logToAi('NumberClimbInput.cooldownAutoRestore', SeverityLevel.Warning, {
          reason: 'scene did not call acceptInput() within the cooldown window',
        });
      }
    });
  }

  /**
   * Keyboard handler — arrow keys + 1-9. Number keys map to the
   * 1-based rung index (1 = leftmost, 4 = rightmost on Hard). Keys
   * past the floor's rung count are silently ignored.
   *
   * Arrow function for `this` binding (so removeListener works without
   * re-binding gymnastics).
   */
  private handleKeydown = (event: KeyboardEvent): void => {
    if (!this.acceptingInput()) return;
    const key = event.key;
    // Map '1' through '9' to rung indices 1-9.
    if (key.length === 1 && key >= '1' && key <= '9') {
      const index1Based = parseInt(key, 10);
      const rung = this.floorSystem.rungByIndex(index1Based);
      if (rung !== null) {
        this.commitPick(rung);
      }
    }
  };
}
