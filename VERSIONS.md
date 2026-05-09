# Versions

mathBasher uses **sprint id as version**: every closed sprint produces a release whose version equals its sprint id.

| Sprint | npm version | Notes |
| --- | --- | --- |
| `0.1` | `0.1.0` | Foundation scaffold |
| `0.2` | `0.2.0` | Math engine |
| ... | ... | ... |
| `0.7` | `0.7.0` | Foundation complete = MVP candidate |
| (cut MVP) | `1.0.0` | First publicly-tagged release after 0.7 closes (optional ceremonial bump) |
| `1.1` | `1.1.0` | First Phase 1 sprint (e.g. Add to 20) |
| `1.2` | `1.2.0` | ... |

Patch level (third digit) is reserved for hotfixes within a closed sprint. For example, a CSS regression fix shipping after `0.4.0` closes but before `0.5.0` opens is `0.4.1`.

## Conventions

- `package.json#version` is bumped to match the sprint id when a sprint Closes
- A new entry is prepended to the changelog below in the same commit
- Both updates land as part of the sprint-close workflow (not the human's job to remember by hand)
- Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) loosely — categories used as needed

## Changelog

<!-- New entries go ABOVE this comment, newest first. -->

## [Unreleased]

- Sprint 0.3 in planning. Will deliver the score store: `IScoreStore` interface, in-memory `SessionScoreStore`, `ScoreCalculator` (round-scoring math), and a factory so a future API-backed store is a drop-in replacement.

## [0.2.0] - 2026-05-09 — Math engine

The pure-TypeScript math content layer. After this release, the engine can produce `Question` objects (prompt + correct answer + 4 shuffled choices) for the Add-to-10 difficulty, with a registry that's ready to accept additional generators by adding files. First sprint with real test coverage in the repo (25 tests across 3 files).

### Added
- **`src/math/types.ts`** — `Question` and `QuestionGenerator` interfaces; `isStub` flag for placeholder generators; `defaultRng` re-exported for compatibility (it now lives in `src/math/rng.ts`).
- **`src/math/rng.ts`** — production RNG export (`Math.random` wrapped). Pulled out of `types.ts` so the types file holds only types.
- **`src/math/distractors.ts`** — `pickDistractors()` returns N distinct integers from `[min, max]` excluding `correct`; throws on impossible ranges. Defense-in-depth iteration cap + deterministic fill-from-pool fallback so adversarial / degenerate RNGs can't hang the loop. `shuffleAnswers()` Fisher-Yates with injectable RNG.
- **`src/math/generators/addTo10.ts`** — first real `QuestionGenerator`. `a` uniform in `[0, 10]`, `b` uniform in `[0, 10 - a]`, `correctAnswer = a + b`. Distractor count comes from `config.layout.targetLanes`.
- **`src/math/registry.ts`** — `Record<MathId, QuestionGenerator>` keyspace matched to `config.scoring.mathDifficulty`. Real `add-to-10` plus stubs for `add-to-20`, `sub-to-10`, `sub-to-20` that throw an actionable error on `.generate()`. `getGenerator(id)` and `getImplementedIds()` helpers.
- **`vitest.config.ts`** — `environment: 'node'`, includes `src/**` and `server/src/**`, `passWithNoTests: true`, v8 coverage, `@/*` alias mirrored from `vite.config.ts`.
- **`src/test-utils/mulberry32.ts`** — small seedable PRNG, test-only, used across all test files for deterministic randomness.
- **`pnpm test:coverage` script** + `@vitest/coverage-v8` devDep; HTML report at `coverage/index.html`.
- **`DeveloperGuide.md`** — high-level orientation file for engineers and tech leads. Project structure, conventions, build/run/test commands, license model, "where to look for what" navigation table. Top-of-file numbered Dev environment setup walkthrough plus a "Common first-run gotchas" troubleshooting table.
- **Tests:** 25 across `src/math/distractors.test.ts`, `src/math/generators/addTo10.test.ts`, `src/math/registry.test.ts` — including a 1000-sample seeded property test on the `addTo10` generator and explicit coverage of the defense-in-depth fallback path.

