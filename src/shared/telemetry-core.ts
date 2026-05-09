// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Shared telemetry primitives. Both the browser-side helper
 * (`src/core/telemetry.ts`) and the server-side helper
 * (`server/src/telemetry.ts`) import from here.
 *
 * The runtime fallback writes structured records to stdout/stderr. When the
 * Application Insights wiring lands, the factory can be extended to also push
 * to App Insights using the same call shape, without touching either caller.
 */

export enum SeverityLevel {
  Verbose = 'Verbose',
  Information = 'Information',
  Warning = 'Warning',
  Error = 'Error',
  Critical = 'Critical',
}

/**
 * Reserved property names. Use these EXACT spellings when populating the
 * `props` dict — uniform names mean cross-event queries work later in App
 * Insights without massaging field names.
 *
 * Each property is a string-valued field that ends up in App Insights's
 * `customDimensions`. Numbers are stringified at the call site to match the
 * helper's `Record<string, string>` signature.
 */
export type TelemetryPropName =
  | 'gameId'
  | 'mathId'
  | 'speed'
  | 'questionIndex'
  | 'wasCorrect'
  | 'usedWrongShot'
  | 'roundScore'
  | 'roundCorrectCount'
  | 'passed'
  | 'sessionId'
  | 'disclaimerType'
  | 'route'
  | 'port'
  | 'host'
  | 'signal'
  | 'reason'
  | 'fallback'
  | 'raw'
  | 'message'
  | 'nodeVersion'
  | 'error';

/**
 * Strongly-typed telemetry props. Limits keys to the documented reserved set so
 * `dict['gameID']` (typo) fails to typecheck. The two automatic keys (appLayer
 * + cloudRoleName) are added by the helper itself, not by callers.
 */
export type TelemetryProps = Partial<Record<TelemetryPropName, string>>;

export interface TelemetryHelper {
  logToAi(eventName: string, severity: SeverityLevel, props?: TelemetryProps): void;
}

export interface TelemetryFactoryOpts {
  /** 'web' for the browser-side helper, 'server' for the Express side. */
  appLayer: 'web' | 'server';
  /** App Insights cloudRoleName, e.g. `'MathBasher.Web'` or `'MathBasher.Server'`. */
  cloudRoleName: string;
}

/**
 * Build a telemetry helper for a specific runtime context. The returned helper
 * writes records to stdout for Information/Verbose/Warning and to stderr for
 * Error/Critical. App Insights wiring (when added) layers ON TOP of this same
 * factory, so callers never change.
 */
export function makeTelemetry(opts: TelemetryFactoryOpts): TelemetryHelper {
  const { appLayer, cloudRoleName } = opts;
  return {
    logToAi(eventName, severity, props) {
      const enriched: Record<string, string> = {
        appLayer,
        cloudRoleName,
        ...(props ?? {}),
      };
      const isError =
        severity === SeverityLevel.Error || severity === SeverityLevel.Critical;
      // eslint-disable-next-line no-console -- the telemetry helper is the one allowed console site
      const channel = isError ? console.error : console.log;
      channel(`[telemetry] [${severity}] ${eventName}`, enriched);
    },
  };
}
