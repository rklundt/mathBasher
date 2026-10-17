// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

// ESLint flat config (sprint 2.6.4, ADR-0013).
//
// Two modes:
//  - Full (CI, `pnpm lint`): typescript-eslint's type-aware rules, which need
//    the whole program and take about as long as a typecheck.
//  - Fast (`MATHBASHER_LINT_FAST=1`, used by the pre-commit hook): the same
//    rules minus the type-aware ones, so committing stays quick.
//
// The folder rules at the bottom enforce ADR-0006 (which folder may import
// which). Formatting is Prettier's job; `eslint-config-prettier` (last)
// switches off every rule that would fight it.

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

const FAST = process.env.MATHBASHER_LINT_FAST === '1';

/** Node globals for the build / pipeline scripts (no `globals` package needed). */
const NODE_GLOBALS = {
  process: 'readonly',
  console: 'readonly',
  Buffer: 'readonly',
  URL: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
};

/** Raw HTML injection is banned everywhere: the game renders text only. */
const NO_HTML_INJECTION = [
  {
    selector: "AssignmentExpression > MemberExpression.left[property.name=/^(innerHTML|outerHTML)$/]",
    message: 'Set textContent instead; raw HTML is not allowed (XSS).',
  },
  {
    selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
    message: 'Build DOM nodes or set textContent instead; raw HTML is not allowed (XSS).',
  },
];

/** ADR-0006: a folder imports only from the layers below it. */
const banImports = (patterns, paths = [], allowTypeImports = false) => ({
  '@typescript-eslint/no-restricted-imports': [
    'error',
    {
      paths: paths.map((name) => ({ name, message: 'ADR-0006: Phaser is only imported in src/game/ and src/app/boot.ts.', allowTypeImports })),
      patterns: patterns.map((group) => ({ group: [group], message: 'ADR-0006: this folder may not import from that layer.', allowTypeImports })),
    },
  ],
});

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'server/dist/**',
      'coverage/**',
      'node_modules/**',
      '.pnpm-store/**',
      'public/**',
      '.sprite-source/**',
      '.audio-source/**',
      'infra/**',
    ],
  },
  js.configs.recommended,
  ...(FAST ? tseslint.configs.recommended : tseslint.configs.recommendedTypeChecked),
  {
    // Fast mode skips the type-aware rules, so their disable comments look
    // unused there; the full run still reports genuinely stale ones.
    linterOptions: { reportUnusedDisableDirectives: FAST ? 'off' : 'error' },
    languageOptions: FAST
      ? {}
      : {
          parserOptions: {
            projectService: {
              // Files outside every tsconfig, linted with default options.
              allowDefaultProject: ['vitest.config.ts', 'eslint.config.js', 'server/src/*.test.ts'],
            },
            tsconfigRootDir: import.meta.dirname,
          },
        },
    rules: {
      'no-restricted-syntax': ['error', ...NO_HTML_INJECTION],
      // A `let` read by a closure before its one assignment can't be const.
      'prefer-const': ['error', { ignoreReadBeforeAssign: true }],
      // `_`-prefixed names mark intentionally unused parameters.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    // Shipped code logs through the telemetry helper (`_th`), never console.
    // The two allowed sites carry an eslint-disable line saying why.
    files: ['src/**/*.ts', 'server/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: { 'no-console': 'error' },
  },
  {
    // Phaser binds handlers through `on(event, this.method, this)`, passing
    // `this` explicitly, which this rule can't see. Elsewhere it stays on.
    files: ['src/game/**/*.ts'],
    rules: { '@typescript-eslint/unbound-method': 'off' },
  },
  {
    // Plain JS: build / pipeline scripts and this config. No type info.
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: NODE_GLOBALS, sourceType: 'module' },
  },

  // ----- ADR-0006 folder rules -------------------------------------------
  {
    files: ['src/shared/**/*.ts'],
    rules: banImports(['@/*'], ['phaser']),
  },
  {
    // core's `GameId` type import from services is a known exception (ADR-0006).
    files: ['src/core/**/*.ts'],
    rules: banImports(['@/math/*', '@/services/*', '@/game/*', '@/app/*'], ['phaser'], true),
  },
  {
    files: ['src/math/**/*.ts'],
    rules: {
      ...banImports(['@/services/*', '@/game/*', '@/app/*'], ['phaser']),
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'sessionStorage', 'navigator'],
    },
  },
  {
    files: ['src/services/**/*.ts'],
    ignores: ['src/services/audioManagerFactory.ts'], // known exception (ADR-0006)
    rules: banImports(['@/game/*', '@/app/*'], ['phaser']),
  },
  {
    files: ['src/game/**/*.ts'],
    rules: banImports(['@/app/*']),
  },
  {
    files: ['src/app/**/*.ts', 'src/main.ts'],
    ignores: ['src/app/boot.ts'],
    rules: banImports([], ['phaser']),
  },
  {
    files: ['server/**/*.ts'],
    rules: banImports(['@/game/*', '@/app/*'], ['phaser']),
  },

  prettier,
);
