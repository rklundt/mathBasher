# ADR-0005: Sprint id is the release version

**Status:** Accepted (2026-05-08)

## Context

mathBasher needs a version scheme that's understandable, traceable to work units, and compatible with npm (which assumes semver `MAJOR.MINOR.PATCH`).

Conventional semver assumes versions are about API compatibility ("breaking change → major bump"). For an internal product where versions are about WORK PROGRESS rather than API contracts, that signal is the wrong one.

## Decision

**`version = sprint id`.** Sprint 0.1 closes → `package.json#version = "0.1.0"`. Sprint 1.2 closes → `1.2.0`. Hotfixes within a closed sprint use the third digit (`0.1.0 → 0.1.1`).

`VERSIONS.md` (Keep-a-Changelog format) is updated as part of the sprint-close workflow, with a new entry for the closed sprint dated and summarized. `package.json` is bumped in the same commit.

Optional ceremonial bump to `1.0.0` after the foundation phase closes to mark the MVP cut.

## Consequences

- **Pro:** A user looking at version `0.4.0` can immediately trace it to the work unit that produced it.
- **Pro:** No subjective judgment about "was this a breaking change" — the version simply reflects which sprint produced it.
- **Pro:** Sprint-close automation handles the bump and changelog entry; no human bookkeeping.
- **Con:** Won't communicate "this is a breaking change" to dependents. Mitigated because (a) mathBasher isn't a library; (b) `VERSIONS.md` flags breaking changes inside the entry text.
- **Con:** First-time readers of `package.json` may be confused by the unusual scheme. Mitigated by `VERSIONS.md` documenting the convention up top.
- **Future:** If mathBasher ever ships a library or SDK, that artifact gets its own semver, separate from the app's sprint-id versioning.
