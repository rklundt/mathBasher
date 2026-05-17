// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import {
  SLATE_BG,
  BORDER_GREY,
  FOCUS_BLUE,
  SELECTED_AMBER,
} from '@/game/ui/uiPalette';
import { getAudioManager } from '@/services/audioManagerFactory';
import { SfxKeys } from '@/core/audioKeys';
import { emitButtonClicked, type ButtonClickSource } from '@/game/ui/buttonTelemetry';
import type { Focusable } from '@/game/ui/KeyboardNavigator';

/**
 * iOS/Material-style toggle switch — pill-shaped track with a circular
 * thumb that snaps left (OFF) or right (ON). ON state shows the thumb
 * on the right with an amber track; OFF state shows it on the left
 * with a slate track.
 *
 * Implementation: ONE `Graphics` object draws both track and thumb
 * together. The whole widget repaints on every state change. This is
 * deliberately simpler than a separate Container-of-children approach
 * (which had a "first toggle works, second toggle stuck" bug in the
 * initial sprint 2.1 implementation — suspected Phaser quirk with
 * cross-Container tweens of reparented Arc geometry; the single-paint
 * approach sidesteps the issue entirely). A subtle scale-pulse on
 * activation (1.0 → 1.08 → 1.0 over 140ms) provides the
 * "something happened" feedback that the original tween was meant to.
 *
 * Implements `Focusable` so it slots directly into `KeyboardNavigator`
 * alongside `PlaceholderButton` instances — Tab to focus, Enter/Space
 * to toggle.
 */
export interface ToggleSwitchOpts {
  scene: Phaser.Scene;
  x: number;
  y: number;
  /** Initial state. Default false (OFF). */
  value?: boolean;
  /**
   * Called after the user toggles. Receives the NEW value (post-flip).
   * The switch updates its own visual state before invoking — caller
   * doesn't need to re-set anything on the switch.
   */
  onChange?: (newValue: boolean) => void;
  /**
   * Button-telemetry source label. Mirrors PlaceholderButton's source
   * field so a future query can answer "how many toggle-vs-button
   * activations happened" without source-of-truth ambiguity.
   */
  telemetrySource?: ButtonClickSource;
  /**
   * Button-telemetry label. Surfaced as the `label` property on the
   * `ButtonClicked` event. Defaults to "ToggleSwitch" — pass a more
   * specific value (e.g. "ImageAsteroids") so logs distinguish multiple
   * toggles on the same panel.
   */
  telemetryLabel?: string;
}

const TRACK_WIDTH = 80;
const TRACK_HEIGHT = 36;
const TRACK_RADIUS = TRACK_HEIGHT / 2; // pill = radius = half-height
const THUMB_INSET = 3;
const THUMB_RADIUS = (TRACK_HEIGHT - THUMB_INSET * 2) / 2;
/** Distance from track center to thumb center, in either direction. */
const THUMB_OFFSET = (TRACK_WIDTH - TRACK_HEIGHT) / 2;
const FOCUS_RING_INSET = 4;
const PULSE_SCALE = 1.08;
const PULSE_DURATION_MS = 140;

export class ToggleSwitch extends Phaser.GameObjects.Container implements Focusable {
  private value: boolean;
  private focused = false;
  private hovered = false;
  private readonly onChange?: (newValue: boolean) => void;
  private readonly telemetrySource: ButtonClickSource;
  private readonly telemetryLabel: string;

  /**
   * Single Graphics that paints BOTH track and thumb. One object, one
   * draw call per repaint, no child-reparenting quirks. Repainted on
   * every state/hover/focus change.
   */
  private readonly painter: Phaser.GameObjects.Graphics;

