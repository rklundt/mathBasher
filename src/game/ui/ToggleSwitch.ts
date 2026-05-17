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
 * iOS/Material-style toggle switch — pill-shaped track with a sliding
 * circular thumb. ON state shows the thumb pushed right with an amber
 * track; OFF state shows the thumb pushed left with a slate track.
 *
 * Boolean settings deserve a real toggle. PlaceholderButton's
 * selected-amber-border approach was a reasonable stretch (the kind of
 * "this thing is currently active" semantic already used elsewhere),
 * but for a single canonical on/off control a kid recognizes instantly,
 * the platform-standard switch is the clearer affordance.
 *
 * The label sits to the LEFT of the switch by convention (call site
 * positions it via a separate Text — this class only owns the switch
 * itself, so callers can A/B the label position or change the label
 * text per state without touching switch internals).
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
   * The switch already updates its own visual state before invoking;
   * caller doesn't need to re-set anything on the switch.
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
const THUMB_RADIUS = (TRACK_HEIGHT - 6) / 2; // 3px inset on each side
const THUMB_TRAVEL = TRACK_WIDTH - TRACK_HEIGHT; // distance thumb slides
const FOCUS_RING_INSET = 4; // focus-ring padding beyond the track
const TOGGLE_TWEEN_MS = 120;

export class ToggleSwitch extends Phaser.GameObjects.Container implements Focusable {
  private value: boolean;
  private focused = false;
  private hovered = false;
  private readonly onChange?: (newValue: boolean) => void;
  private readonly telemetrySource: ButtonClickSource;
  private readonly telemetryLabel: string;

  private readonly track: Phaser.GameObjects.Graphics;
  private readonly thumb: Phaser.GameObjects.Arc;
  private readonly focusRing: Phaser.GameObjects.Graphics;

  constructor(opts: ToggleSwitchOpts) {
    super(opts.scene, opts.x, opts.y);
    opts.scene.add.existing(this);
    this.value = opts.value ?? false;
    this.onChange = opts.onChange;
    this.telemetrySource = opts.telemetrySource ?? 'pointer';
    this.telemetryLabel = opts.telemetryLabel ?? 'ToggleSwitch';

    // Focus ring — drawn first so it sits BEHIND track + thumb. Hidden
    // by default; painted in `setFocused(true)`.
    this.focusRing = opts.scene.add.graphics();
    this.add(this.focusRing);

    // Track — pill shape via fillRoundedRect. Repainted on every
    // state/hover change so the color reflects current state.
    this.track = opts.scene.add.graphics();
    this.add(this.track);

    // Thumb — solid white circle. Position depends on value; animated
    // when value changes (tween over THUMB_TRAVEL).
    const thumbX = this.value ? THUMB_TRAVEL / 2 : -THUMB_TRAVEL / 2;
    this.thumb = opts.scene.add.circle(thumbX, 0, THUMB_RADIUS, 0xffffff);
    this.add(this.thumb);

    this.paintTrack();

    // Interactive hit area — full track + thumb bounding box for easy
    // kid touch targets. Slightly larger than the visual to give some
    // forgiveness on fat-finger taps.
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
      this.paintTrack();
    });
    this.on(Phaser.Input.Events.POINTER_OUT, () => {
      this.hovered = false;
      this.paintTrack();
    });
    this.on(Phaser.Input.Events.POINTER_DOWN, () => this.activate());
  }

  /** Current toggle value. */
  getValue(): boolean {
    return this.value;
  }

  /**
   * Programmatically set the toggle value (silent — does NOT fire
   * `onChange`). Use for syncing external state into the widget;
   * for user-initiated toggling, call `activate()`.
   */
  setValue(value: boolean, animate = true): void {
    if (this.value === value) return;
    this.value = value;
    const targetX = value ? THUMB_TRAVEL / 2 : -THUMB_TRAVEL / 2;
    if (animate) {
      this.scene.tweens.add({
        targets: this.thumb,
        x: targetX,
        duration: TOGGLE_TWEEN_MS,
        ease: 'Quad.Out',
      });
    } else {
      this.thumb.x = targetX;
    }
    this.paintTrack();
  }

  // ----- Focusable ----------------------------------------------------------

  setFocused(value: boolean): void {
    this.focused = value;
    this.paintFocusRing();
  }

  activate(): void {
    const next = !this.value;
    this.setValue(next);
    // Fire onChange + telemetry + click SFX. Mirrors PlaceholderButton's
    // click-path side effects so the audio/telemetry pattern is uniform
    // across activations.
    this.onChange?.(next);
    void getAudioManager().play(SfxKeys.ButtonClick1, 'sfx');
    emitButtonClicked(this.telemetryLabel, this.scene.scene.key, this.telemetrySource);
  }

  isDisabled(): boolean {
    return false; // No disabled state today; add when a use case appears.
  }

  // ----- Painting -----------------------------------------------------------

  /**
   * Paint the pill-shaped track. Color depends on state + hover:
   *  - ON  : amber fill, slightly darker than focus blue
   *  - OFF : slate fill (matches button bodies)
   *  - hover bumps the fill slightly brighter
   */
  private paintTrack(): void {
    this.track.clear();
    const baseColor = this.value ? SELECTED_AMBER : SLATE_BG;
    const fillColor = this.hovered ? this.brighten(baseColor) : baseColor;
    this.track.fillStyle(fillColor, 1);
    this.track.fillRoundedRect(
      -TRACK_WIDTH / 2,
      -TRACK_HEIGHT / 2,
      TRACK_WIDTH,
      TRACK_HEIGHT,
      TRACK_RADIUS,
    );
    // Subtle border so the off state has definition against the dark
    // backdrop (slate-on-slate would be invisible otherwise).
    this.track.lineStyle(2, BORDER_GREY, 0.8);
    this.track.strokeRoundedRect(
      -TRACK_WIDTH / 2,
      -TRACK_HEIGHT / 2,
      TRACK_WIDTH,
      TRACK_HEIGHT,
      TRACK_RADIUS,
    );
  }

  /** Paint the focus ring (visible only when focused). */
  private paintFocusRing(): void {
    this.focusRing.clear();
    if (!this.focused) return;
    this.focusRing.lineStyle(3, FOCUS_BLUE, 1);
    this.focusRing.strokeRoundedRect(
      -TRACK_WIDTH / 2 - FOCUS_RING_INSET,
      -TRACK_HEIGHT / 2 - FOCUS_RING_INSET,
      TRACK_WIDTH + FOCUS_RING_INSET * 2,
      TRACK_HEIGHT + FOCUS_RING_INSET * 2,
      TRACK_RADIUS + FOCUS_RING_INSET,
    );
  }

  /** Brighten a hex color uniformly (used for hover state). */
  private brighten(hex: number): number {
    const r = Math.min(255, ((hex >> 16) & 0xff) + 24);
    const g = Math.min(255, ((hex >> 8) & 0xff) + 24);
    const b = Math.min(255, (hex & 0xff) + 24);
    return (r << 16) | (g << 8) | b;
  }
}

