// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { config } from '@/core/config';
import { SceneKeys } from '@/core/sceneKeys';
import type { SubjectId } from '@/core/subjects';
import { generators } from '@/math/registry';
import { puzzleById, type PuzzleId } from '@/core/puzzles';
import type { MathId } from '@/core/config';
import { formatPoints } from '@/services/challengePoints';
import { dayKeyToDate, getMyScores, roundsLabel, type ScoresView } from '@/services/MyScores';
import { PlaceholderButton } from '@/game/ui/PlaceholderButton';
import { KeyboardNavigator, type Focusable } from '@/game/ui/KeyboardNavigator';
import { wireEscBack } from '@/game/ui/EscBackHandler';
import { text, textStyle } from '@/game/ui/typography';
import { setupScene } from '@/game/scenes/sceneSetup';
import { addScreenTag } from '@/game/ui/screenTag';
import { createMuteIconButton } from '@/game/ui/MuteIconButton';
import type { MyScoresInit } from '@/game/services/chooserNavigation';

type Tab = 'today' | 'all-time';

/** A row's name: the challenge's, or the puzzle's. */
function rowLabel(kind: 'challenges' | 'puzzles', id: string): string {
  return kind === 'puzzles' ? puzzleById(id as PuzzleId).label : generators[id as MathId].label;
}

/** Remembered for the visit: the tab, and which subjects are open. */
let visitTab: Tab = 'today';
const visitOpen = new Map<SubjectId, boolean>();
/** A subject starts open when it's the only one with points; with several, closed. */
const isOpen = (id: SubjectId, subjects: number): boolean => visitOpen.get(id) ?? subjects === 1;

/** A subject row in the list, in list coordinates (0 = the list's top, unscrolled). */
interface SubjectRow {
  readonly button: PlaceholderButton;
  readonly top: number;
  readonly bottom: number;
}

/** A press inside the list: a tap (fold a subject) until it moves, then a drag (scroll). */
interface Press {
  readonly startY: number;
  readonly startScroll: number;
  readonly row: SubjectRow | undefined;
  dragging: boolean;
}

/**
 * Sprint 2.9.2 — "My Scores": the points earned in this browser, by subject
 * → challenge, for Today (since local midnight) and All-Time. Anyone can
 * look; nothing is sent anywhere (`MyScores` service).
 *
 * Only the list scrolls (drag, mouse wheel, arrow keys; a thin bar shows
 * where you are). Subject rows fold their challenges. They're buttons for
 * the keyboard, but this scene handles their taps itself
 * (`pointerInput: false`): Phaser's input ignores the list's mask, so a row
 * scrolled out of sight would otherwise catch taps meant for the tabs or
 * Back, and a drag that starts on a row has to scroll, not fold it.
 */
export class MyScoresScene extends Phaser.Scene {
  static readonly key = SceneKeys.MyScores;

  /** Everything that changes with the tab or a fold (rebuilt by `render`). */
  private view: Phaser.GameObjects.GameObject[] = [];
  private nav?: KeyboardNavigator;
  private back!: PlaceholderButton;
  private list!: Phaser.GameObjects.Container;
  private listMask!: Phaser.GameObjects.Graphics;
  private thumb?: Phaser.GameObjects.Rectangle;
  private rows: SubjectRow[] = [];
  private contentH = 0;
  private scrollY = 0;
  private press: Press | undefined;

  /** Sprint 2.15 — where Back goes: the chooser step or setup screen My Scores was opened from. */
  private backTo: MyScoresInit['back'] = { key: SceneKeys.Title };

  constructor() {
    super(MyScoresScene.key);
  }

  init(data: Partial<MyScoresInit>): void {
    this.backTo = data.back ?? { key: SceneKeys.Title };
  }

