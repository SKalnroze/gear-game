import { describe, it, expect } from 'vitest';
import { computeDamage, getCounterMultiplier, IRON_GUARD_DAMAGE_REDUCTION } from '../../src/constants/unit.constants';

/**
 * computeDamage is the one function every damage-application site now
 * routes through -- CombatSystem, the UnitSystem behavior methods
 * (cavalry, iron guard, aether phantom, crystal sentinel), and
 * ProjectileSystem. Before this, the counter matrix only applied inside
 * CombatSystem's own pairwise resolution, so cavalry/artillery/sentinel/
 * phantom hits (and their elites) ignored it entirely.
 */
describe('computeDamage', () => {
  it('applies the counter multiplier for a favored matchup', () => {
    const dealt = computeDamage('cavalry', { type: 'infantry' }, 12);
    expect(dealt).toBe(12 * getCounterMultiplier('cavalry', 'infantry'));
    expect(dealt).toBe(24); // cavalry beats infantry at 2x
  });

  it('is a no-op multiplier with no counter relationship', () => {
    const dealt = computeDamage('infantry', { type: 'mixed' }, 5);
    expect(dealt).toBe(5);
  });

  it('an attacker with no unit type (a turret) skips the counter lookup entirely', () => {
    const dealt = computeDamage(undefined, { type: 'cavalry' }, 8);
    expect(dealt).toBe(8); // cavalry would otherwise take 0.5x from most attackers
  });

  it('Iron Guard takes 30% less damage regardless of attacker', () => {
    const raw = 10;
    const dealt = computeDamage('cavalry', { type: 'iron_guard' }, raw);
    // cavalry->iron_guard counter mult is 0.5, armor stacks multiplicatively on top
    expect(dealt).toBeCloseTo(raw * 0.5 * IRON_GUARD_DAMAGE_REDUCTION, 6);
  });

  it('a Crystal Sentinel shield aura reduces incoming damage on top of the counter multiplier', () => {
    const dealt = computeDamage('infantry', { type: 'crystal_sentinel', shieldFactor: 0.8 }, 10);
    expect(dealt).toBeCloseTo(10 * getCounterMultiplier('infantry', 'crystal_sentinel') * 0.8, 6);
  });

  it('no active shield (default factor) leaves damage unchanged', () => {
    const dealt = computeDamage('infantry', { type: 'crystal_sentinel' }, 10);
    expect(dealt).toBeCloseTo(10 * getCounterMultiplier('infantry', 'crystal_sentinel'), 6);
  });
});
