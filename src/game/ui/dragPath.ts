// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';

/**
 * Sprint 2.16 — drag a finger (or the mouse) through cells to make a path:
 * Letter Garden's letters today, and any later puzzle that traces through a
 * grid (Word Hunt, Number Path in the backlog). The owner asked for this
 * piece to be reusable, so it knows nothing about letters: it is given the
 * cells' centres and a rule for which cells may follow which, and reports
 * the path as it grows and when the finger lifts.
 *
 * A cell joins when the pointer comes within `hitRadius` of its centre (a
 * little smaller than the cell, so a diagonal move doesn't clip a
 * neighbour). Going back onto the cell before the last one takes the last
 * one off. The path draws itself as a thick line between the centres.
 */
export interface DragPathOpts {
  scene: Phaser.Scene;
  /** Each cell's centre, in scene coordinates. */
  cells: readonly { readonly x: number; readonly y: number }[];
  hitRadius: number;
  /** May `next` follow `last` (e.g. they touch)? Cells are never used twice. */
  canFollow: (last: number, next: number) => boolean;
  /** The path changed (a cell joined or left). */
  onChange: (path: readonly number[]) => void;
  /** The finger lifted (the path may be empty). */
  onEnd: (path: readonly number[]) => void;
  lineColour: number;
  lineWidth?: number;
  depth: number;
}

export class DragPath {
  private path: number[] = [];
  private dragging = false;
  private enabled = true;
  private readonly line: Phaser.GameObjects.Graphics;
  private readonly onDown: (p: Phaser.Input.Pointer) => void;
  private readonly onMove: (p: Phaser.Input.Pointer) => void;
  private readonly onUp: () => void;

  constructor(private readonly o: DragPathOpts) {
    this.line = o.scene.add.graphics().setDepth(o.depth);
    this.onDown = (p) => {
      if (!this.enabled) return;
      const c = this.cellAt(p.x, p.y);
      if (c < 0) return;
      this.dragging = true;
      this.path = [c];
      this.changed();
    };
    this.onMove = (p) => {
      if (!this.dragging || !this.enabled) return;
      const c = this.cellAt(p.x, p.y);
      if (c < 0 || c === this.path[this.path.length - 1]) return;
      // Back onto the one before: take the last one off.
      if (c === this.path[this.path.length - 2]) {
        this.path.pop();
        this.changed();
        return;
      }
      if (this.path.includes(c) || !o.canFollow(this.path[this.path.length - 1], c)) return;
      this.path.push(c);
      this.changed();
    };
    this.onUp = () => {
      if (!this.dragging) return;
      this.dragging = false;
      const done = [...this.path];
      this.clear();
      o.onEnd(done);
    };
    const input = o.scene.input;
    input.on('pointerdown', this.onDown);
    input.on('pointermove', this.onMove);
    input.on('pointerup', this.onUp);
    input.on('pointerupoutside', this.onUp);
  }

  /** Show a path drawn some other way (typing a word); it isn't dragged. */
  show(path: readonly number[]): void {
    this.path = [...path];
    this.draw();
  }

  clear(): void {
    this.path = [];
    this.draw();
  }

  /** Stop listening for a while (the round is paused or between boards). */
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on && this.dragging) {
      this.dragging = false;
      this.clear();
    }
  }

  destroy(): void {
    const input = this.o.scene.input;
    input.off('pointerdown', this.onDown);
    input.off('pointermove', this.onMove);
    input.off('pointerup', this.onUp);
    input.off('pointerupoutside', this.onUp);
    this.line.destroy();
  }

  private cellAt(x: number, y: number): number {
    const r2 = this.o.hitRadius * this.o.hitRadius;
    return this.o.cells.findIndex((c) => (c.x - x) ** 2 + (c.y - y) ** 2 <= r2);
  }

  private changed(): void {
    this.draw();
    this.o.onChange([...this.path]);
  }

  private draw(): void {
    const g = this.line;
    g.clear();
    if (this.path.length === 0) return;
    const w = this.o.lineWidth ?? 18;
    g.lineStyle(w, this.o.lineColour, 0.55);
    const pts = this.path.map((i) => this.o.cells[i]);
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
    g.strokePath();
    for (const p of pts) g.fillStyle(this.o.lineColour, 0.55).fillCircle(p.x, p.y, w * 0.7);
  }
}
