// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';
import { textStyle } from '@/game/ui/typography';

/**
 * One rung at a floor — a horizontal platform carrying one of the
 * candidate answers to a math prompt. The kid taps the rung whose
 * answer matches the math.
 *
 * Sprint 2.2 story 7 — initial implementation is procedural Graphics
 * (rectangle + text overlay). Story 1 (asset delivery) swaps the
 * procedural body for a real sprite when art lands.
 *
 * Visual: rounded rectangle ~180×56 with a thick outline + the
 * answer number rendered in `alienAnswer` TextKind (same scale as
 * the other modes' answer labels for typographic consistency).
 * Small "N." index prefix at the top-left mirrors the keyboard
 * shortcut (sprint 2.2 input model — number keys 1-N pick rungs
 * left-to-right).
 */
// Sprint 2.2.1 story 5 — dimensions lifted to `config.numberClimb.rung`.
const RUNG_WIDTH = config.numberClimb.rung.widthPx;
const RUNG_HEIGHT = config.numberClimb.rung.heightPx;
const RUNG_FILL_COLOR = 0x1f2740;
const RUNG_OUTLINE_COLOR = 0x6b7280;
const RUNG_HOVER_FILL_COLOR = 0x2a3454;

export interface NumberClimbRungOpts {
  scene: Phaser.Scene;
  /** Rung's center x in world coords. */
  x: number;
  /** Rung's center y in world coords (kid jumps up to this y). */
  y: number;
  /** The candidate answer number rendered on the rung. */
  answer: number;
  /** 1-based index used for the keyboard-shortcut prefix and N-key dispatch. */
  index: number;
}

export class NumberClimbRung extends Phaser.GameObjects.Container {
  /** Public bounds — FloorSystem uses these for tap hit-detection. */
  static readonly WIDTH = RUNG_WIDTH;
  static readonly HEIGHT = RUNG_HEIGHT;

  /** The answer number this rung carries. FloorSystem reads to decide correct/wrong. */
  readonly answer: number;
  /** 1-based index (matches the visible "N." prefix + keyboard shortcut). */
  readonly index: number;

  private readonly bodyGraphics: Phaser.GameObjects.Graphics;
  /**
   * Invisible Rectangle child that owns the interactive surface. Setting
   * `setInteractive` on the Container itself produced dead-zone hit
   * detection (same bug `PlaceholderButton.ts` + `ToggleSwitch.ts`
   * document — Phaser's container input routing with custom hit areas
   * has flakiness where non-interactive Text children shadow portions
   * of the test). A leaf Rectangle with auto-derived hit bounds is
   * reliable. We forward POINTER_DOWN through to the container so the
   * InputSystem keeps listening on the rung as before.
   */
  private readonly hitTarget: Phaser.GameObjects.Rectangle;
  /** The big answer text overlay. Rendered above the body in the container child order. */
  private readonly answerText: Phaser.GameObjects.Text;
  /** Tracks hover state so paint() chooses the right fill color. */
  private hovered = false;
  /** Tracks consumed state so visually-spent rungs render dimmer (post-pick). */
  private consumed = false;

  constructor(opts: NumberClimbRungOpts) {
    super(opts.scene, opts.x, opts.y);
    opts.scene.add.existing(this);
    this.answer = opts.answer;
    this.index = opts.index;

    this.bodyGraphics = opts.scene.add.graphics();
    this.add(this.bodyGraphics);
    this.paint();

    // Big answer number — same TextKind as the other modes' answer
    // labels so the visual rhythm matches Alien Shoot + Asteroid Field.
    this.answerText = opts.scene.add.text(0, 4, String(opts.answer), textStyle('alienAnswer'));
    this.answerText.setOrigin(0.5);
    this.add(this.answerText);

    // Small "N." prefix at the top-left as a keyboard-shortcut hint.
    // 18px, muted color — the answer number is the primary visual; the
    // index is just a small affordance for keyboard users.
    const prefix = opts.scene.add.text(-RUNG_WIDTH / 2 + 10, -RUNG_HEIGHT / 2 + 6, `${String(opts.index)}.`, {
      fontFamily: textStyle('body').fontFamily,
      fontSize: '16px',
      color: '#9ca3af',
    });
    prefix.setOrigin(0, 0);
    this.add(prefix);

    // Invisible hit-target on top of everything — this is the surface
    // that actually receives input. See class field doc above for why
    // a leaf Rectangle is used instead of `this.setInteractive(...)`.
    this.hitTarget = opts.scene.add.rectangle(0, 0, RUNG_WIDTH, RUNG_HEIGHT, 0xffffff, 0);
    this.add(this.hitTarget);
    this.hitTarget.setInteractive({ useHandCursor: true });
    this.hitTarget.on(Phaser.Input.Events.POINTER_OVER, () => {
      this.hovered = true;
      this.paint();
    });
    this.hitTarget.on(Phaser.Input.Events.POINTER_OUT, () => {
      this.hovered = false;
      this.paint();
    });
    this.hitTarget.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      // Re-emit on the container so InputSystem's `rung.on(POINTER_DOWN, ...)`
      // wiring continues to work without it caring about our internal
      // hit-target child.
      this.emit(Phaser.Input.Events.POINTER_DOWN, pointer);
    });
  }

  /**
   * Mark the rung as consumed (post-pick) — visually dimmer + no
   * longer interactive. Used by FloorSystem after a wrong-rung
   * mulligan to prevent the kid re-tapping the same wrong rung
   * (which would be wasted clicks without advancing state).
   */
  consume(): void {
    this.consumed = true;
    this.hovered = false;
    this.hitTarget.disableInteractive();
    this.paint();
    this.setAlpha(0.4);
  }

  /** Temporarily disable input (pause flow). */
  setInputEnabled(enabled: boolean): void {
    if (this.consumed) return; // consumed rungs stay disabled regardless
    if (enabled) this.hitTarget.setInteractive();
    else this.hitTarget.disableInteractive();
  }

  /** Redraw the body based on hover / consumed state. */
  private paint(): void {
    const g = this.bodyGraphics;
    g.clear();
    const fill = this.hovered && !this.consumed ? RUNG_HOVER_FILL_COLOR : RUNG_FILL_COLOR;
    g.fillStyle(fill, 1);
    g.fillRoundedRect(-RUNG_WIDTH / 2, -RUNG_HEIGHT / 2, RUNG_WIDTH, RUNG_HEIGHT, 10);
    g.lineStyle(2, RUNG_OUTLINE_COLOR, 1);
    g.strokeRoundedRect(-RUNG_WIDTH / 2, -RUNG_HEIGHT / 2, RUNG_WIDTH, RUNG_HEIGHT, 10);
  }
}