### Changed
- **Project-local pnpm install.** `.npmrc` now sets `store-dir=.pnpm-store` so the pnpm content store lives inside the project root rather than the user's home folder. Cloning to a USB stick or fresh machine produces an identical install regardless of any pre-existing global pnpm state.
- **`vite` upgraded** from `^5.2.0` to `^6.4.2`.
- **`vitest` upgraded** from `^1.5.0` to `^3.2.4` (plus matching `@vitest/coverage-v8`).
- **`pnpm.overrides`** added in `package.json` to dedupe transitive `vite` and `esbuild` to the patched lines (Vitest 3 still ships `vite@5.4.21` internally; override forces it to `^6.4.2`).
- **`@types/express`** pinned from `^5.0.0` to `^4.17.21` to match the actual `express ^4.19.2` runtime.
- **`Dockerfile`** runtime stage now also COPYs `LICENSE`, `NOTICE`, `README.md` for AGPL distribution compliance; previously had a duplicate `package.json` COPY (removed).
- **Express server** PORT validation: malformed values log a Warning and fall back to 8080 instead of allowing `NaN` to crash-loop the container. Friendly EADDRINUSE message + clean exit if the port is in use.
- **Shared telemetry core.** New `src/shared/telemetry-core.ts` holds the canonical `SeverityLevel` enum, `TelemetryHelper` interface, `TelemetryProps` / `TelemetryPropName` types, and `makeTelemetry(opts)` factory. Browser (`src/core/telemetry.ts`) and server (`server/src/telemetry.ts`) are now thin 8-line wrappers passing their `{appLayer, cloudRoleName}` context into the factory. ~50 lines of duplication eliminated; future App Insights SDK wiring lands once in the factory.
- **Typed telemetry property names.** Reserved property names (`gameId`, `mathId`, `speed`, etc.) are now codified as the `TelemetryPropName` TypeScript union in `src/shared/telemetry-core.ts`. IDE autocomplete suggests valid keys; object literals with typo'd keys fail typecheck.
- **Server build output path changed.** `tsconfig.server.json` now uses `rootDir: "."` so the server compiles shared modules alongside its own source. Output structure mirrors source: `pnpm start` and the Dockerfile `CMD` now invoke `server/dist/server/src/index.js` (was `server/dist/index.js`). Anyone wrapping `npm start` from outside this repo's `package.json` may need to update their command.

### Fixed
- **Two moderate dev-only CVEs cleared** (GHSA-4w7w-66w2-5vf9 Vite path traversal in dev server, GHSA-67mh-4wv8-2f99 esbuild dev server permissive CORS). Production runtime image was never affected. `pnpm audit` now reports zero vulnerabilities.
- **Vitest worker-cleanup hang on Windows** — Vitest 1.6 sometimes left worker threads alive after the test run completed, requiring manual termination. Vitest 3 handles this correctly.

