// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import Phaser from 'phaser';
import { _th, SeverityLevel } from '@/core/telemetry';
import { SceneKeys } from '@/core/sceneKeys';
import { PlaceholderButton } from '@/game/ui/PlaceholderButton';
import { ToggleSwitch } from '@/game/ui/ToggleSwitch';
import { KeyboardNavigator, type Focusable } from '@/game/ui/KeyboardNavigator';
import { wireEscBack } from '@/game/ui/EscBackHandler';
import { text } from '@/game/ui/typography';
import { getAudioManager } from '@/services/audioManagerFactory';
import { AUDIO_KINDS, type AudioKind, type AudioManager } from '@/services/AudioManager';
import { Settings } from '@/services/Settings';

/**
 * Settings screen. Reachable from MenuScene and from PauseOverlay. Two
 * concerns share the panel: AUDIO settings (always present — volume
 * sliders for sfx / midground / music) and GAME settings (per-game-mode
 * options, visible only when the current round's game has any to show).
 *
 * Layout: vertical tab strip on the left (Audio + Game), content panel
 * on the right. Sprint 2.1 playtest pivot — previously a single long
 * scroll of every setting; adding the Asteroid Field "image asteroids"
 * toggle made the panel feel crammed on phones, so we split into tabs.
 * The Game tab is hidden entirely when the current game has no
 * settings (Alien Shoot today — Asteroid Field is the only game with
 * a Game-tab option in sprint 2.1).
 *
 * Launched as a parallel scene, NOT started in place: the caller passes
 * `onBack` via `init({ onBack })` and SettingsScene calls it when the
 * user clicks Back or presses Esc. From MenuScene the underlying scene
 * is Menu; from PauseOverlay the underlying scenes are Game + Hud +
 * PauseOverlay (in z-order). Either way SettingsScene knows nothing
 * about its caller.
 *
 * Design choices preserved from the pre-tab version:
 *  - Stepped −/+ volume buttons (not drag sliders) for keyboard
 *    accessibility, simple touch, kid-friendliness.
 *  - AudioManager is the single source of truth — every refresh reads
 *    `audio.getVolume(kind)` rather than mirroring locally.
 */
export interface SettingsSceneInit {
  /** Called when the user clicks Back or presses Esc. */
  onBack: () => void;
}

const STEP = 10; // 10% per button press
const MIN_VOLUME = 0;
const MAX_VOLUME = 100;

const KIND_LABELS: Readonly<Record<AudioKind, string>> = {
  sfx: 'Sound effects',
  // "Background sounds" reads more naturally to a younger user than the
  // technical "Background ambience" — same concept, plainer English.
  midground: 'Background sounds',
  music: 'Music',
};

/**
 * Tab identifier. Add a new tab here AND in `availableTabs()` below.
 * Today only `audio` is always present; `game` is conditionally added
 * when the current game has at least one game-specific setting.
 */
type TabId = 'audio' | 'game';

const TAB_LABELS: Readonly<Record<TabId, string>> = {
  audio: 'Audio',
  game: 'Game',
};

export class SettingsScene extends Phaser.Scene {
  static readonly key = SceneKeys.Settings;

  private onBack?: () => void;

  /**
   * Currently-visible tab. Defaults to 'audio' on every scene mount
   * — we don't preserve tab selection across open/close because the
   * panel is short-lived (modal-style) and a kid re-opening Settings
   * probably wants the same starting point each time.
   */
  private currentTab: TabId = 'audio';

  /**
   * Dynamic content for the active tab. Destroyed + rebuilt on tab
   * switch. Tracked so we can do that cleanly without touching the
   * tab strip / back button / title text (which persist across switches).
   */
  private tabContent: Phaser.GameObjects.GameObject[] = [];

  /**
   * Focusable controls inside the active tab's content panel.
   * Combined with `tabStripButtons` + the back button to rebuild the
   * KeyboardNavigator on every tab switch (so Tab/Shift+Tab/Enter
   * route to the visible controls only). Type widened from
   * PlaceholderButton[] to Focusable[] so the Game tab can mix in
   * `ToggleSwitch` (or future Focusables) without an extra cast.
   */
  private tabContentFocusables: Focusable[] = [];

  /** Tab-strip buttons. Persist across tab switches (just re-styled). */
  private tabStripButtons: Array<{ tab: TabId; button: PlaceholderButton }> = [];

  /** Back button — persists across tab switches. */
  private backButton: PlaceholderButton | null = null;

  /** Current keyboard navigator; destroyed + recreated on tab switch. */
  private navigator: KeyboardNavigator | null = null;

