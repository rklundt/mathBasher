# ADR-0003: Single central config file for all gameplay tuning

**Status:** Accepted (2026-05-08)

## Context

mathBasher will balance constantly: descent speeds, scoring multipliers, pass thresholds, fire cooldowns, layout dimensions. If these values are scattered across game code, balancing means hunting through files and risking breaking gameplay rules elsewhere.

The user explicitly asked for "very configurable" — code that hard-codes gameplay numbers will block iteration.

## Decision

Every gameplay knob lives in **`src/core/config.ts`**, exported as a single `as const` object. No game code, scoring code, or system code may hard-code a tunable value. Magic numbers in code that should be in config are a hard violation flagged at every sprint-close architecture review.

## Consequences

- **Pro:** Balancing is editing one file, not hunting through entities/systems/scenes.
- **Pro:** Tests can read the same config, so changing a multiplier doesn't silently break tests that assumed the old value.
- **Pro:** The shape of `config.ts` becomes the de-facto "what's tunable" documentation.
- **Con:** Some "structural" numbers (loop indices, fixed array sizes derived from invariants) live as code constants and we have to judge what's tunable vs structural. Reviewer guidance: tunable = "we'd reasonably ever want to change this without changing logic"; structural = "changing it requires changing logic too."
- **Future:** When we add per-deployment overrides (e.g. classroom edition with a softer threshold), we layer an env-loaded override on top of `config` rather than forking the file.
