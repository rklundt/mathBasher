// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  test: {
    // Math + services are pure TypeScript; no DOM, no jsdom needed.
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'server/src/**/*.{test,spec}.ts'],
    // Match the pattern used by `pnpm test` so behavior is consistent regardless
    // of how Vitest is invoked.
    passWithNoTests: true,
    // Hoist mocks above imports per Vitest convention.
    globals: false,
    // A few tests sample thousands of questions or import a module cold;
    // the 5 s default left little headroom on a busy machine or CI runner.
    testTimeout: 15_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Vitest 4 reports only files some test imports unless `include` lists
      // the sources, so untested files would silently drop out of the total.
      include: ['src/**/*.ts', 'server/src/**/*.ts'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/*.config.ts',
        'server/dist/**',
        'src/test-utils/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
