// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';
import { SceneKeys, type SceneKey } from '@/core/sceneKeys';
import { getImplementedIds } from '@/math/registry';
import { SUBJECTS, subjectOf, type Subject } from '@/core/subjects';
import { Settings } from '@/services/Settings';
import { PlaceholderButton } from '@/game/ui/PlaceholderButton';
import { KeyboardNavigator } from '@/game/ui/KeyboardNavigator';
import { wireEscBack } from '@/game/ui/EscBackHandler';
import { text } from '@/game/ui/typography';
import { setupScene } from '@/game/scenes/sceneSetup';
import { createMuteIconButton } from '@/game/ui/MuteIconButton';
import { buildChallengeGrid } from '@/game/ui/ChallengeGrid';
import { selectChallenge, type ChallengePickerInit, type ChallengeSource } from '@/game/services/challengeSelection';

/**
 * Sprint 2.9 — "Pick your challenge!": subject (Math, the only one so far)
 * → challenge type. Opens on the first Start of a visit (no challenge yet)
 * and from the challenge chip and Game Over. Pause shows the same buttons
 * inside its own card instead (so Back keeps the round).
 *
 * Each opening says where a pick goes (`next`) and where Back / Esc goes
 * (`back`). They're set fresh in `init()` every time (Phaser keeps the last
 * start data otherwise). On the first visit, Back goes to the Menu with no
 * challenge set, so the picker opens again on the next Start.
 */
export class ChallengePickerScene extends Phaser.Scene {
  static readonly key = SceneKeys.ChallengePicker;

  private next: SceneKey = SceneKeys.GameSelect;
  private back: SceneKey = SceneKeys.Menu;
  private source: ChallengeSource = 'menu';

  constructor() {
    super(ChallengePickerScene.key);
  }

  init(data: Partial<ChallengePickerInit>): void {
    this.next = data.next ?? SceneKeys.GameSelect;
    this.back = data.back ?? SceneKeys.Menu;
    this.source = data.source ?? 'menu';
  }

  create(): void {
    setupScene(this);
    const { width } = this.scale;
    const cx = width / 2;
    const L = config.layout.challengeFlow;

    text(this, cx, L.picker.headingY, 'Pick your challenge!', 'h2').setOrigin(0.5);
    createMuteIconButton(this, width - 16 - 22, 16 + 18);

    // One tab per subject (`core/subjects.ts`), the current challenge's
    // subject selected and its challenges below. Math is the only one today.
    const current = Settings.round.challengeId;
    const subject: Subject = current === null ? SUBJECTS[0] : subjectOf(current);
    const tabW = L.picker.subjectTab.w;
    const tabGap = 16;
    SUBJECTS.forEach((s, i) => {
      new PlaceholderButton({
        scene: this,
        x: cx + (i - (SUBJECTS.length - 1) / 2) * (tabW + tabGap),
        y: L.picker.subjectTabY,
        width: tabW,
        height: L.picker.subjectTab.h,
        label: s.label,
        selected: s.id === subject.id,
      });
    });

    const goBack = (): void => {
      this.scene.start(this.back);
    };
    const back = new PlaceholderButton({
      scene: this,
      x: cx,
      y: L.picker.backY,
      width: L.backButton.w,
      height: L.backButton.h,
      label: 'Back',
      onClick: goBack,
    });

    if (getImplementedIds().length === 0) {
      // Defensive: never a grid of disabled buttons with no way forward.
      text(this, cx, L.picker.gridTopY + 100, 'No challenges yet. Check back soon!', 'accent').setOrigin(0.5);
      new KeyboardNavigator(this, [back]);
    } else {
      const grid = buildChallengeGrid(this, {
        subject,
        centerX: cx,
        firstRowY: L.picker.gridTopY,
        onPick: (id) => {
          selectChallenge(id, this.source);
          this.scene.start(this.next);
        },
      });
      new KeyboardNavigator(this, [...grid.buttons, back], {
        ...(grid.currentIndex >= 0 && { initialIndex: grid.currentIndex }),
      });
    }

    wireEscBack(this, goBack);
  }
}
