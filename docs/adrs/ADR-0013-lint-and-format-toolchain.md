# ADR-0013: ESLint + Prettier, committed git hooks, and a release-age guard

**Status:** Accepted (2026-10-16, sprint 2.6.4)
**Builds on:** [ADR-0006](ADR-0006-folder-discipline.md) (folder rules, now checked by lint), [ADR-0008](ADR-0008-ffmpeg-static-as-dev-dependency.md) / [ADR-0009](ADR-0009-sharp-as-dev-dependency.md) (one ADR per dev tool)

## Context

Until now the only automatic checks were `tsc`, Vitest and the production build, run in CI on pull requests. Folder discipline (ADR-0006), "no raw HTML" and "log through the telemetry helper" relied on review. Formatting was consistent by habit. The repo is public and will one day take outside contributions, so the rules need to be checked by tools, not only by review.

## Decision

1. **Dev dependencies** (all MIT, dev-only, never in the bundle, none with install scripts, so none are in `allowBuilds`):
   - `eslint` 10 and `@eslint/js`
   - `typescript-eslint` 8
   - `eslint-config-prettier` at **10.1.8 or later**: 10.1.6 / 10.1.7 were published with malware in 2025
   - `prettier` 3
2. **ESLint** (`eslint.config.js`, flat config):
   - **Rules:** `typescript-eslint`'s recommended type-aware set; ADR-0006's import rules per folder (`no-restricted-imports` on both `@/…` aliases and relative paths, with the two known exceptions scoped to exactly their files); no raw-HTML sinks (`innerHTML` / `outerHTML`, including `el['innerHTML']`, `insertAdjacentHTML`, `document.write`, `createContextualFragment`, `setHTMLUnsafe`, `parseFromString`, `srcdoc`) and no `eval` / `new Function`; no `console` in shipped code outside the telemetry helper.
   - **Two modes:** the full type-aware run (`pnpm lint`, in CI) takes about as long as a typecheck. The fast run (`MATHBASHER_LINT_FAST=1`) drops the type-aware rules and is used by the commit hook.
3. **Prettier** (`.prettierrc.json`: single quotes, 120 columns, matching `.editorconfig`; otherwise defaults). It formats code and config only, not Markdown, HTML, deploy workflows, infra or assets (`.prettierignore`).
   - The one-time repo-wide reformat lands as **its own pull request, merged with a merge commit**, and as its own release with no version bump (a tag only). A squash merge would bury the reformat inside other changes.
   - `.git-blame-ignore-revs` lists the reformat commit on development (the merge's second parent; `git blame` credits lines to it) and main's release commit. GitHub's blame view uses it automatically; locally it's passed per command (`--ignore-revs-file`). It is deliberately not set in git config, because git then fails to blame any checkout that lacks the file. The exact order is in sprint 2.6.4, D7.
   - `pnpm format:check` (CI) and the Prettier check in the commit hook start once the reformat is in.
4. **Committed git hooks in `.githooks/`.** `pnpm install` runs `scripts/install-hooks.mjs`, which sets `core.hooksPath` at local scope.
   - **No hook manager dependency.** It works on drives without symlinks (exFAT).
   - **Safe installs.** The script does nothing on CI, in the Docker build, or in a copy without `.git`, so an install there never fails.
   - **`pre-commit`:** fast ESLint on staged files.
   - **`commit-msg`:** no checks of its own; it passes the message to the machine-local checks.
   - **Machine-local checks.** Both hooks then run any `*.sh` in the gitignored `.githooks/local/` folder. The hooks refuse to run them if anything there is tracked by git (checked case-insensitively, since `.githooks/Local/` is the same folder on Windows), and CI fails if it is, or if any tracked path uses a Windows short name (`GITHOO~1/…`).
   - **Trust.** Committed hooks mean a checked-out branch runs its own hooks, lint config and `prepare` script. That's the same as any hook manager. Review untrusted pull requests on GitHub or in a throwaway clone, never by installing or committing on them locally.
   - **Missing local checks.** A clone can make them mandatory with `git config mathbasher.requireLocalChecks true`.
   - **Typecheck and tests stay in CI**, which keeps commits fast.
5. **Release-age guard.** pnpm's `minimumReleaseAge` is one day, so a package version published less than a day ago can't be installed, and a hijacked release is usually pulled before it lands here. pnpm also checks the lockfile against it, which is why it isn't longer. Urgent fixes go through `minimumReleaseAgeExclude` for that one update.
6. **CI.** The required check ("Typecheck, test, build", unchanged name) also runs `pnpm lint`, and `pnpm format:check` once the reformat has landed. Node comes from `.nvmrc`.

## Consequences

- **Pro:** ADR-0006, the no-raw-HTML rule and the logging rule are enforced on every pull request.
- **Pro:** Lint found and fixed real issues on day one:
  - `import.meta.env` was untyped, so the license footer's source link was typed `any`.
  - 103 needless non-null assertions.
  - Dead imports in the sprite scripts.
- **Note:** all five are MIT. Their dependencies are Apache-2.0, BSD, ISC and one BlueOak-1.0.0 (`minimatch`), all permissive and AGPL-compatible.
- **Con:** Five more dev dependencies to keep current, with a lockfile that changes more often. The release-age guard means a brand-new version waits a day.
- **Con:** Phaser's `on(event, fn, context)` API trips `unbound-method`, so that rule is off in `src/game/`. Phaser types `stopPropagation` as `Function`, so three call sites carry a one-line exception.
- **Revisit** if lint time in CI grows past a minute or two (cache the ESLint run), or when outside contributions open (the PR template already flags hook and config changes for review).
