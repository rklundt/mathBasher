# mathBasher — Developer Guide

A high-level orientation to the project for engineers and tech leads. Read this first; the code and inline comments are the source of truth for detail.

---

## What this project is

A **browser-based math game for kids**, modeled on the arcade-shooter feel of the classic *Math Blaster*. Aliens descend from the top of the screen carrying possible answers; the player times a fire button to hit the right one before the aliens reach the hero. It runs in any modern browser, is mobile-friendly in landscape, and is built so that **adding a new math difficulty or a new game mode means adding files, not changing the engine**.

## Core principles

1. **Configurable, not hard-coded.** Every gameplay number (descent speed, scoring multiplier, pass threshold, fire cooldown) lives in one config file. Balancing the game is editing numbers, not hunting through code.
2. **Modular by interface boundary.** The math engine, score store, audio manager, and rendering layer are separated by clear TypeScript interfaces. New math types = new generator file. New score backend = new `IScoreStore` implementation.
3. **Mobile-first.** Layouts assume landscape phone before they assume desktop. Touch controls are first-class.
4. **Kid-friendly feedback.** Wrong answers don't end the round. The hero respawns instantly. Round-level pass/fail is fair (70%) and clear.
5. **Polished without custom art.** Free CC0 sprite packs (Kenney.nl) plus the rendering engine's built-in particle/tween/shader effects.
6. **Future-proofed for accounts.** Session-only high scores in v1, behind an interface that supports a real backend later.

## What it is NOT

- Not a curriculum or learning management system
- Not a homework tracker or grade book
- Not a substitute for classroom math instruction
- Not a behavior management tool
- Not a place that shames wrong answers

---

## Architecture at a glance

```
+----------------------------------------------------------+
|  Browser (Vite-built static bundle)                      |
|                                                          |
|   +-----------+   +----------+   +---------+   +-----+   |
|   |  scenes   |<->| entities |<->| systems |<->| UI  |   |
|   +-----------+   +----------+   +---------+   +-----+   |
|        |                                                 |
|        v                                                 |
|   +-----------+   +----------+   +-----------+           |
|   |   math    |   | services |   |   core    |           |
|   | (pure TS) |   | (pure TS)|   | (config + |           |
|   +-----------+   +----------+   |telemetry +|           |
|                                  | constants)|           |
|                                  +-----------+           |
+--------------------|-------------------------------------+
                     |  HTTP
                     v
+----------------------------------------------------------+
|  Express server (Node 20)                                |
|                                                          |
|  - Serves /dist as static                                |
|  - GET /health for container probes                      |
|  - Future: API routes for persisted scores, accounts     |
+----------------------------------------------------------+
                     |
                     v  (production only)
+----------------------------------------------------------+
|  Single Linux container -> Azure App Service             |
|  (multi-stage Docker build, runs as non-root)            |
+----------------------------------------------------------+
```

Single repo, single deployable. The browser side and the server side share the same TypeScript toolchain and a single `package.json`.

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Build | Vite + TypeScript (strict, project references) | Fast HMR; strict typing matches the team's .NET background |
| Rendering | Phaser 3 | 2D arcade-game framework; scene system, sprites, input, scaling, audio all in one |
| UI | All Phaser scenes (no React) | One engine to reason about; consistent feel mobile↔desktop |
| State (cross-scene) | Plain TS singleton modules | No state library needed at this scale |
| Math | Pure TypeScript modules | No Phaser imports — unit-testable in isolation |
| Server | Express on Node 20 (ESM) | Tiny stub today; ready for API routes when accounts ship |
| Tests | Vitest | Co-located `*.test.ts` files; seeded RNGs for determinism |
| Container | Multi-stage Docker, `node:20-alpine` | Lean runtime, runs as non-root user |
| Deployment target | Azure App Service for Containers (Linux) | Mature, slot-swap blue/green, free managed TLS |
| Package manager | **pnpm 9** (Corepack-pinned) | Fast, deterministic, lockfile-enforced |

See `docs/adrs/` for the reasoning behind each major decision.

---

## Project layout (what lives where)