  constructor(opts: ToggleSwitchOpts) {
    super(opts.scene, opts.x, opts.y);
    opts.scene.add.existing(this);
    this.value = opts.value ?? false;
    this.onChange = opts.onChange;
    this.telemetrySource = opts.telemetrySource ?? 'pointer';
    this.telemetryLabel = opts.telemetryLabel ?? 'ToggleSwitch';

    this.painter = opts.scene.add.graphics();
    this.add(this.painter);
    this.paint();

    // Interactive hit area — slightly larger than the visual for
    // fat-finger tap forgiveness on touch devices.
    const hitWidth = TRACK_WIDTH + 16;
    const hitHeight = TRACK_HEIGHT + 16;
    this.setSize(hitWidth, hitHeight);
    this.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(-hitWidth / 2, -hitHeight / 2, hitWidth, hitHeight),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    });

    this.on(Phaser.Input.Events.POINTER_OVER, () => {
      this.hovered = true;
      this.paint();
    });
    this.on(Phaser.Input.Events.POINTER_OUT, () => {
      this.hovered = false;
      this.paint();
    });
    this.on(Phaser.Input.Events.POINTER_DOWN, () => this.activate());
  }

  /** Current toggle value. */
  getValue(): boolean {
    return this.value;
  }

  /**
   * Programmatically set the value (silent — does NOT fire `onChange`).
   * Use for external state sync; for user-initiated toggling, call
   * `activate()` which flips + fires onChange + telemetry + SFX.
   */
  setValue(value: boolean): void {
    if (this.value === value) return;
    this.value = value;
    this.paint();
  }

  // ----- Focusable ----------------------------------------------------------

  setFocused(value: boolean): void {
    this.focused = value;
    this.paint();
  }

  activate(): void {
    this.value = !this.value;
    this.paint();
    this.pulseScale();
    // Side effects mirror PlaceholderButton's click path so audio +
    // telemetry are uniform across activations.
    this.onChange?.(this.value);
    void getAudioManager().play(SfxKeys.ButtonClick1, 'sfx');
    emitButtonClicked(this.telemetryLabel, this.scene.scene.key, this.telemetrySource);
  }

  isDisabled(): boolean {
    return false; // No disabled state today; add when a use case appears.
  }

  // ----- Painting + animation -----------------------------------------------

  /**
   * Repaint the whole widget — focus ring (if focused), track pill,
   * and thumb circle. Single Graphics, drawn in one pass. Idempotent;
   * safe to call from any state-change path.
   */
  private paint(): void {
    const g = this.painter;
    g.clear();

    // Focus ring (drawn first so it sits visually behind the track).
    if (this.focused) {
      g.lineStyle(3, FOCUS_BLUE, 1);
      g.strokeRoundedRect(
        -TRACK_WIDTH / 2 - FOCUS_RING_INSET,
        -TRACK_HEIGHT / 2 - FOCUS_RING_INSET,
        TRACK_WIDTH + FOCUS_RING_INSET * 2,
        TRACK_HEIGHT + FOCUS_RING_INSET * 2,
        TRACK_RADIUS + FOCUS_RING_INSET,
      );
    }

    // Track — amber when ON, slate when OFF, brighter on hover.
    const baseColor = this.value ? SELECTED_AMBER : SLATE_BG;
    const trackColor = this.hovered ? this.brighten(baseColor) : baseColor;
    g.fillStyle(trackColor, 1);
    g.fillRoundedRect(
      -TRACK_WIDTH / 2,
      -TRACK_HEIGHT / 2,
      TRACK_WIDTH,
      TRACK_HEIGHT,
      TRACK_RADIUS,
    );
    g.lineStyle(2, BORDER_GREY, 0.8);
    g.strokeRoundedRect(
      -TRACK_WIDTH / 2,
      -TRACK_HEIGHT / 2,
      TRACK_WIDTH,
      TRACK_HEIGHT,
      TRACK_RADIUS,
    );

    // Thumb — white circle on the right (ON) or left (OFF).
    const thumbX = this.value ? THUMB_OFFSET : -THUMB_OFFSET;
    g.fillStyle(0xffffff, 1);
    g.fillCircle(thumbX, 0, THUMB_RADIUS);
    g.lineStyle(1.5, BORDER_GREY, 0.6);
    g.strokeCircle(thumbX, 0, THUMB_RADIUS);
  }

  /**
   * Brief scale pulse on toggle for "something happened" feedback. The
   * snap-to-position thumb has no inherent motion, so the pulse
   * supplies the missing tactile cue. 140ms total, peaks at 1.08×.
   */
  private pulseScale(): void {
    // Kill any in-flight pulse so rapid clicks don't compound scales.
    this.scene.tweens.killTweensOf(this);
    this.setScale(1);
    this.scene.tweens.add({
      targets: this,
      scale: { from: 1, to: PULSE_SCALE },
      duration: PULSE_DURATION_MS / 2,
      yoyo: true,
      ease: 'Quad.Out',
      onComplete: () => this.setScale(1),
    });
  }

  /** Brighten a hex color uniformly (used for hover state). */
  private brighten(hex: number): number {
    const r = Math.min(255, ((hex >> 16) & 0xff) + 24);
    const g = Math.min(255, ((hex >> 8) & 0xff) + 24);
    const b = Math.min(255, (hex & 0xff) + 24);
    return (r << 16) | (g << 8) | b;
  }
}
