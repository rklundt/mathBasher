// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';
import { SceneKeys, type SceneKey } from '@/core/sceneKeys';
import { getImplementedIds } from '@/math/registry';
import { SUBJECTS, subjectById, subjectOf, type PuzzleSubject, type SubjectId } from '@/core/subjects';
import { puzzleById } from '@/core/puzzles';
import { PUZZLE_ICON_SHEET } from '@/core/spriteKeys';
import { Settings } from '@/services/Settings';
import { PlaceholderButton } from '@/game/ui/PlaceholderButton';
import { KeyboardNavigator } from '@/game/ui/KeyboardNavigator';
import { computeGridSlots } from '@/game/ui/menuLayoutGeometry';
import { wireEscBack } from '@/game/ui/EscBackHandler';
import { text } from '@/game/ui/typography';
import { applyTextOutline } from '@/game/ui/callouts';
import { setupScene } from '@/game/scenes/sceneSetup';
import { createMuteIconButton } from '@/game/ui/MuteIconButton';
import { buildChallengeGrid } from '@/game/ui/ChallengeGrid';
import {
  openPuzzle,
  selectChallenge,
  selectPuzzle,
  type ChallengePickerInit,
  type ChallengeSource,
} from '@/game/services/challengeSelection';

/**
 * Sprint 2.9 — "Pick your challenge!": subject → challenge type. Opens on
 * the first Start of a visit (no challenge yet) and from the challenge chip
 * and Game Over. Pause shows the same buttons inside its own card instead
 * (so Back keeps the round).
 *
 * Sprint 2.13 — the subject tabs work: **Math** lists the challenges,
 * **Puzzles** lists the puzzle games (Pair Pals; Pattern Train coming).
 * Tapping a tab swaps the buttons below in place. A challenge goes where
 * this opening says (`next`); a puzzle always goes to its own setup.
 *
 * Each opening says where a pick goes (`next`), where Back / Esc goes
 * (`back`) and, optionally, which tab to open on (`subject`). They're set
 * fresh in `init()` every time (Phaser keeps the last start data
 * otherwise). On the first visit, Back goes to the Menu with no challenge
 * set, so the picker opens again on the next Start.
 */
export class ChallengePickerScene extends Phaser.Scene {
  static readonly key = SceneKeys.ChallengePicker;

  private next: SceneKey = SceneKeys.GameSelect;
  private back: SceneKey = SceneKeys.Menu;
  private source: ChallengeSource = 'menu';
  private subjectId: SubjectId = 'math';
  private tabs: PlaceholderButton[] = [];
  private backButton!: PlaceholderButton;
  /** The buttons below the tabs (rebuilt on a tab swap). */
  private content: Phaser.GameObjects.GameObject[] = [];
  private nav?: KeyboardNavigator;

  constructor() {
    super(ChallengePickerScene.key);
  }

  init(data: Partial<ChallengePickerInit>): void {
    this.next = data.next ?? SceneKeys.GameSelect;
    this.back = data.back ?? SceneKeys.Menu;
    this.source = data.source ?? 'menu';
    this.subjectId = data.subject ?? defaultSubject();
  }

  create(): void {
    setupScene(this);
    this.content = [];
    this.nav = undefined;
    const { width } = this.scale;
    const cx = width / 2;
    const L = config.layout.challengeFlow;

    text(this, cx, L.picker.headingY, 'Pick your challenge!', 'h2').setOrigin(0.5);
    createMuteIconButton(this, width - 16 - 22, 16 + 18);

    // One tab per subject (`core/subjects.ts`); the selected one is ringed.
    const tabW = L.picker.subjectTab.w;
    const tabGap = 16;
    this.tabs = SUBJECTS.map(
      (s, i) =>
        new PlaceholderButton({
          scene: this,
          x: cx + (i - (SUBJECTS.length - 1) / 2) * (tabW + tabGap),
          y: L.picker.subjectTabY,
          width: tabW,
          height: L.picker.subjectTab.h,
          label: s.label,
          selected: s.id === this.subjectId,
          onClick: () => this.showSubject(s.id),
        }),
    );

    const goBack = (): void => {
      this.scene.start(this.back);
    };
    this.backButton = new PlaceholderButton({
      scene: this,
      x: cx,
      y: L.picker.backY,
      width: L.backButton.w,
      height: L.backButton.h,
      label: 'Back',
      onClick: goBack,
    });

    this.buildContent(false);
    wireEscBack(this, goBack);
  }

