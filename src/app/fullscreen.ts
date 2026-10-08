// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { _th, SeverityLevel, type TelemetryProps } from '@/core/telemetry';
import { isTouchPrimary } from '@/core/config';

/**
 * Sprint 2.5.2 (playtest follow-up) — on phones/tablets, go fullscreen on the
 * "Tap to play" tap.
 *
 * Why: the game is a fixed 16:9 canvas scaled to FIT, so on a phone in
 * landscape its WIDTH is set by the available HEIGHT. The browser's URL bar
 * and the OS status bar eat far more height than anything of ours; hiding
 * them gives the game roughly a quarter more width on Android Chrome.
 *
 * What is fullscreened: the WHOLE page (`document.documentElement`), never
 * just the canvas — the AGPL §7(b) attribution footer lives in the DOM below
 * the canvas and must stay visible in fullscreen too.
 *
 * Where it works: Android Chrome / most Android browsers, iPadOS Safari
 * (webkit-prefixed). iPhone Safari has no element fullscreen, so there it is
 * a silent no-op (the layout already keeps the game above the URL bar).
 * Desktop (mouse/trackpad primary) is skipped — no surprise fullscreen.
 *
 * Must be called synchronously inside the user gesture (the browser rejects
 * fullscreen requests that aren't), so `bootGame()` calls it first.
 */

/** The facts the decision depends on — injected so it's unit-testable without a DOM. */
export interface FullscreenEnv {
  /** Touch is the primary pointer (phone/tablet). */
  touchPrimary: boolean;
  /** The page is already fullscreen. */
  alreadyFullscreen: boolean;
  /** The browser exposes an element fullscreen API (standard or webkit). */
  canRequest: boolean;
  /** A user gesture is active (false for the dev `?autostart` path). */
  hasUserGesture: boolean;
}

export type FullscreenDecision =
  | 'request'
  | 'skip-not-touch'
  | 'skip-already-fullscreen'
  | 'skip-unsupported'
  | 'skip-no-gesture';

/** Pure decision: should we ask the browser for fullscreen right now? */
export function decideFullscreen(env: FullscreenEnv): FullscreenDecision {
  if (!env.touchPrimary) return 'skip-not-touch';
  if (env.alreadyFullscreen) return 'skip-already-fullscreen';
  if (!env.canRequest) return 'skip-unsupported';
  if (!env.hasUserGesture) return 'skip-no-gesture';
  return 'request';
}

type FullscreenCapableElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};
type FullscreenCapableDocument = Document & {
  webkitFullscreenElement?: Element | null;
};
type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: string) => Promise<void>;
};

/**
 * Request fullscreen (and a landscape lock) for the whole page on touch
 * devices. Never throws; every outcome is logged.
 */
export function requestMobileFullscreen(): void {
  _th.logToAi('requestMobileFullscreen Started', SeverityLevel.Information);

  const root = document.documentElement as FullscreenCapableElement;
  const doc = document as FullscreenCapableDocument;
  const decision = decideFullscreen({
    touchPrimary: isTouchPrimary(),
    alreadyFullscreen: Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement),
    canRequest:
      typeof root.requestFullscreen === 'function' || typeof root.webkitRequestFullscreen === 'function',
    // `userActivation` isn't in every browser; when absent, assume the
    // caller is the click handler (the browser rejects it otherwise anyway).
    hasUserGesture: navigator.userActivation?.isActive ?? true,
  });

  if (decision !== 'request') {
    const dict: TelemetryProps = {};
    dict['reason'] = decision;
    _th.logToAi('Fullscreen Skipped', SeverityLevel.Information, dict);
    _th.logToAi('requestMobileFullscreen Completed', SeverityLevel.Information);
    return;
  }

  const onFailure = (err: unknown): void => {
    const dict: TelemetryProps = {};
    dict['reason'] = err instanceof Error ? err.message : String(err);
    _th.logToAi('Fullscreen Failed', SeverityLevel.Warning, dict);
  };

  try {
    // `navigationUI: 'hide'` asks Android to hide its nav bar as well.
    const pending =
      typeof root.requestFullscreen === 'function'
        ? root.requestFullscreen({ navigationUI: 'hide' })
        : root.webkitRequestFullscreen?.();
    Promise.resolve(pending)
      .then(() => {
        _th.logToAi('Fullscreen Entered', SeverityLevel.Information);
        lockLandscape();
      })
      .catch(onFailure);
  } catch (err) {
    onFailure(err);
  }

  _th.logToAi('requestMobileFullscreen Completed', SeverityLevel.Information);
}

/**
 * Best-effort landscape lock (Android, and only while fullscreen). Where it's
 * unsupported (iOS) the portrait "turn your phone" overlay still applies.
 */
function lockLandscape(): void {
  const orientation = screen.orientation as LockableOrientation | undefined;
  orientation?.lock?.('landscape').catch(() => {
    // Unsupported or refused — expected on some devices; nothing to do.
  });
}
