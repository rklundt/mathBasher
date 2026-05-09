// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Telemetry helper. Same call shape used across the project.
 *
 *   const dict: Record<string, string> = {};
 *   dict['gameId'] = 'alien-shoot';
 *   _th.logToAi('RoundStarted', SeverityLevel.Information, dict);
 *
 * App Insights wiring is deferred to a later milestone. Until then, this falls
 * back to console.log with a structured prefix so events are visible in dev.
 *
 * Reserved property names (use these exact spellings so cross-event queries
 * work later in App Insights):
 *   gameId, mathId, speed, questionIndex, wasCorrect, usedWrongShot,
 *   roundScore, roundCorrectCount, passed, appLayer, sessionId
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

const APP_LAYER = 'web';

function consoleFallback(
  eventName: string,
  severity: SeverityLevel,
  props?: Record<string, string>,
): void {
  const enriched: Record<string, string> = { appLayer: APP_LAYER, ...(props ?? {}) };
  // eslint-disable-next-line no-console -- telemetry helper is the one allowed console site
  console.log(`[telemetry] [${severity}] ${eventName}`, enriched);
}

export const _th: TelemetryHelper = {
  logToAi(eventName, severity, props) {
    // Real App Insights wiring lands later; for now, console only.
    consoleFallback(eventName, severity, props);
  },
};
