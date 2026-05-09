// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/**
 * Server-side telemetry helper. Thin wrapper over the shared factory in
 * `src/shared/telemetry-core.ts`; this file just sets the runtime context
 * (`appLayer: 'server'`, `cloudRoleName: 'MathBasher.Server'`).
 *
 * `tsconfig.server.json` includes both `server/src/**` and `src/shared/**`
 * with `rootDir: "."`, so cross-folder imports compile correctly and the
 * shared module ships at `server/dist/src/shared/telemetry-core.js` next to
 * `server/dist/server/src/...` after build.
 *
 * App Insights Node SDK wiring will be added to the shared factory in a later
 * milestone; until then, this falls back to console output (errors -> stderr).
 */

import { makeTelemetry } from '../../src/shared/telemetry-core.js';

export {
  SeverityLevel,
  type TelemetryHelper,
  type TelemetryProps,
  type TelemetryPropName,
} from '../../src/shared/telemetry-core.js';

export const _th = makeTelemetry({
  appLayer: 'server',
  cloudRoleName: 'MathBasher.Server',
});