  constructor() {
    super(SettingsScene.key);
  }

  init(data: Partial<SettingsSceneInit>): void {
    this.onBack = data.onBack;
    if (typeof this.onBack !== 'function') {
      // `onBack` is logically required — without it, Back button + Esc both
      // become no-ops and the user is stranded on the Settings screen with
      // no way out. The init signature uses `Partial` to keep Phaser's
      // scene-data flexibility, so the type system can't enforce this.
      // Surface a Warning so a future caller who forgets onBack sees a clear
      // signal in the console + telemetry stream rather than a silent
      // dead-end UI.
      _th.logToAi('SettingsScene.initMissingOnBack', SeverityLevel.Warning, {
        reason: 'caller did not supply onBack',
      });
    }
    // Reset per-mount state. The scene instance is reused across
    // launches (Phaser scene-instance reuse gotcha), so class-field
    // initializers don't re-run.
    this.currentTab = 'audio';
    this.tabContent = [];
    this.tabContentFocusables = [];
    this.tabStripButtons = [];
    this.backButton = null;
    this.navigator = null;
  }

  create(): void {
    _th.logToAi('SettingsScene Started', SeverityLevel.Information);

    const { width, height } = this.scale;

    // Near-opaque backdrop so the scene underneath (Menu OR Pause)
    // is visually muted but still hints at "this is a modal on top
    // of that." 0.7 was too transparent — Pause Overlay's buttons
    // (Resume / Settings / Quit) bled through and competed with the
    // Settings panel content for the user's attention. 0.92 keeps a
    // subtle hint of background atmosphere without the visual noise.
    const backdrop = this.add.rectangle(0, 0, width, height, 0x000000, 0.92);
    backdrop.setOrigin(0, 0);

    // Title (persists across tab switches).
    text(this, width / 2, height * 0.10, 'Settings', 'h2').setOrigin(0.5);

    // Build the tab strip (left side, vertical column). Only tabs with
    // content are shown — Alien Shoot rounds get no Game tab today
    // because there are no game-specific options for it yet.
    this.buildTabStrip();

    // Back button (persists across tab switches, bottom center).
    this.backButton = new PlaceholderButton({
      scene: this,
      x: width / 2,
      y: height * 0.88,
      width: 200,
      height: 56,
      label: 'Back',
      onClick: () => this.handleBack(),
    });

    // Render the initial tab's content + wire keyboard nav.
    this.renderTabContent();

    // Esc closes Settings via the same path as the Back button.
    wireEscBack(this, () => this.handleBack());

    this.events.once('shutdown', () => {
      _th.logToAi('SettingsScene Completed', SeverityLevel.Information);
    });
  }

  // ----- Tab infrastructure --------------------------------------------------

  /**
   * Compute which tabs to show, in tab-strip order. Audio is always
   * present; Game appears only when the current game has at least one
   * game-specific setting. Adding a new game with settings = extend the
   * `hasGameSettings` switch.
   */
  private availableTabs(): TabId[] {
    const tabs: TabId[] = ['audio'];
    if (this.hasGameSettings()) tabs.push('game');
    return tabs;
  }

  /**
   * True when the current game has at least one game-specific setting
   * worth showing on the Game tab. Drives both tab-strip visibility
   * AND the per-game branch inside `renderGameTab` — keep the two in
   * sync (a tab that shows in the strip must render at least one
   * control when picked).
   */
  private hasGameSettings(): boolean {
    return Settings.round.gameId === 'asteroid-field';
  }

  /**
   * Build the left-side vertical tab strip. Each tab is a
   * PlaceholderButton whose `selected` chrome (amber border) marks
   * the active tab. Stored in `tabStripButtons` so renderTabContent
   * can re-style them on switch.
   */
  private buildTabStrip(): void {
    const { width, height } = this.scale;
    const tabs = this.availableTabs();
    // Vertical column on the left. Each tab is a wide-enough button
    // for kid touch targets (140×56). Stacked starting below the title.
    const tabX = width * 0.13;
    const tabYStart = height * 0.30;
    const tabGap = 72;
    for (let i = 0; i < tabs.length; i++) {
      const tabId = tabs[i]!;
      const btn = new PlaceholderButton({
        scene: this,
        x: tabX,
        y: tabYStart + i * tabGap,
        width: 160,
        height: 56,
        label: TAB_LABELS[tabId],
        selected: tabId === this.currentTab,
        onClick: () => this.switchTab(tabId),
      });
      this.tabStripButtons.push({ tab: tabId, button: btn });
    }
  }

