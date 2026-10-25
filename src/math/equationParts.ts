// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright 2026 Ray Klundt
// mathBasher is also available under a commercial license — see COMMERCIAL.md

import { decimalValue, formatFraction, mixedToImproper } from '@/math/fractionMath';
import type { EquationOp, EquationParts, Term } from '@/math/types';

/**
 * Sprint 2.12 — helpers the generators use to describe a question's number
 * sentence (`Question.parts`), so Balance Scale can blank one number out
 * ("12 + ? = 17"). Pure; no game code.
 */

/** A whole-number sentence `a op b = result`; wrong weights stay within `[min, max]`. */
export function wholeParts(
  a: number,
  op: EquationOp,
  b: number,
  result: number,
  min: number,
  max: number,
): EquationParts {
  return { left: { value: a }, op, right: { value: b }, result: { value: result }, range: { min, max } };
}

/** A fraction as the problem shows it, NOT reduced ("2/4" stays "2/4"), with an optional whole part ("1 2/4"). */
export function fractionTerm(num: number, den: number, whole = 0): Term {
  const imp = whole > 0 ? mixedToImproper(whole, num, den) : { num, den };
  return {
    value: decimalValue(imp.num, imp.den),
    display: whole > 0 ? `${String(whole)} ${String(num)}/${String(den)}` : `${String(num)}/${String(den)}`,
    frac: { whole, num, den },
  };
}

/** A fraction result shown the way the answers are (reduced, improper as a mixed number). */
export function fractionResult(num: number, den: number): Term {
  return { value: decimalValue(num, den), display: formatFraction(num, den) };
}

/** What a term shows: its display, or the plain number. */
export function termDisplay(t: Term): string {
  return t.display ?? String(t.value);
}
