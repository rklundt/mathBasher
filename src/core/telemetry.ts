// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Browser-side telemetry helper. Thin wrapper over the shared factory in
 * `src/shared/telemetry-core.ts`; this file just sets the runtime context
 * (`appLayer: 'web'`, `cloudRoleName: 'MathBasher.Web'`).
 *
 * Usage:
 *
 *   const dict: TelemetryProps = {};
 *   dict['gameId'] = 'alien-shoot';
 *   _th.logToAi('RoundStarted', SeverityLevel.Information, dict);
 *
 * App Insights browser SDK wiring will be added to the shared factory in a
 * later milestone; until then, this falls back to console output.
 */

import { makeTelemetry } from '@/shared/telemetry-core';

export {
  SeverityLevel,
  type TelemetryHelper,
  type TelemetryProps,
  type TelemetryPropName,
} from '@/shared/telemetry-core';

export const _th = makeTelemetry({
  appLayer: 'web',
  cloudRoleName: 'MathBasher.Web',
});
