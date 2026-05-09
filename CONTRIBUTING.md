# Contributing to mathBasher

> ⚠ **Status: contributions are not yet open.**
>
> mathBasher is in early development and authored solely by the copyright holder. The Contributor License Agreement (CLA) mechanism that the dual-license model requires is **not yet in place**. Until that lands, third-party pull requests will be politely declined.
>
> This file exists as a placeholder so the contribution workflow is visible early. Watch the repository or check back here for the "open" announcement.

## What this file will cover when contributions open

When third-party contributions are accepted, this document will describe:

### 1. Contributor License Agreement (CLA)

Because mathBasher is dual-licensed (AGPL-3.0-or-later **and** a separate commercial license), every contributor must grant the copyright holder the right to relicense their contribution commercially. The mechanism (CLA Assistant, DCO sign-off, or signed file) will be selected and documented before the first PR is accepted. See [COMMERCIAL.md](COMMERCIAL.md) for the dual-license context.

### 2. Code of conduct

All contributors are expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

### 3. SPDX headers and license headers

Every new source file (`.ts`, `.tsx`, `.html`) will be required to start with:

```ts
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md
```

Modifying a file inherited from another AGPL/GPL project requires adding a `Modified <date> by <name>: <what>` line per AGPL §5.

### 4. Architectural rules

Contributions must respect the architecture documented in [docs/adrs/](docs/adrs/), notably:

- **Folder discipline** ([ADR-0006](docs/adrs/ADR-0006-folder-discipline.md)) — `/src/game/` is the only folder that imports Phaser; `/src/math/` and `/src/services/` are pure TypeScript with no DOM.
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
- `npm run typecheck` and `npm run test` must pass before requesting review.

### 7. Versioning

- See [VERSIONS.md](VERSIONS.md) for the versioning scheme (sprint id maps to release version).
- Contributors do not bump the version themselves; version bumps happen at sprint-close by the project maintainer.

### 8. License of contributions

By submitting a contribution, you confirm:

- You have the legal right to license your contribution under AGPL-3.0-or-later.
- You agree to the terms of the project's CLA (mechanism TBD), which permits the copyright holder to relicense your contribution commercially.

## Reporting bugs (no CLA needed)

Bug reports are welcome from anyone, regardless of CLA status. Open an issue with:

- mathBasher version (commit SHA or release tag)
- Browser + device + OS
- Steps to reproduce
- What you expected vs what happened
- Screenshots if visual

For **security** issues, do not open a public issue. See [SECURITY.md](SECURITY.md).

## Asking questions

Open a GitHub Discussion (when enabled) or an issue tagged `question`. The project maintainer is the primary responder; response times are best-effort.
