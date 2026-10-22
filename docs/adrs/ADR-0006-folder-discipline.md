# ADR-0006: Folder discipline (no Phaser in /math or /services)

**Status:** Accepted (2026-05-08)

## Context

mathBasher will grow new math types and (eventually) new game modes. We want both to be additive — adding a math type should not require touching gameplay code; adding a game mode should not require rewiring the math engine.

The risk: as scenes need to "do one quick thing," they reach into systems, services, and math modules; over time the math layer accumulates Phaser imports for "convenience"; the boundary erodes; eventually a "small refactor" requires touching every file.

## Decision

Strict folder boundaries enforced by code review at every sprint close:

- `/src/game/` — the only folder that imports from `phaser`. Visual concerns only.
- `/src/math/` — pure TypeScript. No `phaser`, no DOM, no `window`.
- `/src/services/` — pure TypeScript. No `phaser`. May read `localStorage` (browser-only services live here, but they don't import Phaser).
- `/src/core/` — types and `config.ts`. No imports from `/game`, `/math`, or `/services` (it's at the bottom of the dependency arrow).
- `/server/` — Express server. No imports from `/src/game`. May import from `/src/math` and `/src/services` if pure.

Tests for `/math` and `/services` run in Vitest's `node` environment (not jsdom) — a contributor accidentally importing `window` will see the test fail before it ships.

## Consequences

- **Pro:** Adding a math type means a new file in `/math/generators/`, registering it in `/math/registry.ts`, and adding a multiplier entry to `config.ts`. No game code changes.
- **Pro:** Math and services are unit-testable without spinning up Phaser. Faster, more focused tests.
- **Pro:** When (if) we ever extract a piece for reuse (e.g. publish the math engine as a separate npm package), the boundaries are already clean.
- **Con:** Some "convenient" cross-cutting helpers can't live in any one place (e.g. a function that needs both Phaser and a service). Solution: it lives in `/game/` and calls into the service via the service's interface.
- **Con:** Review overhead — every sprint close cross-checks imports. Worth it; the cost of a single boundary breach (a Phaser type leaking into the math interface) is much higher than the review cost.

## Amendment (2026-10-16, sprint 2.6.3): the full folder map

Two folders grew up after this ADR and weren't listed. Here is the whole map, lowest layer first. A folder may import from the layers below it, never above.

| Folder | What lives there | May import |
|---|---|---|
| `/src/shared/` | Pure modules shared with the server (`telemetry-core.ts`, `assertNever.ts`). | nothing |
| `/src/core/` | Types, `config.ts`, sprite / audio / scene keys, telemetry wrapper, attribution text. | `shared` |
| `/src/math/` | Question generators. Pure: no `phaser`, no DOM, no `window`. | `core`, `shared` |
| `/src/services/` | Settings, scores, audio manager. No `phaser`; may read `localStorage`. | `core`, `math`, `shared` |
| `/src/game/` | Scenes, entities, systems, Phaser UI widgets. | everything above |
| `/src/app/` | The browser shell: `boot.ts` (constructs the Phaser game), `fullscreen.ts`, `attributionFooter.ts` (the DOM license footer). | everything above |

- **`src/main.ts`** is the entry point and the only importer of `/src/app/`. It must not import Phaser itself; `main.test.ts` enforces this, so the splash paints before the engine loads.
- **`/src/app/boot.ts`** is the one file outside `/src/game/` allowed to import `phaser`, because it constructs the game.
- **`/src/test-utils/`** is for tests only; production code never imports it.
- **`/server/`** may import `/src/shared/` and pure `/src/math/` / `/src/services/` modules, never `/src/game/` or `/src/app/`.

**Known exceptions today** (found while writing this map; allowed explicitly, file by file, in `eslint.config.js`):
- `services/audioManagerFactory.ts` imports `PhaserAudioManager` from `game/services/`. The factory is where the Phaser-backed implementation gets wired to the Phaser-free interface, so it belongs in `game` or `app`.

Since sprint 2.6.4 ESLint enforces this map in CI and in the commit hook (`no-restricted-imports` per folder, matching both `@/…` aliases and relative paths; see ADR-0013). The fix for the remaining exception, when convenient: move `audioManagerFactory.ts` into `game/services/`, which removes its exception block from the lint config. (The other one, `core` files taking the `GameId` type from `services`, was fixed in sprint 2.9.1: `GameId` now lives in `core/gameIds.ts`; ADR-0014.)
