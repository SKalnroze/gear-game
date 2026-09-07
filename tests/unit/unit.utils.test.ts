import { describe, it, expect } from 'vitest';
import {
  computeScaledStats,
  computeTierStats,
  TIER_SPEED_BASE,
  isInFront,
  isOwnerOnRight,
  marchDirection,
  enemyBaseX,
  homeBaseX,
  spawnX,
  hasReachedEnemyBase,
  gearInLane,
  computeAttackCooldown,
  computeChargeDamage,
  TYPE_MASS_MULT,
} from '../../src/systems/unit.utils';
import { PLAYER_BASE_X, AI_BASE_X } from '../../src/constants/world.constants';
import { UNIT_DEFINITIONS } from '../../src/constants/unit.constants';
import { LANE_Y_MIN, LANE_Y_MAX } from '../../src/constants/world.constants';
import type { UnitState } from '../../src/types/unit.types';
import { tierPower, tierRangeFactor, tierCostFactor, TIER_TEETH } from '../../src/constants/tier.constants';

// Helper: minimal UnitState with just the fields isInFront needs
function makeUnit(owner: 'player' | 'ai', x: number): UnitState {
  return {
    id: 'u', type: 'infantry', owner, x, y: 787,
    hp: 30, maxHp: 30, speed: 60, baseDamage: 5, damage: 3,
    size: 12, attackRange: 36, mass: 10, costAmount: 5,
    inCombat: false, reachedBase: false,
    vx: 0, vy: 0, knockbackVx: 0, knockbackVy: 0,
    frictionValue: 0,
    behaviorState: 'marching',
    lastAttackTime: 0,
    chargeAccum: 0,
    retreatTimer: 0,
    slowTimer: 0,
    slowFactor: 1,
    shieldTimer: 0,
    shieldFactor: 1,
  } as UnitState;
}

// ─── computeScaledStats ───────────────────────────────────────────────────────

