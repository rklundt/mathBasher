// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildButtonClickedProps, emitButtonClicked } from '@/game/ui/buttonTelemetry';
import { _th, SeverityLevel } from '@/core/telemetry';

/**
 * Sprint 0.7.5 Story 4 — `ButtonClicked` event tests.
 *
 * We test the pure shape-builder (`buildButtonClickedProps`) directly so
 * the contract (label / sceneKey / source) is locked in without needing
 * jsdom + Phaser to construct an actual button. The emit wrapper is
 * tested by spying on `_th.logToAi`, which is module-scoped and easy
 * to spy on without touching the DOM.
 *
 * Wiring is verified by manual playtest (see sprint acceptance):
 *   - click any PlaceholderButton → console shows ButtonClicked
 *   - Tab + Enter on a focused button → same event with source=keyboard
 *   - tap TouchFireButton → ButtonClicked with label=FIRE
 *   - click a disabled PlaceholderButton → no event (handler short-circuits)
 */
describe('buildButtonClickedProps', () => {
  it('packs label, sceneKey, and pointer source into the dict shape', () => {
    const props = buildButtonClickedProps('Resume', 'PauseOverlay', 'pointer');
    expect(props).toEqual({
      label: 'Resume',
      sceneKey: 'PauseOverlay',
      source: 'pointer',
    });
  });

  it('packs the same shape for keyboard activation', () => {
    const props = buildButtonClickedProps('Settings', 'MenuScene', 'keyboard');
    expect(props).toEqual({
      label: 'Settings',
      sceneKey: 'MenuScene',
      source: 'keyboard',
    });
  });

  it('passes label through verbatim, including symbolic glyphs (−, +, ★)', () => {
    // SettingsScene uses "−" / "+" labels for the volume row buttons,
    // GameOverScene's high-score badge text contains "★". Confirm those
    // unicode characters round-trip without mojibake.
    const minusProps = buildButtonClickedProps('−', 'SettingsScene', 'pointer');
    const plusProps = buildButtonClickedProps('+', 'SettingsScene', 'pointer');
    const starProps = buildButtonClickedProps('★ Replay ★', 'GameOverScene', 'pointer');
    expect(minusProps['label']).toBe('−');
    expect(plusProps['label']).toBe('+');
    expect(starProps['label']).toBe('★ Replay ★');
  });

  it('does not include extra keys beyond label, sceneKey, source', () => {
    // Defensive: if a future edit accidentally adds a `disabled: false`
    // or similar to the dict, downstream queries that filter by exact
    // dimension set could break. Lock the key list.
    const props = buildButtonClickedProps('Back', 'DifficultyScene', 'pointer');
    expect(Object.keys(props).sort()).toEqual(['label', 'sceneKey', 'source']);
  });
});

describe('emitButtonClicked', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls _th.logToAi with event name "ButtonClicked", Information severity, and the canonical props shape', () => {
    const spy = vi.spyOn(_th, 'logToAi').mockImplementation(() => undefined);
    emitButtonClicked('Quit to Menu', 'PauseOverlay', 'keyboard');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('ButtonClicked', SeverityLevel.Information, {
      label: 'Quit to Menu',
      sceneKey: 'PauseOverlay',
      source: 'keyboard',
    });
  });

  it('routes pointer-source clicks through the same code path', () => {
    const spy = vi.spyOn(_th, 'logToAi').mockImplementation(() => undefined);
    emitButtonClicked('FIRE', 'GameScene', 'pointer');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('ButtonClicked', SeverityLevel.Information, {
      label: 'FIRE',
      sceneKey: 'GameScene',
      source: 'pointer',
    });
  });
});
