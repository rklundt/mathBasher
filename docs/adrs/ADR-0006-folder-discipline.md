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