  /**
   * Switch to a different tab. Clears the prior tab's content, rebuilds
   * for the new tab, and updates the tab-strip `selected` chrome.
   */
  private switchTab(next: TabId): void {
    if (next === this.currentTab) return;
    this.currentTab = next;
    // Update tab-strip selected chrome.
    for (const { tab, button } of this.tabStripButtons) {
      button.setSelected(tab === next);
    }
    this.renderTabContent();
    _th.logToAi('SettingsScene.switchTab', SeverityLevel.Information, {
      reason: next,
    });
  }

  /**
   * Tear down the prior tab's content + KeyboardNavigator, then render
   * the new tab's content and wire a fresh navigator with the union of
   * tab-strip + content + back buttons in tab order.
   */
  private renderTabContent(): void {
    // Tear down prior tab's GameObjects + navigator.
    for (const obj of this.tabContent) {
      obj.destroy();
    }
    this.tabContent = [];
    this.tabContentFocusables = [];
    if (this.navigator !== null) {
      this.navigator.destroy();
      this.navigator = null;
    }

    // Build new tab's content. Each renderer pushes onto
    // `tabContent` (game objects to destroy on next switch) and
    // `tabContentFocusables` (focusables to add to the navigator).
    if (this.currentTab === 'audio') {
      this.renderAudioTab();
    } else if (this.currentTab === 'game') {
      this.renderGameTab();
    }

    // Rebuild the navigator with the full focusable order:
    // tab strip first (left → right of the panel), then content
    // (top → bottom), then Back. Keyboard Tab cycles through this
    // entire set; clicking a tab swaps content but keeps tab-strip
    // focus position consistent.
    const focusables: Focusable[] = [
      ...this.tabStripButtons.map((t) => t.button),
      ...this.tabContentFocusables,
    ];
    if (this.backButton !== null) focusables.push(this.backButton);
    this.navigator = new KeyboardNavigator(this, focusables);
  }

  // ----- Audio tab content ---------------------------------------------------

  /**
   * Render the audio tab: section header + 3 volume rows centered in
   * the right-hand content panel. Layout matches the pre-tab version
   * shifted right to make room for the tab strip.
   */
  private renderAudioTab(): void {
    const { width, height } = this.scale;
    // Content is centered on the RIGHT-HAND area (left edge ~= 30%).
    // Use 60% width as the center for the audio rows.
    const cx = width * 0.60;
    const sectionLabel = text(this, cx, height * 0.22, 'Volume', 'sectionLabel').setOrigin(0.5);
    this.tabContent.push(sectionLabel);

    const audio = getAudioManager();
    const rowYStart = height * 0.36;
    const rowGap = height * 0.13;
    AUDIO_KINDS.forEach((kind, i) => {
      const rowY = rowYStart + i * rowGap;
      const buttons = this.renderVolumeRow(audio, kind, cx, rowY);
      this.tabContentFocusables.push(...buttons);
    });
  }

  /**
   * Render one volume row: label on the left, then `−` button, percent
   * value, `+` button as a horizontal group centered on `cx`. Returns
   * the two buttons in tab order so the caller can assemble the full
   * KeyboardNavigator order across all rows + Back.
   *
   * The button onClicks read AudioManager via getter (NOT a captured
   * value at render time) so the latest live value is always used —
   * matters because mute or another control could change state between
   * renders.
   */
  private renderVolumeRow(
    audio: AudioManager,
    kind: AudioKind,
    cx: number,
    y: number,
  ): PlaceholderButton[] {
    // TextKind 'rowLabel' — 26px primary, the canonical settings-row
    // label sizing (Sprint 0.7.5 Story 3). Origin (0, 0.5) for left
    // alignment relative to the slider controls to its right.
    const label = text(this, cx - 240, y, KIND_LABELS[kind], 'rowLabel').setOrigin(0, 0.5);
    this.tabContent.push(label);

    // Percent text — declared first so the closures below can update it.
    // Standard 'accent' kind matches the 28px bold amber treatment.
    const percentText = text(this, cx + 100, y, `${audio.getVolume(kind)}%`, 'accent');
    percentText.setOrigin(0.5);
    this.tabContent.push(percentText);

    // Minus button on the left of the percent.
    const minusBtn = new PlaceholderButton({
      scene: this,
      x: cx + 30,
      y,
      width: 56,
      height: 56,
      label: '−',
      disabled: audio.getVolume(kind) <= MIN_VOLUME,
      onClick: () => {
        const next = Math.max(MIN_VOLUME, audio.getVolume(kind) - STEP);
        audio.setVolume(kind, next);
        refresh();
      },
    });

    // Plus button on the right of the percent.
    const plusBtn = new PlaceholderButton({
      scene: this,
      x: cx + 170,
      y,
      width: 56,
      height: 56,
      label: '+',
      disabled: audio.getVolume(kind) >= MAX_VOLUME,
      onClick: () => {
        const next = Math.min(MAX_VOLUME, audio.getVolume(kind) + STEP);
        audio.setVolume(kind, next);
        refresh();
      },
    });

    // Buttons go on tabContent for destroy tracking AND tabContentFocusables
    // for keyboard navigation. PlaceholderButton implements its own
    // destroy hookup; tracking here means tab-switch cleanup catches
    // everything uniformly.
    this.tabContent.push(minusBtn, plusBtn);

    // Refresh both the percent text and the disabled state of −/+ after
    // any volume change. AudioManager is the source of truth so we re-
    // read getVolume rather than tracking a local copy.
    const refresh = (): void => {
      const v = audio.getVolume(kind);
      percentText.setText(`${v}%`);
      minusBtn.setDisabled(v <= MIN_VOLUME);
      plusBtn.setDisabled(v >= MAX_VOLUME);
    };

    return [minusBtn, plusBtn];
  }

