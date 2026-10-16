// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Exhaustiveness guard for `switch` statements over a union: put it in the
 * `default` branch and the compiler fails the build if a new case is added
 * but not handled. At runtime it only throws if an impossible value slips
 * through (e.g. from untyped data).
 */
export function assertNever(value: never, what = 'value'): never {
  throw new Error(`Unexpected ${what}: ${JSON.stringify(value)}`);
}
