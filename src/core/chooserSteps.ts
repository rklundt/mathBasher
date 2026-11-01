// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type { GameId } from '@/core/gameIds';
import { ALL_GROUPS, gameGroupById, gameGroupOf, type GameGroup, type GameGroupId } from '@/core/gameGroups';
import { subjectById, type SubjectId } from '@/core/subjects';

/**
 * Sprint 2.15 — the Game Chooser's steps: subject › group › games (ADR-0015).
 * A step with one choice is skipped (a subject with one group or none opens
 * its games straight away). Sprint 2.16: Puzzles has groups too (Visual,
 * Words, Numbers). Plain data, so the rules are tested without Phaser.
 */
export type ChooserStep =
  | { readonly kind: 'subjects' }
  | { readonly kind: 'groups'; readonly subject: SubjectId }
  | { readonly kind: 'games'; readonly subject: SubjectId; readonly group: GameGroupId | null };

export const SUBJECTS_STEP: ChooserStep = { kind: 'subjects' };

/** A subject's groups (Math: mathBasher and Math Fun; Puzzles: Visual, Words and Numbers). */
export function groupsOf(subject: SubjectId): readonly GameGroup[] {
  return ALL_GROUPS.filter((g) => g.subject === subject);
}

/** Where picking a subject goes: its groups, or its games when it has one group or none. */
export function stepAfterSubject(subject: SubjectId): ChooserStep {
  const groups = groupsOf(subject);
  if (groups.length > 1) return { kind: 'groups', subject };
  return { kind: 'games', subject, group: groups.length === 1 ? groups[0].id : null };
}

/** Back walks up one step (skipping a step that was skipped on the way down); from subjects, the Title Screen. */
export function stepBefore(step: ChooserStep): ChooserStep | 'title' {
  switch (step.kind) {
    case 'subjects':
      return 'title';
    case 'groups':
      return SUBJECTS_STEP;
    case 'games':
      return groupsOf(step.subject).length > 1 ? { kind: 'groups', subject: step.subject } : SUBJECTS_STEP;
  }
}

/** The games on a games step, in tile order. */
export function gamesOn(step: ChooserStep & { kind: 'games' }): readonly GameId[] {
  if (step.group !== null) return gameGroupById(step.group).games;
  const subject = subjectById(step.subject);
  return subject.kind === 'puzzles' ? subject.puzzles : [];
}

/** The games step a game is on (Change Game opens it). */
export function gamesStepFor(game: GameId): ChooserStep & { kind: 'games' } {
  const group = gameGroupOf(game);
  return { kind: 'games', subject: group.subject, group: group.id };
}

/** One chip on the "where you are" trail: its label and the step it opens. */
export interface TrailChip {
  readonly label: string;
  readonly to: ChooserStep;
}

/**
 * The trail under the title: the subject, then the group (games steps of a
 * subject with groups), then the game on a setup screen (`game`).
 */
export function trailFor(step: ChooserStep, game?: { label: string; to: ChooserStep }): TrailChip[] {
  if (step.kind === 'subjects') return [];
  const chips: TrailChip[] = [{ label: subjectById(step.subject).label, to: SUBJECTS_STEP }];
  if (step.kind === 'games' && step.group !== null && groupsOf(step.subject).length > 1) {
    chips.push({ label: gameGroupById(step.group).label, to: { kind: 'groups', subject: step.subject } });
  }
  if (game !== undefined) chips.push(game);
  return chips;
}

/** The step's part of the screen tag: "subject", "math groups", "games: mathBasher", "games: Puzzles". */
export function stepTagName(step: ChooserStep): string {
  switch (step.kind) {
    case 'subjects':
      return 'subject';
    case 'groups':
      return `${step.subject} groups`;
    case 'games':
      return `games: ${step.group !== null ? gameGroupById(step.group).label : subjectById(step.subject).label}`;
  }
}