describe('computeTierStats', () => {
  const def = UNIT_DEFINITIONS.infantry;

  it('tier 1 stats match the base values exactly', () => {
    const stats = computeTierStats(def, 1, 'infantry');
    expect(stats.hp).toBe(def.hp);
    expect(stats.speed).toBe(def.speed);
    expect(stats.baseDamage).toBe(def.baseDamage);
    expect(stats.damage).toBe(def.damage);
    expect(stats.costAmount).toBe(def.costAmount);
    expect(stats.size).toBe(Math.round(TIER_TEETH[1] * 1.2));
  });

  /**
   * The headline promise of the ladder: one size up is a 1.5x upgrade in every
   * strength stat, so a tier-3 unit is exactly 2.25x a tier-1 one.
   */
  it('hp and damage step exactly 1.5x per tier', () => {
    for (const tier of [2, 3, 4, 5] as const) {
      const stats = computeTierStats(def, tier, 'infantry');
      expect(stats.hp).toBe(Math.round(def.hp * tierPower(tier)));
      expect(stats.damage).toBe(Math.round(def.damage * tierPower(tier)));
      expect(stats.baseDamage).toBe(Math.round(def.baseDamage * tierPower(tier)));
    }
  });

  it('tier 3 is 2.25x tier 1 in hp, within integer rounding', () => {
    // 30 * 2.25 = 67.5, which rounds to 68 -- the ratio a player actually gets
    // is 2.267. Assert the exact rounded value rather than a loose tolerance,
    // so a real change to the curve still fails this.
    expect(computeTierStats(def, 3, 'infantry').hp).toBe(Math.round(def.hp * 2.25));
    expect(computeTierStats(def, 3, 'infantry').hp / computeTierStats(def, 1, 'infantry').hp)
      .toBeCloseTo(2.25, 1);
  });

  it('cost climbs faster than power, so scaling up is a commitment', () => {
    const t5 = computeTierStats(def, 5, 'infantry').costAmount;
    expect(t5).toBe(Math.round(def.costAmount * tierCostFactor(5)));
    expect(tierCostFactor(5)).toBeGreaterThan(tierPower(5));
  });

  it('mass scales with tier and keeps the per-type multiplier', () => {
    const guard = computeTierStats(UNIT_DEFINITIONS.iron_guard, 3, 'iron_guard');
    const inf   = computeTierStats(UNIT_DEFINITIONS.infantry, 3, 'infantry');
    expect(guard.mass).toBeGreaterThan(inf.mass);
  });

  describe('speed preserves unit identity across the ladder', () => {
    it('light units get faster with tier', () => {
      const t1 = computeTierStats(UNIT_DEFINITIONS.cavalry, 1, 'cavalry').speed;
      const t5 = computeTierStats(UNIT_DEFINITIONS.cavalry, 5, 'cavalry').speed;
      expect(t5).toBeGreaterThan(t1);
    });

    it('heavy units get SLOWER with tier -- being big is their identity', () => {
      const t1 = computeTierStats(UNIT_DEFINITIONS.iron_guard, 1, 'iron_guard').speed;
      const t5 = computeTierStats(UNIT_DEFINITIONS.iron_guard, 5, 'iron_guard').speed;
      expect(t5).toBeLessThan(t1);
    });

    it('the fast/slow gap widens with tier rather than collapsing', () => {
      const gap = (tier: 1 | 5) =>
        computeTierStats(UNIT_DEFINITIONS.cavalry, tier, 'cavalry').speed
        - computeTierStats(UNIT_DEFINITIONS.iron_guard, tier, 'iron_guard').speed;
      expect(gap(5)).toBeGreaterThan(gap(1));
    });

    it('every heavy unit has a base below 1 and every light one above', () => {
      for (const t of ['iron_guard', 'artillery', 'sapper', 'slime'] as const) {
        expect(TIER_SPEED_BASE[t]!).toBeLessThan(1);
      }
      for (const t of ['cavalry', 'skirmish_diver', 'raider'] as const) {
        expect(TIER_SPEED_BASE[t]!).toBeGreaterThan(1);
      }
    });

    it('never drops below the 15 px/s floor', () => {
      expect(computeTierStats(UNIT_DEFINITIONS.iron_guard, 5, 'iron_guard').speed)
        .toBeGreaterThanOrEqual(15);
    });
  });

  describe('range is the deliberate exception to the ladder', () => {
    it('grows on the shallow 1.15^p curve, not 1.5^p', () => {
      const art = (tier: 1 | 5) =>
        computeTierStats(UNIT_DEFINITIONS.artillery, tier, 'artillery').attackRange;
      expect(art(5)).toBe(Math.round(art(1) * tierRangeFactor(5)));
    });

    it('tier 5 reaches under 2x tier 1, so artillery cannot span the map', () => {
      const art = (tier: 1 | 5) =>
        computeTierStats(UNIT_DEFINITIONS.artillery, tier, 'artillery').attackRange;
      expect(art(5) / art(1)).toBeLessThan(2);
    });

    it('artillery still far outranges infantry at every tier', () => {
      for (const tier of [1, 3, 5] as const) {
        const art = computeTierStats(UNIT_DEFINITIONS.artillery, tier, 'artillery').attackRange;
        const inf = computeTierStats(UNIT_DEFINITIONS.infantry, tier, 'infantry').attackRange;
        expect(art).toBeGreaterThan(inf);
      }
    });
  });
});

describe('computeScaledStats (deprecated teeth shim)', () => {
  it('resolves a tooth count to its tier and delegates', () => {
    const def = UNIT_DEFINITIONS.infantry;
    expect(computeScaledStats(def, TIER_TEETH[3], 'infantry'))
      .toEqual(computeTierStats(def, 3, 'infantry'));
  });
});

// ─── Mass multipliers ─────────────────────────────────────────────────────────

describe('TYPE_MASS_MULT', () => {
  it('iron_guard has multiplier 3', () => {
    expect(TYPE_MASS_MULT.iron_guard).toBe(3);
  });

  it('cavalry has multiplier 0.8', () => {
    expect(TYPE_MASS_MULT.cavalry).toBe(0.8);
  });

  it('iron_guard produces higher mass than infantry at the same tier', () => {
    const ironGuardStats = computeTierStats(UNIT_DEFINITIONS.iron_guard, 1, 'iron_guard');
    const infantryStats  = computeTierStats(UNIT_DEFINITIONS.infantry, 1, 'infantry');
    expect(ironGuardStats.mass).toBeGreaterThan(infantryStats.mass);
  });
});

// ─── isInFront ────────────────────────────────────────────────────────────────

