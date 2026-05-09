// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import express from 'express';
import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { _th, SeverityLevel } from './telemetry.js';
import { healthRouter } from './routes/health.js';

/**
 * Express server. Serves the Vite-built static assets in production and exposes
 * /health for App Service container probes. Honors the project's Azure
 * deployment ground rules: PORT from env (default 8080), bind 0.0.0.0,
 * /health under 100ms, SIGTERM graceful with 30s grace, stdout-only logging.
 */

const DEFAULT_PORT = 8080;
function resolvePort(): number {
  const raw = process.env['PORT'];
  if (raw === undefined || raw === '') return DEFAULT_PORT;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
    _th.logToAi('serverBoot Warning', SeverityLevel.Warning, {
      reason: 'PORT env var is not a valid port number; falling back to default',
      raw,
      fallback: String(DEFAULT_PORT),
    });
    return DEFAULT_PORT;
  }
  return parsed;
}

const PORT = resolvePort();
const HOST = '0.0.0.0';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// server/dist/index.js -> ../../dist (the Vite client build)
const distDir = join(__dirname, '..', '..', 'dist');

function bootstrap(): void {
  const dict: Record<string, string> = {
    port: String(PORT),
    nodeVersion: process.version,
  };
  _th.logToAi('serverBoot Started', SeverityLevel.Information, dict);

  const app = express();

  // Health endpoint MUST be mounted before static so probes don't get caught by
  // the SPA fallback or any future static-cache middleware.
  app.use(healthRouter);

  // Static assets and SPA fallback.
  app.use(express.static(distDir));
  app.get('*', (_req, res) => {
    res.sendFile(join(distDir, 'index.html'));
  });

  const server: Server = createServer(app);

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      _th.logToAi('serverBoot Failed', SeverityLevel.Error, {
        reason: 'port in use',
        port: String(PORT),
      });
      // eslint-disable-next-line no-console -- final exit message MUST be visible
      console.error(`Port ${PORT} is already in use. Set PORT=<other> and retry.`);
      process.exit(1);
    }
    _th.logToAi('serverBoot Failed', SeverityLevel.Error, {
      reason: err.code ?? 'unknown',
      message: err.message,
    });
    process.exit(1);
  });

  server.listen(PORT, HOST, () => {
    _th.logToAi('serverBoot Completed', SeverityLevel.Information, {
      port: String(PORT),
      host: HOST,
    });
  });

  // Graceful shutdown — App Service sends SIGTERM on slot swaps and scale events.
  // Stop accepting new connections, let in-flight requests finish (cap at 30s).
  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    _th.logToAi('serverShutdown Started', SeverityLevel.Information, { signal });

    const forceTimer = setTimeout(() => {
      _th.logToAi('serverShutdown Forced', SeverityLevel.Warning, {
        signal,
        reason: 'in-flight requests exceeded 30s grace',
      });
      process.exit(1);
    }, 30_000);
    forceTimer.unref();

    server.close((err) => {
      clearTimeout(forceTimer);
      if (err) {
        _th.logToAi('serverShutdown Failed', SeverityLevel.Error, { signal, error: err.message });
        process.exit(1);
      } else {
        _th.logToAi('serverShutdown Completed', SeverityLevel.Information, { signal });
        process.exit(0);
      }
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap();
