// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import type { IScoreStore } from '@/services/IScoreStore';
import { SessionScoreStore } from '@/services/SessionScoreStore';

/**
 * Single call site for "give me the score store the app should use." Gameplay
 * code asks for an `IScoreStore` and never has to know which implementation
 * is wired in.
 *
 * Today this returns a brand-new `SessionScoreStore` (in-memory, session-only)
 * each call. When Phase 3 adds an API-backed store with accounts, the swap is
 * **a single change to this file** — every other file consumes the interface
 * and is unchanged.
 *
 * Do NOT call this multiple times per round in gameplay code; create the
 * store once at app boot and pass it around (or look up via DI). Repeated
 * calls today produce independent in-memory arrays, which is rarely what you
 * want — and would cost real network requests once Phase 3 lands.
 */
export function createScoreStore(): IScoreStore {
  return new SessionScoreStore();
}