```
mathBasher/
├── README.md            run-locally instructions, license summary
├── DeveloperGuide.md    this file
├── LICENSE              GNU Affero General Public License v3
├── NOTICE               attribution clauses + AGPL §7(b) UI requirement
├── COMMERCIAL.md        commercial-license inquiry process
├── CONTRIBUTING.md      contribution workflow (CLA mechanism pending)
├── CODE_OF_CONDUCT.md   Contributor Covenant 2.1
├── SECURITY.md          vulnerability reporting flow
├── VERSIONS.md          changelog (Keep-a-Changelog format)
│
├── package.json         single package.json for client + server
├── pnpm-lock.yaml       deterministic dep tree (committed)
├── .npmrc               pnpm config: hoisted layout + LOCAL store
├── tsconfig.*.json      project-references split: app, server, node
├── vite.config.ts       Vite build settings (incl. @/* path alias)
├── vitest.config.ts     test runner config (node env, @ alias mirrored)
├── Dockerfile           multi-stage build for Azure deployment
├── .dockerignore        keeps secrets/internal artifacts out of image
├── .env.example         documents PORT, BUILD_HASH, APPINSIGHTS, SOURCE_URL
│
├── index.html           Vite entry HTML (the canvas mounts here)
│
├── src/                 BROWSER-SIDE TYPESCRIPT
│   ├── main.ts          entry; instantiates the game
│   ├── game/            rendering layer (the only folder that imports phaser)
│   │   ├── scenes/      Boot, Menu, GameSelect, Difficulty, Game, Hud, GameOver, Attribution
│   │   ├── entities/    Hero, Alien, Projectile (sprites with animation state)
│   │   ├── systems/     WaveSystem, InputSystem, HitSystem (own state, no rendering)
│   │   └── ui/          PlaceholderButton, TouchFireButton, etc.
│   ├── math/            PURE TS — math content (no DOM, no engine imports)
│   │   ├── types.ts             Question and QuestionGenerator interfaces
│   │   ├── distractors.ts       distractor-picking helpers
│   │   ├── registry.ts          map of MathId -> generator (real or stub)
│   │   └── generators/          one file per math difficulty
│   │       └── addTo10.ts
│   ├── services/        PURE TS — cross-cutting concerns (no engine imports)
│   │   ├── IScoreStore.ts       interface for high-score backends
│   │   ├── SessionScoreStore.ts in-memory implementation
│   │   ├── ScoreCalculator.ts   round scoring logic
│   │   ├── AudioManager.ts      audio facade (real impl lands in audio milestone)
│   │   └── Settings.ts          cross-scene selection state
│   └── core/            shared building blocks (other folders depend on this)
│       ├── config.ts            *the* gameplay tuning knobs (ALL of them)
│       ├── telemetry.ts         _th.logToAi(...) helper, console fallback
│       ├── attribution.ts       AGPL §7(b) UI text — single source of truth
│       └── sceneKeys.ts         scene identifier constants
│
├── public/              static assets served as-is by Vite
│   └── assets/          (CREDITS.md attribution ledger; sprites added later)
│
├── server/              EXPRESS SERVER for production
│   ├── src/
│   │   ├── index.ts             bootstraps Express; PORT-from-env, /health, SIGTERM
│   │   ├── telemetry.ts         server-side _th, mirrors browser shape
│   │   └── routes/
│   │       └── health.ts        GET /health (sub-100ms, no async work)
│   └── dist/                    compiled output (not committed)
│
├── dist/                Vite client build output (not committed)
│
├── docs/
│   └── adrs/            Architecture Decision Records
│       ├── README.md            ADR index + format
│       └── ADR-XXXX-*.md        one ADR per significant decision
│
└── .github/             repo metadata GitHub recognizes
    └── (workflow files added when CI/CD lands)
```

### Folder discipline (enforced)

