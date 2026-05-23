# Scoring

Reference doc for mathBasher's scoring model — formula, multipliers, max-score grid, star ladders. This file **describes**; it does not define. The authoritative sources are `src/core/config.ts` (the `config.scoring` block) and `src/services/ScoreCalculator.ts` (per-question recording + star derivation). Per `CLAUDE.md`'s "keep SCORING.md in sync" rule, this file must be updated in the same commit that changes any of those sources.

---

## Formula

Each correct answer earns:

```
score per correct = basePerCorrect
                  × mathDifficulty[mathId]
                  × speed[speedKey].multiplier
                  × (afterWrongShotMultiplier if you've taken a wrong shot this round, else 1.0)
```

| Knob | Value | Source |
|---|---|---|
| `basePerCorrect` | 100 | `config.scoring.basePerCorrect` |
| `afterWrongShotMultiplier` | 0.5 | `config.scoring.afterWrongShotMultiplier` |

A wrong shot in a round halves every *future* correct answer's score until the round ends (it does NOT retroactively halve correct answers from earlier in the round). The kid's total is the simple sum of per-correct-answer scores.

## Round length

**12 questions per round** for every game mode (`config.round.questionsPerRound`). Number Climb's 12 floors = 12 questions; the arcade modes' rounds = 12 questions. Calibrated across modes by sprint 2.2.1 story 10.

## Per-math-type multipliers

Source: `config.scoring.mathDifficulty`. Ladder: addition baseline 1.0; +0.5 per operation step; +0.5 per range step.

| Math type | Multiplier | Notes |
|---|---|---|
| `add-to-10` | 1.0 | baseline |
| `add-to-20` | 1.5 | +0.5 range step |
| `sub-to-10` | 1.5 | +0.5 operation step |
| `sub-to-20` | 2.0 | +0.5 range step |
| `mult-to-100` | 2.5 | +0.5 operation step |
| `mult-to-144` | 3.0 | +0.5 range step |
| `div-to-100` | 3.5 | +0.5 operation step |
| `div-to-144` | 4.0 | +0.5 range step |
| `mixed` | 2.5 | representative average across the 8 integer types (sprint 1.5) |
| `add-fractions` | 4.0 | sprint 2.4 — peer of `div-to-144`; grade 4/5 territory |
| `subtract-fractions` | 4.5 | sprint 2.4 — top of the ladder; +0.5 over add (non-negative-result + borrow logic) |

## Per-difficulty (Speed) multipliers

Source: `config.scoring.speed[*].multiplier`.

| Difficulty | `SpeedKey` | Multiplier |
|---|---|---|
| Easy | `slow` | 1.0 |
| Medium | `medium` | 1.25 |
| Hard | `fast` | 1.5 |

(`SpeedKey` is the internal name; the player-facing labels differ per game mode — Climb uses Easy/Medium/Hard, the arcade modes use Slow/Medium/Fast.)

## Max score per (math type × difficulty)

**Cross-game parity:** scoring has no game-mode axis. A perfect 12-question round of `(mathId, speedKey)` produces the same max score regardless of which game mode was played (Alien Shoot, Asteroid Field, Number Climb). Locked by `ScoreCalculator.test.ts` parity tests (sprint 2.2.1 story 11, sprint 2.4 story 7).

Formula: `max = 12 × 100 × mathMult × speedMult = 1200 × mathMult × speedMult`. Assumes a clean round (no wrong shot taken).

| Math type | Easy (×1.0) | Medium (×1.25) | Hard (×1.5) |
|---|---:|---:|---:|
| `add-to-10` (×1.0) | 1,200 | 1,500 | 1,800 |
| `add-to-20` (×1.5) | 1,800 | 2,250 | 2,700 |
| `sub-to-10` (×1.5) | 1,800 | 2,250 | 2,700 |
| `sub-to-20` (×2.0) | 2,400 | 3,000 | 3,600 |
| `mult-to-100` (×2.5) | 3,000 | 3,750 | 4,500 |
| `mult-to-144` (×3.0) | 3,600 | 4,500 | 5,400 |
| `div-to-100` (×3.5) | 4,200 | 5,250 | 6,300 |
| `div-to-144` (×4.0) | 4,800 | 6,000 | 7,200 |
| `mixed` (×2.5) | 3,000 | 3,750 | 4,500 |
| `add-fractions` (×4.0) | 4,800 | 6,000 | 7,200 |
| `subtract-fractions` (×4.5) | 5,400 | 6,750 | 8,100 |

## Star ladders

Stars are awarded at round end. The two game families use different ladders.

### Arcade modes (Alien Shoot, Asteroid Field) — by correct count

Source: `config.round.starThresholds` (currently `[8, 10, 11]`).

| Correct out of 12 | Stars |
|---|---|
| 0–7 | 0 |
| 8–9 | 1 ★ |
| 10 | 2 ★★ |
| 11–12 | 3 ★★★ |

### Number Climb (ships as "Space Escape!") — by floor reached

Source: `computeClimbStars(floorReached, totalFloors)` in `src/services/ScoreCalculator.ts`. Thresholds derive from `totalFloors` via `floor(totalFloors × 0.4 / 0.7 / 1.0)`, so a future round-size change auto-scales.

| Floor reached (out of 12) | Stars |
|---|---|
| 0–3 | 0 |
| 4–7 | 1 ★ |
| 8–11 | 2 ★★ |
| 12 | 3 ★★★ |

(Climb's rating is **height-based**, not correct-count-based — a kid who reaches the top with the maximum allowed mulligans still earns ★★★.)

## Where to edit

| Want to change… | Edit |
|---|---|
| Per-math-type multipliers | `src/core/config.ts` → `config.scoring.mathDifficulty` |
| Per-difficulty multiplier | `src/core/config.ts` → `config.scoring.speed[*].multiplier` |
| Base per-correct points | `src/core/config.ts` → `config.scoring.basePerCorrect` |
| Wrong-shot penalty | `src/core/config.ts` → `config.scoring.afterWrongShotMultiplier` |
| Round length | `src/core/config.ts` → `config.round.questionsPerRound` (NumberClimb overrides via RoundController constructor — currently matches the global 12) |
| Arcade star ladder | `src/core/config.ts` → `config.round.starThresholds` |
| Climb star ladder | `src/services/ScoreCalculator.ts` → `computeClimbStars` |

**After any edit above, update this file in the same commit.** The cross-cutting reviewer audit's Architect role checks for the drift.

## Change log

- **Sprint 2.4 (story 8)** — file created. Added `add-fractions` (4.0) and `subtract-fractions` (4.5) entries; max-score grid extended. Multiplier ladder for the integer types unchanged.