describe('isInFront', () => {
  describe('playerOnRight=false (default)', () => {
    it('player unit: target ahead (targetX > unit.x) → true', () => {
      const unit = makeUnit('player', 500);
      expect(isInFront(unit, 600, false)).toBe(true);
    });

    it('player unit: target behind (targetX < unit.x) → false', () => {
      const unit = makeUnit('player', 500);
      expect(isInFront(unit, 400, false)).toBe(false);
    });

    it('ai unit: target ahead (targetX < unit.x, marching left) → true', () => {
      const unit = makeUnit('ai', 1500);
      expect(isInFront(unit, 1400, false)).toBe(true);
    });

    it('ai unit: target behind (targetX > unit.x) → false', () => {
      const unit = makeUnit('ai', 1500);
      expect(isInFront(unit, 1600, false)).toBe(false);
    });
  });

  describe('playerOnRight=true (sides inverted)', () => {
    it('player unit: target to the left (targetX < unit.x) → true', () => {
      const unit = makeUnit('player', 1500);
      expect(isInFront(unit, 1400, true)).toBe(true);
    });

    it('player unit: target to the right (targetX > unit.x) → false', () => {
      const unit = makeUnit('player', 1500);
      expect(isInFront(unit, 1600, true)).toBe(false);
    });

    it('ai unit: target to the right → true', () => {
      const unit = makeUnit('ai', 500);
      expect(isInFront(unit, 600, true)).toBe(true);
    });
  });
});

// ─── gearInLane ───────────────────────────────────────────────────────────────

describe('gearInLane', () => {
  it('y exactly at LANE_Y_MIN → true (boundary included)', () => {
    expect(gearInLane(LANE_Y_MIN)).toBe(true);
  });

  it('y exactly at LANE_Y_MAX → true (boundary included)', () => {
    expect(gearInLane(LANE_Y_MAX)).toBe(true);
  });

  it('y inside lane → true', () => {
    expect(gearInLane((LANE_Y_MIN + LANE_Y_MAX) / 2)).toBe(true);
  });

  it('y above lane (y < LANE_Y_MIN) → false', () => {
    expect(gearInLane(LANE_Y_MIN - 1)).toBe(false);
  });

  it('y below lane (y > LANE_Y_MAX) → false', () => {
    expect(gearInLane(LANE_Y_MAX + 1)).toBe(false);
  });
});

// ─── computeAttackCooldown ────────────────────────────────────────────────────

describe('computeAttackCooldown', () => {
  it('size=12 (10-tooth gear) → 1000ms', () => {
    expect(computeAttackCooldown(12)).toBeCloseTo(1000);
  });

  it('larger size → longer cooldown', () => {
    expect(computeAttackCooldown(24)).toBeGreaterThan(computeAttackCooldown(12));
  });
});

// ─── computeChargeDamage ──────────────────────────────────────────────────────

describe('computeChargeDamage', () => {
  it('chargeAccum=0 → same as baseDamage', () => {
    expect(computeChargeDamage(10, 0)).toBe(10);
  });

  it('chargeAccum=160 → 2× baseDamage', () => {
    expect(computeChargeDamage(10, 160)).toBe(20);
  });

  it('chargeAccum=100 → 1 + 100/160 = 1.625× baseDamage', () => {
    expect(computeChargeDamage(10, 100)).toBeCloseTo(16.25);
  });

  it('chargeAccum=50 → 1 + 50/160 = 1.3125× baseDamage', () => {
    expect(computeChargeDamage(10, 50)).toBeCloseTo(13.125);
  });
});

// ─── Orientation ──────────────────────────────────────────────────────────────

