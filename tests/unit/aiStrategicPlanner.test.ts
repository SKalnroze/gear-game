import { describe, it, expect } from 'vitest';
import { computePosture, roleCapFromPosture, StrategicPosture } from '../../src/ai/AIStrategicPlanner';

/**
 * The strategic layer between the AI's fixed goal and its per-tick tactical
 * execution. Chain capacity used to be a fixed 2/3/5 ceiling per difficulty
 * that never moved for the rest of the match -- this is what replaces it,
 * and it must actually grow with economy and match length rather than
 * plateauing, or the "AI stops developing" bug just comes back.
 */
describe('computePosture', () => {
  const base = { threat: 'normal' as const, goldPerSec: 0, matchElapsedMs: 0, profile: 'medium' as const };

  it('weights always sum to 1, for every personality', () => {
    for (const personality of ['rusher', 'economist', 'turtle', 'balanced'] as const) {
      const p = computePosture({ ...base, personality });
      expect(p.economy + p.defense + p.offense).toBeCloseTo(1, 6);
    }
  });

  it('rusher starts offense-heavy, economist economy-heavy, turtle defense-heavy', () => {
    const rusher = computePosture({ ...base, personality: 'rusher' });
    const economist = computePosture({ ...base, personality: 'economist' });
    const turtle = computePosture({ ...base, personality: 'turtle' });

    expect(rusher.offense).toBeGreaterThan(rusher.economy);
    expect(rusher.offense).toBeGreaterThan(rusher.defense);
    expect(economist.economy).toBeGreaterThan(economist.offense);
    expect(economist.economy).toBeGreaterThan(economist.defense);
    expect(turtle.defense).toBeGreaterThan(turtle.economy);
    expect(turtle.defense).toBeGreaterThan(turtle.offense);
  });

  it('balanced has no personality bias', () => {
    const p = computePosture({ ...base, personality: 'balanced' });
    expect(p.economy).toBeCloseTo(p.defense, 6);
    expect(p.defense).toBeCloseTo(p.offense, 6);
  });

  it('critical threat pulls weight away from economy, even for an economist', () => {
    const calm = computePosture({ ...base, personality: 'economist', threat: 'normal' });
    const critical = computePosture({ ...base, personality: 'economist', threat: 'critical' });
    expect(critical.economy).toBeLessThan(calm.economy);
  });

  it('winning shifts weight toward economy relative to normal', () => {
    const normal = computePosture({ ...base, personality: 'balanced', threat: 'normal' });
    const winning = computePosture({ ...base, personality: 'balanced', threat: 'winning' });
    expect(winning.economy).toBeGreaterThan(normal.economy);
  });

  describe('capacity', () => {
    it('grows with gold income, not just a flat starting number', () => {
      const poor = computePosture({ ...base, personality: 'balanced', goldPerSec: 0 });
      const rich = computePosture({ ...base, personality: 'balanced', goldPerSec: 50 });
      expect(rich.capacity).toBeGreaterThan(poor.capacity);
    });

    it('grows with match length -- this is the actual plateau fix', () => {
      const early = computePosture({ ...base, personality: 'balanced', matchElapsedMs: 0 });
      const late = computePosture({ ...base, personality: 'balanced', matchElapsedMs: 20 * 60000 });
      expect(late.capacity).toBeGreaterThan(early.capacity);
    });

    it('never keeps growing forever -- capped per difficulty', () => {
      const p = computePosture({ ...base, personality: 'balanced', goldPerSec: 10000, matchElapsedMs: 999 * 60000 });
      expect(p.capacity).toBeLessThanOrEqual(10); // CAPACITY_MAX.medium
    });

    it('hard reaches a given capacity in less time/income than easy (grows faster, not just higher)', () => {
      const inputs = { personality: 'balanced' as const, threat: 'normal' as const, goldPerSec: 20, matchElapsedMs: 5 * 60000 };
      const easy = computePosture({ ...inputs, profile: 'easy' });
      const hard = computePosture({ ...inputs, profile: 'hard' });
      expect(hard.capacity).toBeGreaterThan(easy.capacity);
    });
  });
});

describe('roleCapFromPosture', () => {
  const posture: StrategicPosture = { economy: 0.4, defense: 0.2, offense: 0.4, capacity: 10 };

  it('scales proportionally to the posture weight', () => {
    expect(roleCapFromPosture(posture, posture.economy, 1)).toBe(4);
    expect(roleCapFromPosture(posture, posture.defense, 1)).toBe(2);
  });

  it('never drops below the given minimum, even at 0 weight/capacity', () => {
    const empty: StrategicPosture = { economy: 0, defense: 0, offense: 0, capacity: 0 };
    expect(roleCapFromPosture(empty, empty.defense, 1)).toBe(1);
  });
});
