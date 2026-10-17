// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { describe, expect, it } from 'vitest';
import { assertNever } from '@/shared/assertNever';

describe('assertNever', () => {
  it('throws, naming what it got', () => {
    expect(() => assertNever('surprise' as never, 'outcome')).toThrow('Unexpected outcome: "surprise"');
  });
});
