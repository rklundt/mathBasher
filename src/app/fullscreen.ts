// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { _th, SeverityLevel, type TelemetryProps } from '@/core/telemetry';
import { isTouchPrimary } from '@/core/config';

/**
 * Sprint 2.5.2 (playtest follow-up) — fullscreen on phones/tablets.
 *
 * Why: the game is a fixed 16:9 canvas scaled to FIT, so on a phone in
 * landscape its WIDTH is set by the available HEIGHT. The browser's URL bar
 * and the OS status bar eat far more height than anything of ours; hiding
 * them gives the game roughly a quarter more width on Android Chrome.
 *
 * Two entry points, one request path:
 *  - `requestMobileFullscreen()` — called first thing in the "Tap to play"
 *    click, so the game starts fullscreen.
 *  - `mountFullscreenButton()` — the footer's "Full screen" button, shown
 *    only on touch devices while NOT fullscreen, so a kid who left
 *    fullscreen (back gesture) can get back in.
 *
 * What is fullscreened: the WHOLE page (`document.documentElement`), never
 * just the canvas — the AGPL §7(b) attribution footer lives in the DOM below
 * the canvas and must stay visible in fullscreen too.
 *
 * Where it works: Android Chrome / most Android browsers, iPadOS Safari
 * (webkit-prefixed). iPhone Safari has no element fullscreen, so there both
 * entry points are silent no-ops and the button never appears. Desktop
 * (mouse/trackpad primary) is skipped — no surprise fullscreen, no button.
 *
 * Browsers only allow fullscreen inside a user gesture, so both entry points
 * must run synchronously inside a click.
 */

/** The facts the decisions depend on — injected so they're unit-testable without a DOM. */
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

/**
 * Pure decision: should the footer's "Full screen" button be visible?
 * Only on touch devices that support fullscreen, while not fullscreen, and
 * not while a request is still settling (avoids a flash of the button right
 * after "Tap to play").
 */
export function shouldShowFullscreenButton(
  env: Pick<FullscreenEnv, 'touchPrimary' | 'alreadyFullscreen' | 'canRequest'>,
  requestInFlight: boolean,
): boolean {
  return env.touchPrimary && env.canRequest && !env.alreadyFullscreen && !requestInFlight;
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

/** True while a fullscreen request is settling (drives the button's visibility). */
let requestInFlight = false;
/** Re-evaluates the button's visibility; set once the button is mounted. */
let syncButton: (() => void) | null = null;
/**
 * A fullscreen request that the browser never answers (seen in embedded
 * browsers) must not leave the button hidden forever: after this long with
 * no answer, treat the request as settled so the button comes back.
 */
const REQUEST_NO_RESPONSE_MS = 2500;

function readEnv(): FullscreenEnv {
  const root = document.documentElement as FullscreenCapableElement;
  const doc = document as FullscreenCapableDocument;
  return {
    touchPrimary: isTouchPrimary(),
    alreadyFullscreen: Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement),
    canRequest:
      typeof root.requestFullscreen === 'function' || typeof root.webkitRequestFullscreen === 'function',
    // `userActivation` isn't in every browser; when absent, assume the
    // caller is a click handler (the browser rejects it otherwise anyway).
    hasUserGesture: navigator.userActivation?.isActive ?? true,
  };
}

/**
 * Ask the browser to fullscreen the whole page, then try a landscape lock.
 * Never throws; every outcome is logged. `label` says which entry point.
 */
function enterFullscreen(label: string): void {
  const root = document.documentElement as FullscreenCapableElement;
  const props: TelemetryProps = {};
  props['label'] = label;

  let settled = false;
  let noResponseTimer: ReturnType<typeof setTimeout> | undefined;
  const settle = (): void => {
    if (settled) return;
    settled = true;
    clearTimeout(noResponseTimer);
    requestInFlight = false;
    syncButton?.();
  };
  const onFailure = (err: unknown): void => {
    const dict: TelemetryProps = { ...props };
    dict['reason'] = err instanceof Error ? err.message : String(err);
    _th.logToAi('Fullscreen Failed', SeverityLevel.Warning, dict);
    settle();
  };

  requestInFlight = true;
  syncButton?.();
  noResponseTimer = setTimeout(() => {
    if (settled) return;
    _th.logToAi('Fullscreen NoResponse', SeverityLevel.Warning, props);
    settle();
  }, REQUEST_NO_RESPONSE_MS);
  try {
    // `navigationUI: 'hide'` asks Android to hide its nav bar as well.
    const pending =
      typeof root.requestFullscreen === 'function'
        ? root.requestFullscreen({ navigationUI: 'hide' })
        : root.webkitRequestFullscreen?.();
    Promise.resolve(pending)
      .then(() => {
        _th.logToAi('Fullscreen Entered', SeverityLevel.Information, props);
        lockLandscape();
        settle();
      })
      .catch(onFailure);
  } catch (err) {
    onFailure(err);
  }
}

/**
 * "Tap to play" entry point: request fullscreen (and a landscape lock) for
 * the whole page on touch devices.
 */
export function requestMobileFullscreen(): void {
  _th.logToAi('requestMobileFullscreen Started', SeverityLevel.Information);

  const decision = decideFullscreen(readEnv());
  if (decision === 'request') {
    enterFullscreen('tapToPlay');
  } else {
    const dict: TelemetryProps = {};
    dict['reason'] = decision;
    _th.logToAi('Fullscreen Skipped', SeverityLevel.Information, dict);
  }

  _th.logToAi('requestMobileFullscreen Completed', SeverityLevel.Information);
}

/**
 * Wire the footer's "Full screen" button (`#app-footer-fullscreen` in
 * index.html). Shows it on touch devices while not fullscreen; a tap
 * re-enters fullscreen. Safe to call more than once; no-op if the button
 * isn't in the page.
 */
export function mountFullscreenButton(): void {
  _th.logToAi('mountFullscreenButton Started', SeverityLevel.Information);

  const button = document.getElementById('app-footer-fullscreen');
  if (!(button instanceof HTMLButtonElement) || button.dataset['mounted'] === '1') {
    _th.logToAi('mountFullscreenButton Completed', SeverityLevel.Information);
    return;
  }
  button.dataset['mounted'] = '1';

  syncButton = (): void => {
    button.hidden = !shouldShowFullscreenButton(readEnv(), requestInFlight);
  };
  // Any actual fullscreen change proves the pending request has settled.
  const onFullscreenChange = (): void => {
    requestInFlight = false;
    syncButton?.();
  };
  button.addEventListener('click', () => {
    _th.logToAi('FullscreenButton Clicked', SeverityLevel.Information, { label: 'footerButton' });
    enterFullscreen('footerButton');
  });
  // Covers entering/leaving fullscreen by ANY route (button, tap-to-play,
  // the back gesture, the browser's own exit).
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);
  syncButton();

  _th.logToAi('mountFullscreenButton Completed', SeverityLevel.Information);
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
