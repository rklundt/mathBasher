# Contributing to mathBasher

> **Bug reports and ideas are welcome now.** See the first section below; anyone can send them.
>
> ⚠ **Status: code contributions are not yet open.**
>
> mathBasher is in early development and authored solely by the copyright holder. The Contributor License Agreement (CLA) mechanism that the dual-license model requires is **not yet in place**. Until that lands, third-party pull requests will be politely declined.
>
> This file exists as a placeholder so the contribution workflow is visible early. Watch the repository or check back here for the "open" announcement.

## Found a bug or have an idea? (anyone can do this)

You don't need to sign anything or know how to code.

- **Something's not working:** open the [bug report form](https://github.com/rklundt/mathBasher/issues/new?template=bug.yml). It asks which game, math type, difficulty, device and browser, then what happened. A version or commit number isn't needed; add one only if you know it.
- **An idea:** use the [idea form](https://github.com/rklundt/mathBasher/issues/new?template=idea.yml). Kids' ideas are welcome, in their own words.
- **Please keep reports anonymous:** issues are public. Don't include a child's name, age, school or photos, and crop screenshots to the game screen.
- **A security problem:** don't post it publicly. See [SECURITY.md](SECURITY.md) for the private form.

## Code contributions (not open yet)

When third-party code contributions are accepted, this document will describe:

### 1. Contributor License Agreement (CLA)

Because mathBasher is dual-licensed (AGPL-3.0-or-later **and** a separate commercial license), every contributor must grant the copyright holder the right to relicense their contribution commercially. A plain "Signed-off-by" (DCO) line isn't enough on its own: it covers the AGPL, not the commercial license. The agreement will be settled, with legal advice, before any outside contribution is accepted. The current plan, subject to that review:

- **Ownership:** contributors assign the copyright in their contribution to the project's copyright holder, which keeps every file under one owner and one copyright line.
- **Contributors must be 18 or older.** Agreements signed by minors aren't reliably binding, so the project can't accept code from under-18s. (Bug reports and ideas from anyone, kids included, are welcome.)
- **Signing:** through a CLA bot on each pull request, with the project keeping its own copy of every signature.

See [COMMERCIAL.md](COMMERCIAL.md) for the dual-license context.

### 2. Code of conduct

All contributors are expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

### 3. SPDX headers and license headers

Every new source file (`.ts`, `.mjs`, `.html`, and `.yml` workflows, using that format's comment style) must start with:

```ts
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md
```

Modifying a file inherited from another AGPL/GPL project requires adding a `Modified <date> by <name>: <what>` line per AGPL §5.

### 4. Architectural rules

Contributions must respect the architecture documented in [docs/adrs/](docs/adrs/), notably:

- **Folder discipline** ([ADR-0006](docs/adrs/ADR-0006-folder-discipline.md)) — each folder imports only from the layers below it (the ADR has the full map). Phaser is imported only in `/src/game/` and `/src/app/boot.ts`; `/src/math/` and `/src/services/` are pure TypeScript with no DOM.
- **Configurability** ([ADR-0003](docs/adrs/ADR-0003-central-config-file.md)) — every gameplay number lives in `src/core/config.ts`. Magic numbers in code are not accepted.
- **UI attribution** ([ADR-0004](docs/adrs/ADR-0004-agpl-commercial-dual-license.md)) — the AGPL §7(b) attribution display is a hard architectural requirement; PRs may not weaken or remove it.

### 5. Branching and pull requests

- `main` is always green; merged via pull request after review.
- Feature work goes on a branch named `<type>/<short-description>` (e.g. `feat/multiplication-tables`, `fix/wave-spawn-race`).
- Commit messages follow conventional-commits style (feat / fix / chore / docs / refactor / test).
- Open a draft PR early to discuss approach before significant code is written.

### 6. Tests

- Pure modules under `/src/math/` and `/src/services/` need Vitest tests.
- Game logic under `/src/game/` is tested manually via the playtest checklist.
- `pnpm typecheck`, `pnpm test` and `pnpm build` must pass; the pull-request check runs them and must be green before merging.

### 7. Versioning

- See [VERSIONS.md](VERSIONS.md) for the versioning scheme (sprint id maps to release version).
- Contributors do not bump the version themselves; version bumps happen at sprint-close by the project maintainer.

### 8. License of contributions

By submitting a contribution, you confirm:

- You have the legal right to license your contribution under AGPL-3.0-or-later.
- You agree to the terms of the project's CLA (to be published here before contributions open), which permits the copyright holder to relicense your contribution commercially.

## Asking questions

Use the [idea form](https://github.com/rklundt/mathBasher/issues/new?template=idea.yml); a question is fine there too. The project maintainer answers when they can; response times are best-effort.
