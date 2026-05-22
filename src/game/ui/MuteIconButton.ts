// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { createIconButton, type IconButtonInstance } from '@/game/ui/IconButton';
import { MUTE_ICON_BG, MUTE_ICON_HOVER } from '@/game/ui/uiPalette';
import { textStyle } from '@/game/ui/typography';
import { getAudioManager } from '@/services/audioManagerFactory';

/**
 * Top-right mute icon — shared helper so every scene that wants the
 * one-tap mute affordance uses the same look + behavior. Mirrors what
 * MenuScene and HudScene built inline before sprint 2.2 wrap-up
 * extracted them to a single source.
 *
 * Visual: 44×36 warm-amber-tinted `IconButton` background carrying a
 * speaker emoji glyph. The glyph flips 🔊 ↔ 🔇 based on
 * `AudioManager.isMuted()` and dims to 0.65 alpha when muted so the
 * OFF state reads at a glance — important for the 6yo target audience
 * who may not register the OS-rendered cancellation stroke.
 *
 * On activation: toggles `AudioManager.setMuted(...)`. The click SFX
 * fires INSIDE setMuted, so muting ON gets an audible confirmation
 * (last SFX before mute kicks in); muting OFF is silent (audio is
 * already muted at the moment of activation, the visual flip is the
 * confirmation).
 */
export function createMuteIconButton(
  scene: Phaser.Scene,
  centerX: number,
  centerY: number,
): IconButtonInstance {
  const audio = getAudioManager();
  return createIconButton({
    scene,
    x: centerX,
    y: centerY,
    width: 44,
    height: 36,
    baseFill: MUTE_ICON_BG,
    hoverFill: MUTE_ICON_HOVER,
    render: (container) => {
      // Container-anchored — TextKind 'iconGlyph' is the same shared
      // style HudScene + MenuScene use for their corner icon glyphs.
      const speakerGlyph = scene.add.text(0, 1, '🔊', textStyle('iconGlyph')).setOrigin(0.5);
      container.add(speakerGlyph);

      // Refresh closure — re-evaluated by the IconButton wrapper on
      // focus changes AND immediately after every activation, so the
      // emoji + alpha auto-paint after a mute toggle without any extra
      // wiring at the call site.
      const refresh = (): void => {
        const muted = audio.isMuted();
        speakerGlyph.setText(muted ? '🔇' : '🔊');
        speakerGlyph.setAlpha(muted ? 0.65 : 1);
      };
      refresh();
      return refresh;
    },
    onActivate: () => {
      audio.setMuted(!audio.isMuted());
    },
  });
}
