// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { _th, SeverityLevel } from '@/core/telemetry';

/**
 * Sprint 2.1.9 — tiny observable primitive. Extracted from
 * `Settings.ts` where the same pattern was hand-written twice (for
 * `gameId` + `imageAsteroidsEnabled`): Set<Listener> + per-listener
 * try/catch + idempotence guard on set + unsubscribe-returning
 * subscribe + Warning-severity telemetry on listener-throw.
 *
 * Three operations: `get`, `set` (idempotent — no-op + no fan-out
 * when value === current), `subscribe` (returns unsubscribe
 * function — same shape as Phaser scene events, RxJS observables,
 * the existing `Settings.onImageAsteroidsChange` API).
 *
 * The `name` arg is folded into the telemetry payload when a
 * listener throws so a future "which observable's subscriber
 * broke?" log query has the answer.
 *
 * Errors thrown by individual listeners are caught + logged at
 * Warning severity but do NOT propagate — one bad subscriber
 * shouldn't break the fan-out to the rest.
 *
 * Not a class because: the surface is 3 functions, the state is
 * one value + one Set. A class would add a `new` call at every
 * use site for no clarity benefit.
 */
export interface Observable<T> {
  /** Current value. */
  get(): T;
  /**
   * Set a new value. If the new value `===` the current value, the
   * call is a no-op (no fan-out). Otherwise the value updates and
   * every subscribed listener is invoked with the new value, in
   * subscription order, each wrapped in try/catch.
   */
  set(value: T): void;
  /**
   * Register a listener. Returns an unsubscribe function — call it
   * to stop receiving updates. Listeners are NOT invoked with the
   * current value at subscribe time; they only fire on subsequent
   * `set()` calls that change the value.
   */
  subscribe(listener: (value: T) => void): () => void;
}

export function createObservable<T>(name: string, initial: T): Observable<T> {
  let value = initial;
  const listeners = new Set<(value: T) => void>();

  return {
    get(): T {
      return value;
    },

    set(next: T): void {
      if (value === next) return;
      value = next;
      for (const listener of listeners) {
        try {
          listener(next);
        } catch (err) {
          _th.logToAi(`Observable.${name}.listenerError`, SeverityLevel.Warning, {
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      }
    },

    subscribe(listener: (value: T) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
