// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it, vi } from 'vitest';
import { attachLoadingOverlay } from '@/game/ui/LoadingOverlay';

// Stub `window` on globalThis BEFORE importing anything that touches
// Phaser. The LoadingOverlay import chain → @/game/ui/typography →
// (nothing Phaser-related at module-load time, so the chain is safe).
// We use Phaser event-name string literals below instead of
// `Phaser.Loader.Events.*` because importing Phaser would trigger
// its OS/Device bootstrap which touches `window` at module-load
// time — pulling in jsdom just for that is heavier than referencing
// the 3 stable string constants directly.
//
// String values lifted from Phaser 3.90 source
// (`src/loader/events/index.js`):
const EVT_PROGRESS = 'progress';
const EVT_COMPLETE = 'complete';
const EVT_FILE_LOAD_ERROR = 'loaderror';

/**
 * Sprint 2.1.6 — contract tests for the loading overlay. Tests focus
 * on the load-orchestration behavior (event subscription, short-
 * circuit, listener cleanup) rather than visual rendering — Phaser's
 * GameObject construction is mocked since the real Scene needs a
 * Canvas + WebGL context that's not available under vitest's jsdom
 * environment.
 *
 * The mocked scene shape mirrors what `attachLoadingOverlay` actually
 * reaches into (`scene.load`, `scene.scale`, `scene.add`, `scene.scene`,
 * `scene.input.keyboard`). Anything not exercised by the helper is
 * left undefined to flag accidental new dependencies via test failure.
 */

interface LoaderEventBag {
  handlers: Map<string, Array<(arg?: unknown) => void>>;
}

// `unknown` typing on the mocks intentionally avoids importing Phaser
// (which would trigger its OS bootstrap, see top-of-file comment).
// `attachLoadingOverlay`'s `scene` arg is `Phaser.Scene`-shaped — we
// cast the mock with `as unknown as never` indirection at the call
// site instead of pretending the mock IS a Phaser.Scene.
type MockLoader = {
  totalToLoad: number;
  on: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
};

function makeMockLoader(totalToLoad: number): {
  loader: MockLoader;
  events: LoaderEventBag;
} {
  const events: LoaderEventBag = { handlers: new Map() };
  const loader: MockLoader = {
    totalToLoad,
    on: vi.fn((evt: string, fn: (arg?: unknown) => void) => {
      const arr = events.handlers.get(evt) ?? [];
      arr.push(fn);
      events.handlers.set(evt, arr);
    }),
    once: vi.fn((evt: string, fn: (arg?: unknown) => void) => {
      const arr = events.handlers.get(evt) ?? [];
      arr.push(fn);
      events.handlers.set(evt, arr);
    }),
    off: vi.fn((evt: string, fn: (arg?: unknown) => void) => {
      const arr = events.handlers.get(evt) ?? [];
      events.handlers.set(
        evt,
        arr.filter((h) => h !== fn),
      );
    }),
  };
  return { loader, events };
}

type MockScene = {
  load: MockLoader;
  scale: { gameSize: { width: number; height: number } };
  add: { text: ReturnType<typeof vi.fn>; rectangle: ReturnType<typeof vi.fn> };
  scene: { isActive: ReturnType<typeof vi.fn>; restart: ReturnType<typeof vi.fn> };
  input: { keyboard: { once: ReturnType<typeof vi.fn> } };
  __destroyedItems: string[];
};

function makeMockScene(loader: MockLoader): MockScene {
  // Spy on .add.text + .add.rectangle calls. Phaser's real GameObjects
  // need a Scene + display list; here we return stubs that record
  // `destroy()` calls so the test can assert cleanup happens.
  const destroyed: string[] = [];
  const makeStub = (label: string): { destroy: () => void; setOrigin: () => unknown; setStrokeStyle: () => unknown; setInteractive: () => unknown; on: () => unknown; setColor: () => unknown; width: number } => ({
    destroy: () => destroyed.push(label),
    setOrigin: () => makeStub(label),
    setStrokeStyle: () => makeStub(label),
    setInteractive: () => makeStub(label),
    on: () => makeStub(label),
    setColor: () => makeStub(label),
    width: 0,
  });
  const scene = {
    load: loader,
    scale: { gameSize: { width: 1280, height: 720 } },
    add: {
      // We don't import the text helper — it calls scene.add.text internally.
      // The helper called by LoadingOverlay (via @/game/ui/typography) ends
      // up calling scene.add.text(...) so this stub catches it.
      text: vi.fn(() => makeStub('text')),
      rectangle: vi.fn(() => makeStub('rectangle')),
    },
    scene: { isActive: vi.fn(() => true), restart: vi.fn() },
    input: { keyboard: { once: vi.fn() } },
    __destroyedItems: destroyed,
  };
  return scene;
}

