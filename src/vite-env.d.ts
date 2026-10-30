// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

/// <reference types="vite/client" />

/** Build-time variables Vite inlines into the bundle (set in the deploy workflow). */
interface ImportMetaEnv {
  /** AGPL §13 source link shown in the footer: the exact commit being built. Unset locally. */
  readonly VITE_SOURCE_URL?: string;
  /** Sprint 2.15 — 'true' shows each menu screen's name in its corner (set for the dev site only). */
  readonly VITE_SHOW_SCREEN_NAMES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
