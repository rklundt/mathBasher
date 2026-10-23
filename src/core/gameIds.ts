// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * The game modes. Sprint 2.1 widened a bare `'alien-shoot'` string to this
 * union when Asteroid Field landed; a new game adds a literal here and
 * TypeScript then flags every place that has to handle it (ADR-0011).
 *
 * Lives in `core` since sprint 2.9.1 (it was in `services/Settings.ts`, so
 * `core` files had to import from `services`, a known ADR-0006 exception).
 * `Settings` re-exports it, so `import { type GameId } from
 * '@/services/Settings'` still works outside `core`.
 */
export type GameId =
  | 'alien-shoot'
  | 'asteroid-field'
  | 'number-climb'
  | 'math-a-lotl'
  | 'frog-splash'
  | 'space-shooter'
  | 'penguin-slide'
  | 'bunny-garden';