  // ----- Game tab content ----------------------------------------------------

  /**
   * Render the game tab. Branches by `gameId` so each game mode owns
   * its own option set. Today only `asteroid-field` has any game
   * settings (the image-asteroids toggle); other games either don't
   * appear in the tab strip at all (Alien Shoot — `hasGameSettings()`
   * returns false) or render an empty panel here (placeholder).
   */
  private renderGameTab(): void {
    const { width, height } = this.scale;
    const cx = width * 0.60;
    if (Settings.round.gameId === 'asteroid-field') {
      const sectionLabel = text(this, cx, height * 0.22, 'Asteroid Field', 'sectionLabel').setOrigin(0.5);
      this.tabContent.push(sectionLabel);
      this.renderAsteroidImageToggleRow(cx, height * 0.42);
    }
  }

  /**
   * Image-asteroid toggle row. Layout per playtest pass 2:
   *  - Toggle switch on the LEFT (so the eye lands on the actionable
   *    control first; a kid scanning for "where do I click?" sees the
   *    pill switch before they read the label).
   *  - Generous gap (~40px) between switch and label so they don't
   *    crowd visually.
   *  - Label on the RIGHT, LEFT-justified (origin 0, 0.5) so changing
   *    text widths don't shift the layout left/right as the value
   *    flips between "Asteroid Images" and "Rendered Asteroids".
   *
   * Label describes the CURRENT visual state:
   *  - ON  → "Asteroid Images"   (you're seeing image rocks now)
   *  - OFF → "Rendered Asteroids" (you're seeing polygon rocks now)
   *
   * Both the label and the switch are tracked: the label as
   * tabContent (for tab-switch cleanup) and the switch additionally
   * as tabContentFocusables (for KeyboardNavigator). The label is
   * re-set inside the switch's onChange callback so it updates live.
   */
  private renderAsteroidImageToggleRow(cx: number, y: number): void {
    const labelFor = (enabled: boolean): string =>
      enabled ? 'Asteroid Images' : 'Rendered Asteroids';
    // Positions: switch centered at (cx-80), label left-justified
    // starting at (cx-10). Switch is ~80px wide so its right edge is
    // around cx-40; label starts 30px right of that for breathing room.
    const switchX = cx - 80;
    const labelX = cx - 10;

    const toggle = new ToggleSwitch({
      scene: this,
      x: switchX,
      y,
      value: Settings.getImageAsteroidsEnabled(),
      telemetryLabel: 'ImageAsteroids',
      onChange: (next) => {
        // Settings.setImageAsteroidsEnabled fires the change event that
        // AsteroidFieldScene subscribes to — live asteroids get swapped
        // in place, plus future spawns reflect the new value. The
        // label.setText below updates the on-screen description.
        Settings.setImageAsteroidsEnabled(next);
        label.setText(labelFor(next));
      },
    });
    this.tabContent.push(toggle);
    this.tabContentFocusables.push(toggle);

    const label = text(
      this,
      labelX,
      y,
      labelFor(Settings.getImageAsteroidsEnabled()),
      'rowLabel',
    ).setOrigin(0, 0.5);
    this.tabContent.push(label);
  }

  private handleBack(): void {
    this.onBack?.();
  }
}