// `attachLoadingOverlay` expects a Phaser.Scene; our mock is shape-
// compatible. Cast via `unknown` to silence the structural mismatch
// (we'd need `as never` -> `as Phaser.Scene` to bypass without
// importing Phaser).
function asScene<T>(mock: T): never {
  return mock as unknown as never;
}

describe('attachLoadingOverlay', () => {
  it('short-circuits when totalToLoad === 0 (no listeners, no GameObjects)', () => {
    const { loader, events } = makeMockLoader(0);
    const scene = makeMockScene(loader);

    attachLoadingOverlay({ scene: asScene(scene) });

    // No event handlers registered.
    expect(events.handlers.size).toBe(0);
    // No GameObjects created.
    expect((scene.add.text as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    expect((scene.add.rectangle as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
  });

  it('attaches progress + complete + loaderror listeners when totalToLoad > 0', () => {
    const { loader, events } = makeMockLoader(5);
    const scene = makeMockScene(loader);

    attachLoadingOverlay({ scene: asScene(scene) });

    // Phaser's event constants map to lowercase strings:
    //   PROGRESS = 'progress', COMPLETE = 'complete',
    //   FILE_LOAD_ERROR = 'loaderror'.
    expect(events.handlers.has(EVT_PROGRESS)).toBe(true);
    expect(events.handlers.has(EVT_COMPLETE)).toBe(true);
    expect(events.handlers.has(EVT_FILE_LOAD_ERROR)).toBe(true);
    // 1 label + 1 rectangle bg + 1 rectangle fill = 3 GameObjects.
    expect((scene.add.text as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
    expect((scene.add.rectangle as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });

  it('on COMPLETE removes the PROGRESS + FILE_LOAD_ERROR listeners (no leak)', () => {
    const { loader, events } = makeMockLoader(3);
    const scene = makeMockScene(loader);

    attachLoadingOverlay({ scene: asScene(scene) });
    // Fire COMPLETE.
    const completeHandlers = events.handlers.get(EVT_COMPLETE) ?? [];
    for (const h of completeHandlers) h();

    // The off() calls inside the COMPLETE handler removed our progress
    // + loaderror listeners. The handler arrays should now be empty.
    expect(events.handlers.get(EVT_PROGRESS)).toEqual([]);
    expect(events.handlers.get(EVT_FILE_LOAD_ERROR)).toEqual([]);
  });

  it('on COMPLETE destroys the rendered GameObjects when no errors', () => {
    const { loader, events } = makeMockLoader(3);
    const scene = makeMockScene(loader);

    attachLoadingOverlay({ scene: asScene(scene) });
    const destroyed = (scene as unknown as { __destroyedItems: string[] }).__destroyedItems;
    // Pre-complete: nothing destroyed.
    expect(destroyed.length).toBe(0);

    // Fire COMPLETE (no loaderror events fired = failedCount stayed 0).
    const completeHandlers = events.handlers.get(EVT_COMPLETE) ?? [];
    for (const h of completeHandlers) h();
    // label + bg + fill = 3 destroys.
    expect(destroyed.length).toBe(3);
  });

  it('COMPLETE short-circuits when scene is no longer active (mid-load shutdown)', () => {
    const { loader, events } = makeMockLoader(3);
    const scene = makeMockScene(loader);
    // Simulate scene shutdown between attach and COMPLETE.
    (scene.scene.isActive as ReturnType<typeof vi.fn>).mockReturnValue(false);

    attachLoadingOverlay({ scene: asScene(scene) });
    const destroyed = (scene as unknown as { __destroyedItems: string[] }).__destroyedItems;
    const completeHandlers = events.handlers.get(EVT_COMPLETE) ?? [];
    for (const h of completeHandlers) h();

    // Listeners still removed (those run BEFORE the isActive check)…
    expect(events.handlers.get(EVT_PROGRESS)).toEqual([]);
    // …but no destroy() calls on already-defunct GameObjects.
    expect(destroyed.length).toBe(0);
  });
});