### Notes
- Disk size after first install is ~2.3GB; Phaser ships its full source in the npm package. Production image is unaffected (only `dist/` and `server/dist/` reach the runtime stage).
- Community-standards files (`SECURITY.md`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`) landed alongside the v0.0.0 baseline. They've been live throughout 0.1 and 0.2 but the formal release notes are recorded here for completeness.

## [0.1.0] - 2026-05-09 — Scaffold

The empty playable shell. After this release, `pnpm dev` shows a Phaser canvas with "mathBasher" centered, `pnpm start` (after `pnpm build`) serves the production bundle on port 8080 with `/health` returning 200, and `docker build .` produces an Azure-ready container image.

### Added
- **Build toolchain** — Vite + TypeScript (strict, project references), with `@/*` path alias to `src/`. Pinned to **pnpm 9.15.0** via Corepack.
- **Phaser 3** rendering layer; `BootScene` renders the project name on a 1280x720 design canvas with `Phaser.Scale.FIT` scaling.
- **Folder layout** — `src/{game,math,services,core}`, `public/assets/`, `server/src/{routes}`. Empty folders anchored by `.gitkeep`.
- **Central config** at `src/core/config.ts` — every gameplay knob (round, scoring, hero, layout, speed table, math difficulty multipliers) in one place. Derived `MathId` and `SpeedKey` types.
- **Telemetry helper** (`_th.logToAi(...)` with `SeverityLevel` enum) for both browser and server. `cloudRoleName` placeholders distinguish `MathBasher.Web` from `MathBasher.Server`. Console fallback when no App Insights connection string is configured.
- **Express server** — Node 20, ESM. Reads `PORT` from env (default 8080) with validation; binds `0.0.0.0`; mounts `/health` before static + SPA fallback; graceful SIGTERM/SIGINT with 30s grace; friendly EADDRINUSE handling.
- **Multi-stage Dockerfile** — `node:20-alpine` for both stages, `EXPOSE 8080`, runs as non-root `node` user, `HEALTHCHECK` probing `/health`. Runtime stage ships `LICENSE`, `NOTICE`, `README.md` for AGPL distribution compliance.
- **Hardened `.dockerignore`** — excludes secrets (`.env`, `*.pem`, `*.key`, `secrets/`, etc.), build artifacts, internal workspace, tests; explicit allowlist for public-facing files.
- **`.env.example`** documenting `PORT`, `BUILD_HASH`, `APPINSIGHTS_CONNECTION_STRING`, `VITE_SOURCE_URL`.
- **`src/core/attribution.ts`** — single source of truth for the AGPL §7(b) UI attribution text. Reads `VITE_SOURCE_URL` at build time with a deliberately invalid placeholder fallback so misconfigured deploys surface immediately.
- **SPDX `AGPL-3.0-or-later` header** on every new source file.
- **Repo polish** — README updated with prerequisites (Node 20+, pnpm 9+ via Corepack), run-locally + production-style steps, accurate flat-layout structure tree, and Windows + macOS/Linux commands for `.env` setup.

### Notes
- pnpm uses `node-linker=hoisted` (configured in `.npmrc`) for Windows compatibility — flat node_modules avoids pnpm's symlink/rename ENOENT issues on Windows file systems.
- The Vite production bundle is ~1.5MB unminified, ~340KB gzipped. Phaser is heavy; manual code-splitting deferred until it becomes a real concern.
- `@types/express` pinned to `^4.17.21` to match the actual `express ^4.19.2` runtime (avoids a future Express 5 / path-to-regexp v6 surprise).

## [0.0.0] - 2026-05-08 — Project skeleton

Initial planning and setup phase. No application code yet; this version establishes the project's legal, architectural, and process foundations.

### Added
- AGPL-3.0-or-later + Commercial dual license (`LICENSE`, `NOTICE`, `COMMERCIAL.md`)
- AGPL §7(b) UI attribution requirement, with architectural enforcement plan via a persistent `AttributionScene` (to be implemented in sprint 0.4)
- Project `README.md` and `VERSIONS.md`
- Third-party asset credits skeleton at `public/assets/CREDITS.md`
- Seven public Architecture Decision Records under `docs/adrs/`:
  - ADR-0001 Tech stack — Vite + TypeScript + Phaser 3
  - ADR-0002 Single-container deployment with Express server
  - ADR-0003 Single central config file for all gameplay tuning
  - ADR-0004 Dual license (AGPL + Commercial) with §7(b) UI attribution
  - ADR-0005 Sprint id is the release version
  - ADR-0006 Folder discipline (no Phaser in /math or /services)
  - ADR-0007 Azure App Service for Containers (over Container Apps)
- Repo hygiene: `.gitignore`, `.gitattributes` (LF normalization, binary marks), `.editorconfig`
- Initial directory structure for `public/assets/`
