# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright 2026 Ray Klundt
# mathBasher is also available under a commercial license — see COMMERCIAL.md

# ---------- Build stage ----------
# Node 22: pnpm 11 (sprint 2.5.1) requires Node >= 22.13 (uses node:sqlite).
FROM node:22-alpine AS build
WORKDIR /app

# Enable Corepack and pin pnpm to the same version as packageManager in package.json
# so container builds match local builds exactly.
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

# Install build deps with the lockfile to keep builds reproducible.
# pnpm-workspace.yaml carries the settings pnpm 11 needs at install time
# (nodeLinker, overrides, allowBuilds) — must be present BEFORE the install.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# Copy sources and build both client (Vite -> dist/) and server (tsc -> server/dist/).
COPY tsconfig.json tsconfig.app.json tsconfig.server.json tsconfig.node.json vite.config.ts index.html ./
COPY src ./src
COPY server/src ./server/src
COPY public ./public

RUN pnpm build

# Trim devDependencies so the next stage can copy a lean node_modules.
RUN pnpm prune --prod

# ---------- Runtime stage ----------
# Node 22 to match the build stage + the engines.node >= 22.13 floor.
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# Bring the built artifacts and the production-pruned node_modules over.
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server/dist ./server/dist

# AGPL distribution requirement: ship the license + notices so anyone with the
# image (operator, auditor) can locate them without going back to the repo.
COPY LICENSE NOTICE README.md ./

# Run as non-root user (alpine ships a `node` user with uid 1000).
USER node

EXPOSE 8080

# App Service health check probe; matches the /health contract.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT:-8080}/health" >/dev/null || exit 1

CMD ["node", "server/dist/server/src/index.js"]
