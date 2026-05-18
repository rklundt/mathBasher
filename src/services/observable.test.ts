// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createObservable } from '@/services/observable';

/**
 * Sprint 2.1.9 — tests for the tiny observable primitive that
 * Settings.ts uses for `gameId` + `imageAsteroidsEnabled`. The
 * pattern is small but load-bearing — BackgroundScene listens for
 * gameId changes to swap the gameplay backdrop, and AsteroidFieldScene
 * listens for imageAsteroids changes to swap live asteroid visuals.
 * A regression here would silently break both flows.
 */
describe('createObservable', () => {
  describe('get + set', () => {
    it('returns the initial value before any set', () => {
      const obs = createObservable('test', 42);
      expect(obs.get()).toBe(42);
    });

    it('returns the new value after set', () => {
      const obs = createObservable('test', 0);
      obs.set(100);
      expect(obs.get()).toBe(100);
    });

    it('handles non-primitive values via strict equality', () => {
      // Reference-equality semantics — set({x:1}) → set({x:1}) DOES fire
      // because they're different references even with same shape.
      const obs = createObservable<{ x: number }>('test', { x: 0 });
      const listener = vi.fn();
      obs.subscribe(listener);
      obs.set({ x: 0 });
      expect(listener).toHaveBeenCalledOnce(); // fires — new reference
    });
  });

  describe('subscribe + idempotence', () => {
    it('fires the listener on every value change', () => {
      const obs = createObservable('test', 0);
      const listener = vi.fn();
      obs.subscribe(listener);
      obs.set(1);
      obs.set(2);
      obs.set(3);
      expect(listener).toHaveBeenCalledTimes(3);
      expect(listener).toHaveBeenNthCalledWith(1, 1);
      expect(listener).toHaveBeenNthCalledWith(2, 2);
      expect(listener).toHaveBeenNthCalledWith(3, 3);
    });

    it('skips the listener when set with the same value (idempotence)', () => {
      const obs = createObservable('test', 5);
      const listener = vi.fn();
      obs.subscribe(listener);
      obs.set(5); // same → no fan-out
      obs.set(5); // same → no fan-out
      expect(listener).not.toHaveBeenCalled();
    });

    it('does NOT fire the listener at subscribe time (only on subsequent change)', () => {
      const obs = createObservable('test', 'initial');
      const listener = vi.fn();
      obs.subscribe(listener);
      // No set yet → no call. Listeners get future changes only.
      expect(listener).not.toHaveBeenCalled();
    });

    it('supports multiple listeners; all fire on change', () => {
      const obs = createObservable('test', 0);
      const a = vi.fn();
      const b = vi.fn();
      const c = vi.fn();
      obs.subscribe(a);
      obs.subscribe(b);
      obs.subscribe(c);
      obs.set(1);
      expect(a).toHaveBeenCalledWith(1);
      expect(b).toHaveBeenCalledWith(1);
      expect(c).toHaveBeenCalledWith(1);
    });
  });

  describe('unsubscribe', () => {
    it('returns an unsubscribe function that stops further calls', () => {
      const obs = createObservable('test', 0);
      const listener = vi.fn();
      const unsubscribe = obs.subscribe(listener);
      obs.set(1);
      expect(listener).toHaveBeenCalledTimes(1);
      unsubscribe();
      obs.set(2);
      obs.set(3);
      expect(listener).toHaveBeenCalledTimes(1); // no additional calls
    });

    it('unsubscribe is idempotent (calling twice is safe)', () => {
      const obs = createObservable('test', 0);
      const listener = vi.fn();
      const unsubscribe = obs.subscribe(listener);
      unsubscribe();
      unsubscribe(); // no-op
      obs.set(1);
      expect(listener).not.toHaveBeenCalled();
    });

    it('unsubscribing one listener does not affect others', () => {
      const obs = createObservable('test', 0);
      const a = vi.fn();
      const b = vi.fn();
      const unsubscribeA = obs.subscribe(a);
      obs.subscribe(b);
      unsubscribeA();
      obs.set(1);
      expect(a).not.toHaveBeenCalled();
      expect(b).toHaveBeenCalledWith(1);
    });
  });

  describe('listener error containment', () => {
    beforeEach(() => {
      // The error path logs telemetry via `_th`; we don't assert on
      // the log output here (telemetry plumbing has its own tests).
      // We DO assert that one bad listener doesn't break the fan-out.
    });

    it('a throwing listener does not stop other listeners from firing', () => {
      const obs = createObservable('test', 0);
      const bad = vi.fn(() => {
        throw new Error('boom');
      });
      const good = vi.fn();
      obs.subscribe(bad);
      obs.subscribe(good);
      obs.set(1);
      expect(bad).toHaveBeenCalled();
      expect(good).toHaveBeenCalledWith(1); // still fired
    });

    it('a throwing listener does not abort the set() call itself', () => {
      const obs = createObservable('test', 0);
      obs.subscribe(() => {
        throw new Error('boom');
      });
      expect(() => obs.set(1)).not.toThrow();
      expect(obs.get()).toBe(1);
    });
  });
});
