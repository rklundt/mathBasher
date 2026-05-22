// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5183,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
    rollupOptions: {
      output: {
        // Split Phaser into its own chunk. Phaser is ~1 MB of the
        // bundle and changes only on a Phaser version bump; app code
        // changes every deploy. Separate chunks → returning users
        // re-download only the (smaller) app chunk on a normal deploy
        // instead of the whole ~1.59 MB. Also silences Rollup's
        // >500 KB single-chunk warning. Cache-header immutability
        // (the other half of the payoff) lands with the Azure CDN
        // setup in sprint 3.5.
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
});
