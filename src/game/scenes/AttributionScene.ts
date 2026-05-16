// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { config } from '@/core/config';
import { SceneKeys } from '@/core/sceneKeys';
import { attribution, isUsingPlaceholderSourceUrl } from '@/core/attribution';
import { FONT_FAMILY, TEXT_PRIMARY, TEXT_BLUE } from '@/game/ui/typography';

/**
 * Persistent parallel scene that renders the AGPL §7(b) UI attribution footer
 * on every interactive scene. **Hard architectural requirement** of the dual
 * license model: removing or weakening this display violates §7(b) and the
 * project's contribution rules; the only legitimate way to omit the
 * attribution is to hold a separate commercial license, which doesn't apply
 * to the public/main branch.
 *
 * Lifecycle (load-bearing):
 *  - BootScene launches this scene exactly once after BootScene completes
 *    (see `src/main.ts` scene order — Attribution is registered LAST so it
 *    renders on top of everything).
 *  - This scene NEVER calls scene.stop on itself; no other code calls
 *    scene.stop on it either. It runs for the lifetime of the page.
 *  - The footer is anchored to the bottom edge of the canvas and overlays
 *    every other scene's content.
 *
 * Polish (real fonts, hover states on the source link, animated transitions)
 * is sprint 0.7's job; this scene's contract is just "the four lines from
 * `attribution.block` are visible, the source URL link works."
 */
export class AttributionScene extends Phaser.Scene {
  static readonly key = SceneKeys.Attribution;

  constructor() {
    super(AttributionScene.key);
  }

  create(): void {
    _th.logToAi('AttributionScene Started', SeverityLevel.Information);

    // Sprint 0.7 Story 13 (D9) — guardrail. If `VITE_SOURCE_URL` was
    // unset at build time, the §7(b) "Source: ..." link defaults to a
    // placeholder pointing at example.invalid (intentionally broken so
    // the misconfiguration surfaces visibly). Emit a Warning telemetry
    // event so the misconfiguration ALSO surfaces in App Insights — not
    // every operator will eyeball the rendered footer on a fresh deploy.
    if (isUsingPlaceholderSourceUrl) {
      _th.logToAi('AttributionScene PlaceholderSourceUrl', SeverityLevel.Warning, {
        reason: 'VITE_SOURCE_URL env var is unset; shipping with the placeholder example.invalid URL',
      });
    }

    const { width, height } = this.scale;
    // Footer height from config (load-bearing for §7(b) compliance + the
    // TouchFireButton's "above the footer" positioning). Centralized in
    // `config.layout.attributionFooterHeightPx` so a future redesign
    // automatically repositions every dependent widget.
    const footerHeight = config.layout.attributionFooterHeightPx;

    // Translucent dark backdrop strip so the attribution stays legible over
    // any scene's background, no matter how busy.
    const bg = this.add.rectangle(0, height - footerHeight, width, footerHeight, 0x000000, 0.55);
    bg.setOrigin(0, 0);

    // Three labels (productName + copyright + license) on the left, source
    // link on the right. Compact form so the footer doesn't eat too much
    // vertical space; sprint 0.7 will tune typography.
    const leftText = `${attribution.productName}  •  ${attribution.copyrightLine}  •  ${attribution.licenseLine}`;
    this.add
      .text(16, height - footerHeight / 2, leftText, {
        fontFamily: FONT_FAMILY,
        fontSize: '14px', // Sprint 0.7.5 Story 1 — was 12 (footer attribution)
        color: TEXT_PRIMARY,
      })
      .setOrigin(0, 0.5);

    const sourceLabel = this.add
      .text(width - 16, height - footerHeight / 2, `Source: ${attribution.sourceUrl}`, {
        fontFamily: FONT_FAMILY,
        fontSize: '14px', // Sprint 0.7.5 Story 1 — was 12 (footer attribution)
        color: TEXT_BLUE,
      })
      .setOrigin(1, 0.5);

    // Make the source URL clickable and open in a new tab.
    sourceLabel.setInteractive({ useHandCursor: true });

    // Sprint 0.7 Story 10 — hover state on the source link. Desktop
    // mouse-over (and touch tap-and-hold) lighten the text color from
    // `TEXT_BLUE` to a brighter shade + reveal an underline via a
    // hairline Rectangle anchored under the label. On pointerout the
    // hover state clears.
    //
    // §7(b) compliance unchanged: the text remains at full opacity at
    // ALL times (no hover dim, no fade-out), the source URL stays
    // visible and activatable.
    const labelBounds = sourceLabel.getBounds();
    const HOVER_COLOR = '#93c5fd'; // lighter than TEXT_BLUE for clear hover signal
    const underline = this.add
      .rectangle(
        sourceLabel.x,
        sourceLabel.y + labelBounds.height / 2 - 1,
        labelBounds.width,
        1,
        0x93c5fd,
      )
      .setOrigin(1, 0)
      .setVisible(false);
    sourceLabel.on('pointerover', () => {
      sourceLabel.setColor(HOVER_COLOR);
      underline.setVisible(true);
    });
    sourceLabel.on('pointerout', () => {
      sourceLabel.setColor(TEXT_BLUE);
      underline.setVisible(false);
    });

    sourceLabel.on('pointerup', () => {
      window.open(attribution.sourceUrl, '_blank', 'noopener,noreferrer');
    });

    _th.logToAi('AttributionScene Completed', SeverityLevel.Information);

    // Intentionally NO 'shutdown' handler that stops or hides the footer.
    // This scene runs for the lifetime of the page; that's the §7(b) contract.
  }
}