  create(): void {
    setupScene(this);
    addScreenTag(this, 'MyScoresScene');
    this.view = [];
    this.nav = undefined;
    this.rows = [];
    this.scrollY = 0;
    this.press = undefined;

    const { width } = this.scale;
    const cx = width / 2;
    const M = config.layout.myScores;
    const L = M.list;

    text(this, cx, M.headingY, 'My Scores', 'h2').setOrigin(0.5);
    createMuteIconButton(this, width - 16 - 22, 16 + 18);

    const goBack = (): void => {
      this.scene.start(this.backTo.key, this.backTo.data);
    };
    this.back = new PlaceholderButton({
      scene: this,
      x: cx,
      y: M.backY,
      width: config.layout.myScores.backButton.w,
      height: config.layout.myScores.backButton.h,
      label: 'Back',
      onClick: goBack,
    });

    const panel = this.add.graphics();
    panel.fillStyle(L.panel.color, L.panel.alpha);
    panel.fillRoundedRect(
      cx - L.w / 2 - L.panel.padPx,
      L.top - L.panel.padPx,
      L.w + 2 * L.panel.padPx,
      L.bottom - L.top + 2 * L.panel.padPx,
      L.panel.radius,
    );

    // The list: a container that moves up as it scrolls, clipped to its window.
    this.list = this.add.container(cx, L.top);
    this.listMask = this.make.graphics({}, false);
    this.listMask.fillStyle(0xffffff);
    this.listMask.fillRect(cx - L.w / 2 - 8, L.top, L.w + 16, L.bottom - L.top);
    this.list.setMask(this.listMask.createGeometryMask());

    this.render(0);

    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
    this.input.on(Phaser.Input.Events.POINTER_WHEEL, this.onWheel, this);
    this.input.keyboard?.on('keydown-UP', this.onArrowUp, this);
    this.input.keyboard?.on('keydown-DOWN', this.onArrowDown, this);
    wireEscBack(this, goBack);

    this.events.once('shutdown', () => {
      this.input.off(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
      this.input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
      this.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
      this.input.off(Phaser.Input.Events.POINTER_WHEEL, this.onWheel, this);
      this.input.keyboard?.off('keydown-UP', this.onArrowUp, this);
      this.input.keyboard?.off('keydown-DOWN', this.onArrowDown, this);
      this.listMask.destroy();
    });
  }

  /**
   * Build the tabs, total, date, note and list for the current tab, and the
   * keyboard order: the two tabs, the subject rows, Back. `focusIndex` keeps
   * focus on whatever was just pressed.
   */
  private render(focusIndex: number): void {
    this.nav?.destroy();
    for (const obj of this.view) obj.destroy();
    this.view = [];
    this.list.removeAll(true);
    this.rows = [];
    this.thumb = undefined;

    const cx = this.scale.width / 2;
    const M = config.layout.myScores;
    const L = M.list;
    const ledger = getMyScores();
    const scores: ScoresView = visitTab === 'today' ? ledger.today() : ledger.allTime();

    const tabs = (['today', 'all-time'] as const).map((tab, i) => {
      const button = new PlaceholderButton({
        scene: this,
        x: cx + (i - 0.5) * (M.tab.w + M.tab.gapX),
        y: M.tabY,
        width: M.tab.w,
        height: M.tab.h,
        label: tab === 'today' ? 'Today' : 'All-Time',
        selected: tab === visitTab,
        onClick: () => {
          if (tab === visitTab) return;
          visitTab = tab;
          this.scrollY = 0;
          this.render(i);
        },
      });
      this.view.push(button);
      return button;
    });

    // "Today's points: 1,500", and the date under it so a grown-up knows which day.
    const totalLabel = visitTab === 'today' ? "Today's points" : 'All-time points';
    this.view.push(text(this, cx, M.totalY, `${totalLabel}: ${formatPoints(scores.points)}`, 'accent').setOrigin(0.5));
    const date = this.dateLine();
    if (date !== null) this.view.push(text(this, cx, M.dateY, date, 'bodyMuted').setOrigin(0.5));
    if (visitTab === 'all-time') {
      this.view.push(
        text(
          this,
          cx,
          M.noteY,
          'Saved in this browser only. Ask a grown-up to make an account to keep them (coming soon).',
          'bodyMuted',
        ).setOrigin(0.5),
      );
    }

    const focusables: Focusable[] = [...tabs];
    if (scores.subjects.length === 0) {
      const empty = visitTab === 'today' ? 'No points yet today. Play a round!' : 'No scores yet. Play a round!';
      this.list.add(this.add.text(0, (L.bottom - L.top) / 2, empty, textStyle('bodyLarge')).setOrigin(0.5));
      this.contentH = 0;
    } else {
      this.contentH = this.buildRows(scores, focusables);
    }
    focusables.push(this.back);

    this.buildScrollBar();
    this.setScroll(this.scrollY);
    this.nav = new KeyboardNavigator(this, focusables, { initialIndex: focusIndex });
    _th.logToAi('MyScoresScene.Shown', SeverityLevel.Information, {
      label: visitTab,
      roundScore: String(scores.points),
    });
  }

  /** Subject rows, each followed (when open) by its challenge rows. Returns the list's height. */
  private buildRows(scores: ScoresView, focusables: Focusable[]): number {
    const L = config.layout.myScores.list;
    const left = -L.w / 2 + 40;
    const right = L.w / 2 - 24;
    let y = 0;
    for (const s of scores.subjects) {
      const open = isOpen(s.subject.id, scores.subjects.length);
      const index = focusables.length;
      const button = new PlaceholderButton({
        scene: this,
        x: 0,
        y: y + L.subjectRowH / 2,
        width: L.w,
        height: L.subjectRowH,
        label: `${open ? '▾' : '▸'}  ${s.subject.label}: ${formatPoints(s.points)} points`,
        selected: open,
        pointerInput: false,
        onClick: () => {
          visitOpen.set(s.subject.id, !open);
          _th.logToAi('MyScoresScene.SubjectFolded', SeverityLevel.Information, {
            label: s.subject.label,
            reason: open ? 'closed' : 'opened',
          });
          this.render(index);
        },
      });
      this.list.add(button);
      const row: SubjectRow = { button, top: y, bottom: y + L.subjectRowH };
      this.rows.push(row);
      // Keyboard focus on a row scrolls it into view.
      focusables.push({
        setFocused: (v) => {
          button.setFocused(v);
          if (v) this.scrollIntoView(row.top, row.bottom);
        },
        activate: () => button.activate(),
        isDisabled: () => button.isDisabled(),
      });
      y += L.subjectRowH + L.gapPx;
      if (!open) continue;

      for (const c of s.challenges) {
        const mid = y + L.challengeRowH / 2;
        this.list.add([
          this.add.text(left, mid, rowLabel(s.subject.kind, c.id), textStyle('body')).setOrigin(0, 0.5),
          this.add.text(-90, mid, roundsLabel(c.tally), textStyle('bodyMuted')).setOrigin(0, 0.5),
          this.add
            .text(right, mid, `${formatPoints(c.tally.points)} points`, textStyle('bodyAccent'))
            .setOrigin(1, 0.5),
        ]);
        y += L.challengeRowH;
      }
      y += L.gapPx;
    }
    return y;
  }

  /** "Friday, October 23" on Today; "Since October 1" on All-Time (once anything is saved). */
  private dateLine(): string | null {
    if (visitTab === 'today') {
      return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    }
    const since = getMyScores().since();
    if (since === null) return null;
    const d = dayKeyToDate(since);
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return `Since ${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', ...(!sameYear && { year: 'numeric' }) })}`;
  }

  /** A thin bar beside the list, only when it doesn't all fit. */
  private buildScrollBar(): void {
    const L = config.layout.myScores.list;
    const viewH = L.bottom - L.top;
    if (this.contentH <= viewH) return;
    const x = this.scale.width / 2 + L.w / 2 + L.panel.padPx / 2;
    const track = this.add.rectangle(x, L.top, L.scrollBarW, viewH, 0x1f2740, 0.9).setOrigin(0.5, 0);
    const thumbH = Math.max(40, (viewH * viewH) / this.contentH);
    this.thumb = this.add.rectangle(x, L.top, L.scrollBarW, thumbH, 0x94a3b8).setOrigin(0.5, 0);
    this.view.push(track, this.thumb);
  }

  private maxScroll(): number {
    const L = config.layout.myScores.list;
    return Math.max(0, this.contentH - (L.bottom - L.top));
  }

  private setScroll(y: number): void {
    const L = config.layout.myScores.list;
    this.scrollY = Phaser.Math.Clamp(y, 0, this.maxScroll());
    this.list.y = L.top - this.scrollY;
    if (this.thumb) {
      const travel = L.bottom - L.top - this.thumb.height;
      this.thumb.y = L.top + (this.maxScroll() === 0 ? 0 : (travel * this.scrollY) / this.maxScroll());
    }
  }

  private scrollIntoView(top: number, bottom: number): void {
    const L = config.layout.myScores.list;
    const viewH = L.bottom - L.top;
    if (top < this.scrollY) this.setScroll(top);
    else if (bottom > this.scrollY + viewH) this.setScroll(bottom - viewH);
  }

  /** Inside the list's window (in screen coordinates)? */
  private inList(p: Phaser.Input.Pointer): boolean {
    const L = config.layout.myScores.list;
    const cx = this.scale.width / 2;
    return p.y >= L.top && p.y <= L.bottom && Math.abs(p.x - cx) <= L.w / 2;
  }

  /** The subject row under the pointer, if any (it must be in the window). */
  private rowAt(p: Phaser.Input.Pointer): SubjectRow | undefined {
    if (!this.inList(p)) return undefined;
    const y = p.y - config.layout.myScores.list.top + this.scrollY;
    return this.rows.find((r) => y >= r.top && y < r.bottom);
  }

  private onPointerDown(p: Phaser.Input.Pointer): void {
    this.press = this.inList(p)
      ? { startY: p.y, startScroll: this.scrollY, row: this.rowAt(p), dragging: false }
      : undefined;
  }

  private onPointerMove(p: Phaser.Input.Pointer): void {
    if (!this.press || !p.isDown) return;
    const dy = p.y - this.press.startY;
    if (!this.press.dragging && Math.abs(dy) > config.layout.myScores.list.dragThresholdPx) this.press.dragging = true;
    if (this.press.dragging) this.setScroll(this.press.startScroll - dy);
  }

  /** A tap (no drag) that starts and ends on the same subject row folds it. */
  private onPointerUp(p: Phaser.Input.Pointer): void {
    const press = this.press;
    this.press = undefined;
    if (!press || press.dragging || !press.row) return;
    if (this.rowAt(p) === press.row) press.row.button.activate('pointer');
  }

  private onWheel(_p: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number): void {
    this.setScroll(this.scrollY + dy * config.layout.myScores.list.wheelScale);
  }

  private onArrowUp(): void {
    this.setScroll(this.scrollY - config.layout.myScores.list.challengeRowH);
  }

  private onArrowDown(): void {
    this.setScroll(this.scrollY + config.layout.myScores.list.challengeRowH);
  }
}
