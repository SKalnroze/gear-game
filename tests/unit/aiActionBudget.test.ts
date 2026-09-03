import { describe, it, expect } from 'vitest';
import { AIActionBudget } from '../../src/ai/AIActionBudget';

/**
 * This is the AI's actual difficulty axis now -- it replaced a fixed 2s
 * decision interval plus easy mode's 55%-random-skip, which "faked"
 * incompetence via a coin-flip rather than a real constraint. Difficulty
 * should differ in how fast the pool refills (APM), not in whether the AI
 * randomly ignores its own turn.
 */
describe('AIActionBudget', () => {
  it('starts full -- the AI can act immediately at match start', () => {
    const budget = new AIActionBudget(30, 4);
    expect(budget.canAfford(1)).toBe(true);
    expect(budget.currentPoints).toBe(4);
  });

  it('spending drains the pool, clamped at 0', () => {
    const budget = new AIActionBudget(30, 4);
    budget.spend(4);
    expect(budget.currentPoints).toBe(0);
    budget.spend(1); // over-spend must not go negative
    expect(budget.currentPoints).toBe(0);
    expect(budget.canAfford(1)).toBe(false);
  });

  it('regenerates at apm/60000 points per ms, capped at capacity', () => {
    const budget = new AIActionBudget(60, 4); // 60 apm = 1 point/sec
    budget.spend(4);
    budget.regen(2000); // 2s -> +2 points
    expect(budget.currentPoints).toBeCloseTo(2, 5);

    budget.regen(10000); // way more than enough to refill
    expect(budget.currentPoints).toBe(4); // capped, not overshot
  });

  it('a higher APM difficulty refills faster than a lower one over the same elapsed time', () => {
    const easy = new AIActionBudget(14, 4);
    const hard = new AIActionBudget(42, 4);
    easy.spend(4);
    hard.spend(4);

    easy.regen(5000);
    hard.regen(5000);

    expect(hard.currentPoints).toBeGreaterThan(easy.currentPoints);
  });

  it('setApm changes the regen rate immediately (mid-match difficulty change)', () => {
    const budget = new AIActionBudget(14, 4);
    budget.spend(4);
    budget.setApm(60); // 1 point/sec
    budget.regen(1000);
    expect(budget.currentPoints).toBeCloseTo(1, 5);
  });

  it('a zero or negative deltaMs is a no-op, not a refund', () => {
    const budget = new AIActionBudget(60, 4);
    budget.spend(4);
    budget.regen(0);
    budget.regen(-500);
    expect(budget.currentPoints).toBe(0);
  });
});
