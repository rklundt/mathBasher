// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { SceneKeys } from '@/core/sceneKeys';
import { PlaceholderButton } from '@/game/ui/PlaceholderButton';
import { KeyboardNavigator } from '@/game/ui/KeyboardNavigator';
import { wireEscBack } from '@/game/ui/EscBackHandler';
import { text } from '@/game/ui/typography';
import { getAudioManager } from '@/services/audioManagerFactory';
import { AUDIO_KINDS, type AudioKind, type AudioManager } from '@/services/AudioManager';

/**
 * Settings screen. Reachable from MenuScene and from PauseOverlay. Owns
 * three stepped volume controls — one per audio kind (sfx, midground,
 * music) — adjustable in 10% increments from 0% to 100%.
 *
 * Launched as a parallel scene, NOT started in place: the caller passes
 * `onBack` via `init({ onBack })` and SettingsScene calls it when the
 * user clicks Back or presses Esc. From MenuScene the underlying scene
 * is Menu; from PauseOverlay the underlying scenes are Game + Hud +
 * PauseOverlay (in z-order). Either way SettingsScene knows nothing
 * about its caller.
 *
 * Design choice: stepped −/+ buttons rather than a drag slider. Three
 * reasons: (1) keyboard accessibility is automatic via the existing
 * KeyboardNavigator; (2) no fiddly drag-handling on touch; (3) easier
 * for kids — "press button to add" beats "drag handle precisely."
 *
 * AudioManager is the single source of truth: every refresh reads
 * `audio.getVolume(kind)` rather than holding a local mirror. setVolume
 * persists to localStorage immediately and live-updates any active
 * loops, so a kid moving a slider mid-round hears the change at once.
 */
export interface SettingsSceneInit {
  /** Called when the user clicks Back or presses Esc. */
  onBack: () => void;
}

const STEP = 10; // 10% per button press
const MIN_VOLUME = 0;
const MAX_VOLUME = 100;

const KIND_LABELS: Readonly<Record<AudioKind, string>> = {
  sfx: 'Sound effects',
  // "Background sounds" reads more naturally to a younger user than the
  // technical "Background ambience" — same concept, plainer English.
  midground: 'Background sounds',
  music: 'Music',
};

export class SettingsScene extends Phaser.Scene {
  static readonly key = SceneKeys.Settings;

  private onBack?: () => void;

  constructor() {
    super(SettingsScene.key);
  }

  init(data: Partial<SettingsSceneInit>): void {
    this.onBack = data.onBack;
    if (typeof this.onBack !== 'function') {
      // `onBack` is logically required — without it, Back button + Esc both
      // become no-ops and the user is stranded on the Settings screen with
      // no way out. The init signature uses `Partial` to keep Phaser's
      // scene-data flexibility, so the type system can't enforce this.
      // Surface a Warning so a future caller who forgets onBack sees a clear
      // signal in the console + telemetry stream rather than a silent
      // dead-end UI.
      _th.logToAi('SettingsScene.initMissingOnBack', SeverityLevel.Warning, {
        reason: 'caller did not supply onBack',
      });
    }
  }

  create(): void {
    _th.logToAi('SettingsScene Started', SeverityLevel.Information);

    const { width, height } = this.scale;

    // Translucent backdrop so the scene underneath (Menu OR Pause) reads
    // as "behind" the settings panel rather than "removed."
    const backdrop = this.add.rectangle(0, 0, width, height, 0x000000, 0.7);
    backdrop.setOrigin(0, 0);

    text(this, width / 2, height * 0.12, 'Settings', 'h2').setOrigin(0.5);
    text(this, width / 2, height * 0.22, 'Volume', 'sectionLabel').setOrigin(0.5);

    const audio = getAudioManager();
    const tabOrder: PlaceholderButton[] = [];

    // Three rows, vertically spaced so they're spatially distinct on
    // a phone in landscape (where vertical room is tight).
    const rowYStart = height * 0.36;
    const rowGap = height * 0.13;
    AUDIO_KINDS.forEach((kind, i) => {
      const rowY = rowYStart + i * rowGap;
      const buttons = this.renderRow(audio, kind, width / 2, rowY);
      tabOrder.push(...buttons);
    });

    const backButton = new PlaceholderButton({
      scene: this,
      x: width / 2,
      y: height * 0.85,
      width: 200,
      height: 56,
      label: 'Back',
      onClick: () => this.handleBack(),
    });
    tabOrder.push(backButton);

    new KeyboardNavigator(this, tabOrder);

    // Esc closes Settings via the same path as the Back button.
    wireEscBack(this, () => this.handleBack());

    this.events.once('shutdown', () => {
      _th.logToAi('SettingsScene Completed', SeverityLevel.Information);
    });
  }

  /**
   * Render one volume row: label on the left, then `−` button, percent
   * value, `+` button as a horizontal group centered on `cx`. Returns
   * the two buttons in tab order so the caller can assemble the full
   * KeyboardNavigator order across all rows + Back.
   *
   * The button onClicks read AudioManager via getter (NOT a captured
   * value at render time) so the latest live value is always used —
   * matters because mute or another control could change state between
   * renders.
   */
  private renderRow(
    audio: AudioManager,
    kind: AudioKind,
    cx: number,
    y: number,
  ): PlaceholderButton[] {
    // TextKind 'rowLabel' — 26px primary, the canonical settings-row
    // label sizing (Sprint 0.7.5 Story 3). Origin (0, 0.5) for left
    // alignment relative to the slider controls to its right.
    text(this, cx - 240, y, KIND_LABELS[kind], 'rowLabel').setOrigin(0, 0.5);

    // Percent text — declared first so the closures below can update it.
    // Standard 'accent' kind matches the 28px bold amber treatment.
    const percentText = text(this, cx + 100, y, `${audio.getVolume(kind)}%`, 'accent');
    percentText.setOrigin(0.5);

    // Minus button on the left of the percent.
    const minusBtn = new PlaceholderButton({
      scene: this,
      x: cx + 30,
      y,
      width: 56,
      height: 56,
      label: '−',
      disabled: audio.getVolume(kind) <= MIN_VOLUME,
      onClick: () => {
        const next = Math.max(MIN_VOLUME, audio.getVolume(kind) - STEP);
        audio.setVolume(kind, next);
        refresh();
      },
    });

    // Plus button on the right of the percent.
    const plusBtn = new PlaceholderButton({
      scene: this,
      x: cx + 170,
      y,
      width: 56,
      height: 56,
      label: '+',
      disabled: audio.getVolume(kind) >= MAX_VOLUME,
      onClick: () => {
        const next = Math.min(MAX_VOLUME, audio.getVolume(kind) + STEP);
        audio.setVolume(kind, next);
        refresh();
      },
    });

    // Refresh both the percent text and the disabled state of −/+ after
    // any volume change. AudioManager is the source of truth so we re-
    // read getVolume rather than tracking a local copy.
    const refresh = (): void => {
      const v = audio.getVolume(kind);
      percentText.setText(`${v}%`);
      minusBtn.setDisabled(v <= MIN_VOLUME);
      plusBtn.setDisabled(v >= MAX_VOLUME);
    };

    return [minusBtn, plusBtn];
  }

  private handleBack(): void {
    this.onBack?.();
  }
}
