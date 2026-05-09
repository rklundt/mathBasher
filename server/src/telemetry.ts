// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Server-side telemetry helper. Mirrors the browser-side _th shape so the same
 * call sites work on either side. cloudRoleName placeholder is 'MathBasher.Server'
 * (the future App Insights wiring will use this to distinguish browser vs server
 * events in queries).
 *
 * App Insights wiring (the `applicationinsights` Node SDK) is intentionally not
 * installed yet; it lands later. Until then, this falls back to stdout/stderr
 * only.
 */
export enum SeverityLevel {
  Verbose = 'Verbose',
  Information = 'Information',
  Warning = 'Warning',
  Error = 'Error',
  Critical = 'Critical',
}

export interface TelemetryHelper {
  logToAi(
    eventName: string,
    severity: SeverityLevel,
    props?: Record<string, string>,
  ): void;
}

const APP_LAYER = 'server';
const CLOUD_ROLE_NAME = 'MathBasher.Server';

function consoleFallback(
  eventName: string,
  severity: SeverityLevel,
  props?: Record<string, string>,
): void {
  const enriched: Record<string, string> = {
    appLayer: APP_LAYER,
    cloudRoleName: CLOUD_ROLE_NAME,
    ...(props ?? {}),
  };
  const channel = severity === SeverityLevel.Error || severity === SeverityLevel.Critical
    ? console.error
    : console.log;
  channel(`[telemetry] [${severity}] ${eventName}`, enriched);
}

export const _th: TelemetryHelper = {
  logToAi(eventName, severity, props) {
    consoleFallback(eventName, severity, props);
  },
};
