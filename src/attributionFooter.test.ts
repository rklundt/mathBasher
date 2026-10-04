// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX_HTML = readFileSync(resolve(__dirname, '..', 'index.html'), 'utf8');
const MAIN_SOURCE = readFileSync(resolve(__dirname, 'main.ts'), 'utf8');
const FOOTER_SOURCE = readFileSync(resolve(__dirname, 'game/ui/domAttributionFooter.ts'), 'utf8');

/**
 * Static contract test for the AGPL §7(b) attribution footer (sprint 2.5.2).
 *
 * The footer used to be a Phaser scene; it is now a DOM element in
 * `index.html`, filled at page load by `mountAttributionFooter()` from the
 * single source of truth in `src/core/attribution.ts`. The attribution
 * display is a license requirement (NOTICE §7(b)), so these string-scan
 * checks catch a "cleanup" that deletes the markup, stops mounting it, or
 * hard-codes the text — no DOM or Phaser needed (vitest runs in node).
 */
describe('AGPL attribution footer contract', () => {
  it('index.html contains the footer and both of its fill targets', () => {
    expect(INDEX_HTML).toMatch(/<footer[^>]*id="app-footer"/);
    expect(INDEX_HTML).toMatch(/id="app-footer-left"/);
    expect(INDEX_HTML).toMatch(/<a[^>]*id="app-footer-src"/);
  });

  it('the Source link opens safely in a new tab', () => {
    const link = INDEX_HTML.match(/<a[^>]*id="app-footer-src"[^>]*>/)?.[0] ?? '';
    expect(link).toContain('target="_blank"');
    expect(link).toContain('rel="noopener noreferrer"');
  });

  it('the footer is never truncated — no text-overflow/ellipsis on it', () => {
    const footerCss = INDEX_HTML.match(/#app-footer[^{]*\{[^}]*\}/g)?.join('\n') ?? '';
    expect(footerCss).not.toBe('');
    expect(footerCss).not.toMatch(/text-overflow/);
    expect(footerCss).not.toMatch(/display:\s*none|visibility:\s*hidden|opacity:\s*0[;\s]/);
  });

  it('main.ts mounts the footer at page load', () => {
    expect(MAIN_SOURCE).toMatch(/import\s*\{\s*mountAttributionFooter\s*\}/);
    // A top-level call (not nested in the splash click handler).
    expect(MAIN_SOURCE).toMatch(/^mountAttributionFooter\(\);/m);
  });

  it('the footer text comes from src/core/attribution.ts, not literals', () => {
    expect(FOOTER_SOURCE).toMatch(/from '@\/core\/attribution'/);
    expect(FOOTER_SOURCE).toMatch(/attribution\.productName/);
    expect(FOOTER_SOURCE).toMatch(/attribution\.copyrightLine/);
    expect(FOOTER_SOURCE).toMatch(/attribution\.licenseLine/);
    expect(FOOTER_SOURCE).toMatch(/attribution\.sourceUrl/);
    // Code only — the SPDX header + doc comments legitimately name the license.
    const code = FOOTER_SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/Ray Klundt|AGPL-3\.0-or-later/);
  });
});
