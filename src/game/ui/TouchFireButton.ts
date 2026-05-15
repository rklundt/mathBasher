// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { config } from '@/core/config';
import { FONT_FAMILY } from '@/game/ui/typography';

export interface TouchFireButtonOpts {
  scene: Phaser.Scene;
  /** Called when the button is pressed. Routes through InputSystem.fire(). */
  onFire: () => void;
}

/**
 * Layout constants. These are anchored to the bottom-right of the design
 * canvas (1280×720). The AttributionScene footer is `attributionFooterHeightPx`
 * tall; the fire button sits ABOVE the footer with `footerClearancePx`
 * gap so the §7(b) attribution stays visible AND the button's hit-circle
 * doesn't bleed into the footer's Source-URL click zone (load-bearing
 * license constraint + a real bug caught in 0.6 wrap-up review).
 *
 * All values come from `config.layout` so a playtest-driven tweak is a
 * 1-line config edit, not a source change here.
 */
const FOOTER_HEIGHT = config.layout.attributionFooterHeightPx;
const FOOTER_CLEARANCE = config.layout.touchFire.footerClearancePx;
const RADIUS = config.layout.touchFire.radiusPx;
const HIT_PAD = config.layout.touchFire.hitPadPx;

/**
 * On-screen FIRE button for touch devices. Anchored to the bottom-right,
 * sized for one-handed thumb use in landscape, and gated by touch-capability
 * detection so desktop mouse+keyboard players never see it.
 *
 * Visibility rules (per sprint 0.6 Story 3 acceptance):
 *  - Hidden when `navigator.maxTouchPoints === 0` AND no touch input has
 *    ever been seen on the page.
 *  - Shown if EITHER condition flips — a Chromebook or Surface that reports
 *    touch capability AND a kid using a regular keyboard still gets the
 *    button (belt-and-braces). The first `touchstart` anywhere on the page
 *    flips the flag and reveals the button for the rest of the session.
 *
 * Pointer flow (per sprint 0.6 Story 4 acceptance):
 *  - The button's `pointerdown` handler stops event propagation so the
 *    canvas-wide `pointerdown` listener in `InputSystem` does NOT also fire.
 *    Without `stopPropagation`, a tap on the button would call `tryFire()`
 *    twice in the same frame (the second call would be a cooldown no-op,
 *    but still produces a wasted code path and unclear telemetry).
 *  - Behind that, `onFire()` calls `InputSystem.fire()` programmatically.
 *    Same code path as Space / mouse-click; cooldown applies.
 *
 * Lifecycle: instantiate from `GameScene.create`. Auto-destroys on scene
 * shutdown via the parent container's normal Phaser lifecycle.
 */
export class TouchFireButton extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Arc;
  private readonly label: Phaser.GameObjects.Text;
  private readonly removeTouchListener: () => void;

  constructor(opts: TouchFireButtonOpts) {
    const { scene } = opts;
    const { width: w, height: h } = scene.scale;
    const padding = config.layout.safeAreaPaddingPx;
    const x = w - padding - RADIUS;
    const y = h - FOOTER_HEIGHT - FOOTER_CLEARANCE - RADIUS;
    super(scene, x, y);
    scene.add.existing(this);

    // Warm amber fill matches the in-game prompt highlight color so the
    // button reads as part of the game's accent palette without screaming
    // for attention. White stroke gives it edge contrast against the dark
    // canvas. 0.85 alpha softens it slightly so it doesn't look painted-on.
    this.bg = scene.add.circle(0, 0, RADIUS, 0xfacc15, 0.85);
    this.bg.setStrokeStyle(3, 0xeaeaf2);

    this.label = scene.add
      .text(0, 0, 'FIRE', {
        fontFamily: FONT_FAMILY,
        fontSize: '18px',
        // Dark canvas-color text on warm amber gives ~10:1 contrast — well
        // above WCAG AAA (7:1) for large bold text.
        color: '#0b1020',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add([this.bg, this.label]);

    // Custom hit-area: a circle slightly larger than the visual bg, so a
    // sloppy thumb tap still registers. Using Phaser.Geom.Circle keeps the
    // hit zone properly circular (not the rectangular bounds of the bg).
    //
    // Sprint 0.7 wrap fix: the prior call used the 3-positional form
    // `(hitArea, callback, { useHandCursor })`, but Phaser's TS types
    // require `dropZone?: boolean` for the third positional arg — the
    // config-object form is the way to pass `useHandCursor`. Switched
    // to the single InputConfiguration form which carries hitArea,
    // hitAreaCallback, AND useHandCursor cleanly.
    this.bg.setInteractive({
      hitArea: new Phaser.Geom.Circle(0, 0, RADIUS + HIT_PAD),
      hitAreaCallback: Phaser.Geom.Circle.Contains,
      useHandCursor: true,
    });

    this.bg.on(
      'pointerdown',
      (
        _pointer: Phaser.Input.Pointer,
        _localX: number,
        _localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        // Carve-out (Story 4): block the canvas-wide pointerdown handler
        // in InputSystem from also receiving this event. We're going to
        // call InputSystem.fire() ourselves via opts.onFire() — letting
        // the canvas listener also fire would be a wasted cooldown attempt.
        event.stopPropagation();
        this.applyPressedVisual();
        opts.onFire();
      },
    );
    this.bg.on('pointerup', () => this.applyRestVisual());
    this.bg.on('pointerout', () => this.applyRestVisual());

    // Visibility gate. If `navigator.maxTouchPoints` is 0 at construction
    // time AND no touch event ever fires, stay hidden. The single
    // `touchstart` listener flips the flag on first touch (touchscreen
    // attached mid-session, or a touch laptop where the kid first uses
    // mouse then switches to touch). Once shown, stays shown.
    if (navigator.maxTouchPoints === 0) {
      this.setVisible(false);
      const onFirstTouch = (): void => {
        this.setVisible(true);
        this.removeTouchListener();
      };
      window.addEventListener('touchstart', onFirstTouch, { once: true });
      this.removeTouchListener = (): void => {
        window.removeEventListener('touchstart', onFirstTouch);
      };
    } else {
      this.removeTouchListener = (): void => {};
    }

    // Clean up the window-level touch listener when the scene unloads.
    scene.events.once('shutdown', () => this.removeTouchListener());
    scene.events.once('destroy', () => this.removeTouchListener());

    // Render above other game-layer entities so projectiles/aliens never
    // visually obscure the button. Phaser depth ordering: higher = drawn
    // later = on top. 1000 is well above any in-game entity depth.
    this.setDepth(1000);
  }

  private applyPressedVisual(): void {
    // Smaller + more opaque = "I'm being pressed." Snappy, no tween;
    // tweens delay the visual feedback by a frame and feel laggy on touch.
    this.bg.setScale(0.92);
    this.bg.setAlpha(1);
  }

  private applyRestVisual(): void {
    this.bg.setScale(1);
    this.bg.setAlpha(0.85);
  }
}
