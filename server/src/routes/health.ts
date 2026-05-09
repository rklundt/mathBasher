// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { Router, type Request, type Response } from 'express';

/**
 * GET /health — App Service container health probe.
 *
 * MUST return in under 100ms with no DB calls or external work. Read-only
 * uptime/version snapshot only. Never add awaited work to this handler.
 */
const startTimeMs = Date.now();

export const healthRouter = Router();

healthRouter.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    uptime: Math.round((Date.now() - startTimeMs) / 1000),
    version: process.env['BUILD_HASH'] ?? 'dev',
  });
});
