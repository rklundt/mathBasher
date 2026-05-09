# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright 2026 Ray Klundt
# mathBasher is also available under a commercial license — see COMMERCIAL.md

# ---------- Build stage ----------
FROM node:20-alpine AS build
WORKDIR /app

# Install build deps with the lockfile to keep builds reproducible.
COPY package.json package-lock.json ./
RUN npm ci --no-fund --no-audit

# Copy sources and build both client (Vite -> dist/) and server (tsc -> server/dist/).
COPY tsconfig.json tsconfig.app.json tsconfig.server.json tsconfig.node.json vite.config.ts index.html ./
COPY src ./src
COPY server/src ./server/src
COPY public ./public

RUN npm run build

# ---------- Runtime stage ----------
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# Install ONLY production deps using the same lockfile.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-fund --no-audit && npm cache clean --force

# Bring the built artifacts over from the build stage.
COPY --from=build /app/dist ./dist
COPY --from=build /app/server/dist ./server/dist

# Run as non-root user (alpine ships a `node` user with uid 1000).
USER node

EXPOSE 8080

# App Service health check probe; matches the /health contract.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT:-8080}/health" >/dev/null || exit 1

CMD ["node", "server/dist/index.js"]
