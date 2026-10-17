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
const HTML_MSG = 'Set textContent or build DOM nodes instead; raw HTML is not allowed (XSS).';
const NO_HTML_INJECTION = [
  // el.innerHTML = …, el.outerHTML = …
  { selector: 'AssignmentExpression > MemberExpression.left[property.name=/^(innerHTML|outerHTML)$/]', message: HTML_MSG },
  // el['innerHTML'] = …
  { selector: 'AssignmentExpression > MemberExpression.left[computed=true][property.value=/^(innerHTML|outerHTML)$/]', message: HTML_MSG },
  // el.insertAdjacentHTML(…), range.createContextualFragment(…), el.setHTMLUnsafe(…), new DOMParser().parseFromString(…)
  {
    selector: 'CallExpression[callee.property.name=/^(insertAdjacentHTML|createContextualFragment|setHTMLUnsafe|parseFromString)$/]',
    message: HTML_MSG,
  },
  // iframe.srcdoc = …
  { selector: 'AssignmentExpression > MemberExpression.left[property.name="srcdoc"]', message: HTML_MSG },
  // document.write(…), document.writeln(…)
  { selector: "CallExpression[callee.object.name='document'][callee.property.name=/^(write|writeln)$/]", message: HTML_MSG },
];

/**
 * ADR-0006: a folder imports only from the layers below it. Each banned layer
 * is matched both as an alias (`@/game/…`) and as a relative path
 * (`../game/…`, `../../src/game/…`), since the server imports relatively.
 */
const LAYER_MSG = 'ADR-0006: this folder may not import from that layer (see the folder map).';
const layer = (name, allowTypeImports = false) => ({
  group: [`@/${name}/*`, `**/${name}/**`],
  message: LAYER_MSG,
  allowTypeImports,
});
const PHASER = { name: 'phaser', message: 'ADR-0006: Phaser is only imported in src/game/ and src/app/boot.ts.' };
const banImports = (patterns, { phaser = true } = {}) => ({
  '@typescript-eslint/no-restricted-imports': ['error', { paths: phaser ? [PHASER] : [], patterns }],
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
      // No running strings as code.
      'no-eval': 'error',
      'no-new-func': 'error',
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
  // Later blocks override earlier ones for the same file, so each known
  // exception is a narrow block right after its folder's rule.
  {
    files: ['src/shared/**/*.ts'],
    // Nothing from the app's other folders, by alias or by climbing out with '../'.
    rules: banImports([{ regex: '^(@/(?!shared/)|\\.\\./)', message: 'ADR-0006: src/shared/ imports nothing from the app.' }]),
  },
  {
    files: ['src/core/**/*.ts'],
    rules: banImports([layer('math'), layer('services'), layer('game'), layer('app')]),
  },
  {
    // Known exception (ADR-0006): these four take the `GameId` type from services.
    files: ['src/core/{assetScope,audioKeys,sceneKeys,spriteKeys}.ts'],
    rules: banImports([layer('math'), layer('services', true), layer('game'), layer('app')]),
  },
  {
    files: ['src/math/**/*.ts'],
    rules: {
      ...banImports([layer('services'), layer('game'), layer('app')]),
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'sessionStorage', 'navigator'],
    },
  },
  {
    files: ['src/services/**/*.ts'],
    rules: banImports([layer('game'), layer('app')]),
  },
  {
    // Known exception (ADR-0006): the factory wires in the Phaser-backed audio manager.
    files: ['src/services/audioManagerFactory.ts'],
    rules: banImports([
      // Any game/ import except that one module (alias or relative path).
      { regex: '(^@/|/)game/(?!services/PhaserAudioManager$)', message: LAYER_MSG },
      layer('app'),
    ]),
  },
  {
    files: ['src/game/**/*.ts'],
    rules: banImports([layer('app')], { phaser: false }),
  },
  {
    files: ['src/app/**/*.ts', 'src/main.ts'],
    ignores: ['src/app/boot.ts'],
    rules: banImports([]),
  },
  {
    files: ['server/**/*.ts'],
    rules: banImports([layer('game'), layer('app')]),
  },

  prettier,
);