describe('orientation', () => {
  // playerRight=false is the classic layout: human on the left marching right.
  // playerRight=true is the flipped lobby (AI left, human right), where every
  // directional decision must mirror. Movement, targeting and base arrival used
  // to disagree with each other in that configuration.

  function unitAt(owner: 'player' | 'ai', x: number): UnitState {
    return { owner, x, y: 260 } as UnitState;
  }

  describe('isOwnerOnRight', () => {
    it('normal layout puts the player left and the AI right', () => {
      expect(isOwnerOnRight('player', false)).toBe(false);
      expect(isOwnerOnRight('ai', false)).toBe(true);
    });

    it('flipped layout swaps them', () => {
      expect(isOwnerOnRight('player', true)).toBe(true);
      expect(isOwnerOnRight('ai', true)).toBe(false);
    });
  });

  describe('marchDirection', () => {
    it('the left side marches right and the right side marches left', () => {
      expect(marchDirection('player', false)).toBe(1);
      expect(marchDirection('ai', false)).toBe(-1);
    });

    it('flips with the layout', () => {
      expect(marchDirection('player', true)).toBe(-1);
      expect(marchDirection('ai', true)).toBe(1);
    });

    it('the two sides always march at each other', () => {
      for (const flipped of [false, true]) {
        expect(marchDirection('player', flipped)).toBe(-marchDirection('ai', flipped));
      }
    });
  });

  describe('base positions', () => {
    it('each side attacks the far base and defends the near one', () => {
      expect(enemyBaseX('player', false)).toBe(AI_BASE_X);
      expect(homeBaseX('player', false)).toBe(PLAYER_BASE_X);
      expect(enemyBaseX('ai', false)).toBe(PLAYER_BASE_X);
      expect(homeBaseX('ai', false)).toBe(AI_BASE_X);
    });

    it('flipped, the player attacks the left base instead', () => {
      expect(enemyBaseX('player', true)).toBe(PLAYER_BASE_X);
      expect(homeBaseX('player', true)).toBe(AI_BASE_X);
      expect(enemyBaseX('ai', true)).toBe(AI_BASE_X);
      expect(homeBaseX('ai', true)).toBe(PLAYER_BASE_X);
    });

    it('a side never attacks its own base', () => {
      for (const flipped of [false, true]) {
        for (const owner of ['player', 'ai'] as const) {
          expect(enemyBaseX(owner, flipped)).not.toBe(homeBaseX(owner, flipped));
        }
      }
    });
  });

  describe('marching leads to the enemy base', () => {
    // The bug this guards: units spawned on the correct side, then marched the
    // wrong way and "reached the enemy base" at their own doorstep.
    it('the enemy base always lies ahead of the spawn point', () => {
      for (const flipped of [false, true]) {
        for (const owner of ['player', 'ai'] as const) {
          const start = spawnX(owner, flipped);
          const target = enemyBaseX(owner, flipped);
          const dir = marchDirection(owner, flipped);
          expect(Math.sign(target - start)).toBe(dir);
        }
      }
    });

    it('the home base lies behind the spawn point', () => {
      for (const flipped of [false, true]) {
        for (const owner of ['player', 'ai'] as const) {
          const start = spawnX(owner, flipped);
          const home = homeBaseX(owner, flipped);
          expect(Math.sign(home - start)).toBe(-marchDirection(owner, flipped));
        }
      }
    });
  });

  describe('hasReachedEnemyBase', () => {
    it('is false at the spawn point in either layout', () => {
      for (const flipped of [false, true]) {
        for (const owner of ['player', 'ai'] as const) {
          expect(hasReachedEnemyBase(unitAt(owner, spawnX(owner, flipped)), flipped)).toBe(false);
        }
      }
    });

    it('is true on reaching the target base in either layout', () => {
      for (const flipped of [false, true]) {
        for (const owner of ['player', 'ai'] as const) {
          expect(hasReachedEnemyBase(unitAt(owner, enemyBaseX(owner, flipped)), flipped)).toBe(true);
        }
      }
    });

    it('is false at the unit’s own base', () => {
      for (const flipped of [false, true]) {
        for (const owner of ['player', 'ai'] as const) {
          expect(hasReachedEnemyBase(unitAt(owner, homeBaseX(owner, flipped)), flipped)).toBe(false);
        }
      }
    });
  });

  describe('isInFront agrees with march direction', () => {
    it('a target further along the march is in front, one behind is not', () => {
      for (const flipped of [false, true]) {
        for (const owner of ['player', 'ai'] as const) {
          const unit = unitAt(owner, 1400);
          const dir = marchDirection(owner, flipped);
          expect(isInFront(unit, 1400 + dir * 100, flipped)).toBe(true);
          expect(isInFront(unit, 1400 - dir * 100, flipped)).toBe(false);
        }
      }
    });

    it('the enemy base is in front and the home base behind', () => {
      for (const flipped of [false, true]) {
        for (const owner of ['player', 'ai'] as const) {
          const unit = unitAt(owner, spawnX(owner, flipped));
          expect(isInFront(unit, enemyBaseX(owner, flipped), flipped)).toBe(true);
          expect(isInFront(unit, homeBaseX(owner, flipped), flipped)).toBe(false);
        }
      }
    });
  });
});