- **`src/game/`** — the only folder that imports `phaser`. Visual concerns only.
- **`src/math/`** — pure TypeScript. No Phaser, no DOM, no `window`.
- **`src/services/`** — pure TypeScript. No Phaser. May read `localStorage`.
- **`src/core/`** — types and `config.ts`. No imports from `/game`, `/math`, or `/services` (it's at the bottom of the dependency arrow).
- **`server/`** — Express server. No imports from `/src/game`. May import from `/src/math` and `/src/services` if pure.

These boundaries are checked at every code review. Adding a Phaser import to `/src/math/` is a hard violation.

---

## Conventions you'll see throughout

### The central config file

`src/core/config.ts` is the single source of every gameplay knob:

```ts
config.round.questionsPerRound        // 20
config.round.passingCorrect           // 14
config.round.starThresholds           // [14, 17, 19]
config.scoring.basePerCorrect         // 100
config.scoring.afterWrongShotMultiplier // 0.5
config.scoring.mathDifficulty['add-to-10']  // 1.0 multiplier
config.scoring.speed.medium.descentPxPerSec // 60
config.hero.runSpeedPxPerSec          // 220
config.hero.fireCooldownMs            // 200
config.layout.targetLanes             // 4
```

**Code reads from `config`. Magic numbers in code are flagged at review.** Adding a new math type is a new key in `config.scoring.mathDifficulty` plus a new generator file — no engine changes.

### Telemetry pattern

Every meaningful action goes through one helper:

```ts
const dict: Record<string, string> = {};
dict['gameId'] = 'alien-shoot';
dict['mathId'] = 'add-to-10';
_th.logToAi('RoundStarted', SeverityLevel.Information, dict);
```

Browser and server use the same shape (different `cloudRoleName`). The helper falls back to structured `console.log` in dev when no Application Insights connection string is configured. Reserved property names are documented in `src/core/telemetry.ts`.

### Method-level entry/exit logging

Non-trivial functions log `Started` and `Completed` at the start and end of their work, with the same dict on both:

```ts
function startRound(mathId: string, speed: SpeedKey): void {
  const dict = { mathId, speed };
  _th.logToAi('startRound Started', SeverityLevel.Information, dict);
  // ... work ...
  _th.logToAi('startRound Completed', SeverityLevel.Information, dict);
}
```

### License header on every source file

```ts
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md
```

(HTML and shell files use the comment syntax of their host language.)

### Naming

- Classes / scenes: PascalCase (`GameScene`, `Hero`, `WaveSystem`)
- Value modules: camelCase (`addTo10.ts`, `distractors.ts`)
- Tests: co-located `*.test.ts` next to the source
- Scenes carry a `static readonly key` so other code refers to them by typed constant, not stringly typed

---

## Build, run, test

### Prerequisites

- **Node.js 20+**
- **pnpm 9+** (install via Corepack: `corepack enable && corepack prepare pnpm@9.15.0 --activate`)

### Quick reference

| Command | What it does |
|---|---|
| `pnpm install` | Install deps into the local `node_modules` and `.pnpm-store` |
| `pnpm dev` | Vite dev server with HMR (default `http://localhost:5173`) |
| `pnpm build` | Build client (Vite → `dist/`) and server (tsc → `server/dist/`) |
| `pnpm start` | Run the Express server against the built assets (port 8080 by default) |
| `pnpm test` | Run the Vitest suite once |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm typecheck` | tsc strict-mode check, no emit (client + server) |

### Local install is fully self-contained

`.npmrc` sets `store-dir=.pnpm-store`, so the pnpm content store lives inside the project directory rather than in the user's home folder. Cloning to a USB stick or fresh machine and running `pnpm install` produces an identical install regardless of any pre-existing global pnpm state. The `.pnpm-store` and `node_modules` directories are both gitignored and dockerignored.

---

## License model

mathBasher is **dual-licensed**:

1. **GNU Affero General Public License v3 or later (AGPL-3.0-or-later)** — the default. Anyone may use, modify, and redistribute under the AGPL terms, **including** the AGPL §7(b) requirement that the running app prominently display the project's attribution notice with a link to the corresponding source.
2. **Commercial license** — available from the copyright holder. Waives both the AGPL copyleft AND the §7(b) UI attribution requirement. See `COMMERCIAL.md` for the inquiry process.

The single source of truth for the UI attribution text is `src/core/attribution.ts`. The `AttributionScene` (added when the scene-flow layer lands) reads from there and renders the four-line block as a persistent footer on every interactive scene. The source URL is read from the `VITE_SOURCE_URL` environment variable at build time.

A deliberately invalid placeholder URL (`https://example.invalid/mathbasher`) is used when the env var is unset, so a misconfigured deployment surfaces immediately as a broken link.

---

## Where to look for what

| Question | Read |
|---|---|
| What is this project? | This file (top), README.md |
| How do I run it? | README.md "Run locally" |
| Where do gameplay numbers come from? | `src/core/config.ts` |
| How do I add a new math difficulty? | New file in `src/math/generators/`, register in `src/math/registry.ts`, add multiplier to `config.ts` |
| How do I add a new scene? | `src/game/scenes/<Name>Scene.ts`, register key in `src/core/sceneKeys.ts`, add to scene array in `src/main.ts` |
| What's the deployment target? | `docs/adrs/ADR-0007-azure-app-service-for-containers.md` |
| Why no React? | `docs/adrs/ADR-0001-tech-stack.md` |
| Why AGPL+commercial? | `docs/adrs/ADR-0004-agpl-commercial-dual-license.md` |
| Why is sprint id the version? | `docs/adrs/ADR-0005-sprint-id-as-version.md` |
| What runs in production? | `Dockerfile` build stage, `server/src/index.ts` runtime |
| What's the test strategy? | Pure modules in `/math` and `/services` get Vitest tests; gameplay code is verified by manual playtest |
| What's coming next? | `VERSIONS.md` `[Unreleased]` section |

---

## License

This guide is part of mathBasher and is licensed under the same terms — AGPL-3.0-or-later with the §7(b) UI attribution requirement, or under a separate commercial license. See `LICENSE`, `NOTICE`, and `COMMERCIAL.md`.