  /** Swap the tab: the buttons below change in place (with a quick fade-in, so the change is noticed). */
  private showSubject(id: SubjectId): void {
    if (id === this.subjectId) return;
    this.subjectId = id;
    this.tabs.forEach((tab, i) => tab.setSelected(SUBJECTS[i].id === id));
    this.buildContent(true);
  }

  private buildContent(fade: boolean): void {
    this.nav?.destroy();
    for (const obj of this.content) obj.destroy();
    this.content = [];

    const cx = this.scale.width / 2;
    const L = config.layout.challengeFlow;
    const subject = subjectById(this.subjectId);
    const tabIndex = SUBJECTS.findIndex((s) => s.id === this.subjectId);
    let buttons: PlaceholderButton[];
    let initialIndex = -1;

    if (subject.kind === 'puzzles') {
      buttons = this.buildPuzzleTiles(subject);
      initialIndex = 0;
    } else if (getImplementedIds().length === 0) {
      // Defensive: never a grid of disabled buttons with no way forward.
      const none = text(this, cx, L.picker.gridTopY + 100, 'No challenges yet. Check back soon!', 'accent');
      this.content.push(none.setOrigin(0.5));
      buttons = [];
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
      buttons = grid.buttons;
      initialIndex = grid.currentIndex;
    }
    this.content.push(...buttons);

    // Tab order: the tabs, the buttons below, Back. Focus starts on the
    // current challenge (or the first puzzle), else on this tab.
    const order = [...this.tabs, ...buttons, this.backButton];
    const start = initialIndex >= 0 ? this.tabs.length + initialIndex : tabIndex;
    this.nav = new KeyboardNavigator(this, order, { initialIndex: start });

    if (fade) {
      for (const button of buttons) {
        const to = button.alpha; // a "Coming soon" tile stays dimmed
        button.setAlpha(0);
        this.tweens.add({ targets: button, alpha: to, duration: L.picker.swapFadeMs, ease: 'Sine.Out' });
      }
    }
  }

  /** The Puzzles tab: one tile per puzzle; one that's still coming wiggles and says so. */
  private buildPuzzleTiles(subject: PuzzleSubject): PlaceholderButton[] {
    const cx = this.scale.width / 2;
    const G = config.layout.challengeFlow.picker.puzzleGrid;
    const slots = computeGridSlots(cx, G.firstRowY, subject.puzzles.length, G);
    return subject.puzzles.map((id, i) => {
      const puzzle = puzzleById(id);
      const ready = puzzle.gameId !== null;
      const tile: PlaceholderButton = new PlaceholderButton({
        scene: this,
        x: slots[i].x,
        y: slots[i].y,
        width: slots[i].width,
        height: slots[i].height,
        label: puzzle.label,
        subtitle: puzzle.blurb,
        icon: {
          key: PUZZLE_ICON_SHEET.key,
          frame: PUZZLE_ICON_SHEET.frames[id],
          sizePx: config.layout.challengeFlow.picker.puzzleIcon.sizePx,
          padPx: config.layout.challengeFlow.picker.puzzleIcon.padPx,
        },
        selected: Settings.lastPick === id,
        onClick: () => {
          if (ready) {
            selectPuzzle(id, this.source);
            openPuzzle(this, id);
          } else {
            this.comingSoon(tile);
          }
        },
      });
      if (!ready) tile.setAlpha(0.55);
      return tile;
    });
  }

  /** A tile that isn't built yet: a wiggle and a floating "Coming soon!" (a dead tile gets tapped over and over). */
  private comingSoon(tile: PlaceholderButton): void {
    if (this.tweens.isTweening(tile)) return;
    this.tweens.add({
      targets: tile,
      angle: { from: -3, to: 3 },
      duration: 70,
      yoyo: true,
      repeat: 2,
      onComplete: () => tile.setAngle(0),
    });
    const note = text(this, tile.x, tile.y - 90, 'Coming soon!', 'accent').setOrigin(0.5);
    applyTextOutline(note);
    this.content.push(note);
    this.tweens.add({
      targets: note,
      y: note.y - 40,
      alpha: 0,
      duration: 1100,
      ease: 'Sine.In',
      onComplete: () => note.destroy(),
    });
  }
}

/** The tab to open on: the last pick's (a puzzle → Puzzles), else the challenge's, else Math. */
function defaultSubject(): SubjectId {
  const pick = Settings.lastPick;
  if (pick !== null && pick !== 'challenge') return 'puzzles';
  const current = Settings.round.challengeId;
  return current === null ? 'math' : subjectOf(current).id;
}
