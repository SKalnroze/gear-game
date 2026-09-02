import { describe, it, expect } from 'vitest';
import {
  computeScaledStats,
  isInFront,
  gearInLane,
  computeAttackCooldown,
  computeChargeDamage,
  TYPE_MASS_MULT,
} from '../../src/systems/unit.utils';
import { UNIT_DEFINITIONS } from '../../src/constants/unit.constants';
import { LANE_Y_MIN, LANE_Y_MAX } from '../../src/constants/world.constants';
import type { UnitState } from '../../src/types/unit.types';

// Helper: minimal UnitState with just the fields isInFront needs
function makeUnit(owner: 'player' | 'ai', x: number): UnitState {
  return {
    id: 'u', type: 'infantry', owner, x, y: 787,
    hp: 30, maxHp: 30, speed: 60, baseDamage: 5, damage: 3,
    size: 12, attackRange: 36, mass: 10, costAmount: 5,
    inCombat: false, reachedBase: false,
    vx: 0, vy: 0,
    frictionValue: 0,
    behaviorState: 'marching',
    lastAttackTime: 0,
    chargeAccum: 0,
    retreatTimer: 0,
    slowTimer: 0,
    slowFactor: 1,
  } as UnitState;
}

// ─── computeScaledStats ───────────────────────────────────────────────────────

describe('computeScaledStats', () => {
  const def = UNIT_DEFINITIONS.infantry;

  it('at teeth=10 (s=1) stats match base values exactly', () => {
    const stats = computeScaledStats(def, 10, 'infantry');
    expect(stats.hp).toBe(def.hp);          // 30 * 1^1.5 = 30
    expect(stats.speed).toBe(def.speed);    // 60 * 1^-0.5 = 60
    expect(stats.baseDamage).toBe(def.baseDamage); // 5
    expect(stats.damage).toBe(def.damage);  // 3
    expect(stats.size).toBe(12);            // 10 * 1.2 = 12
    expect(stats.costAmount).toBe(def.costAmount); // 5
  });

  it('at teeth=20 (s=2): hp = round(30 * 2^1.5)', () => {
    const expected = Math.max(1, Math.round(30 * Math.pow(2, 1.5)));
    expect(computeScaledStats(def, 20, 'infantry').hp).toBe(expected);
  });

  it('at teeth=20 (s=2): speed = round(60 * 2^-0.5)', () => {
    const expected = Math.max(15, Math.round(60 * Math.pow(2, -0.5)));
    expect(computeScaledStats(def, 20, 'infantry').speed).toBe(expected);
  });

  it('at teeth=5 (s=0.5): hp clamped to ≥ 1', () => {
    const stats = computeScaledStats(def, 5, 'infantry');
    expect(stats.hp).toBeGreaterThanOrEqual(1);
  });

  it('at teeth=5 (s=0.5): speed clamped to ≥ 15', () => {
    const stats = computeScaledStats(def, 5, 'infantry');
    expect(stats.speed).toBeGreaterThanOrEqual(15);
  });

  it('at teeth=5 (s=0.5): size clamped to ≥ 4', () => {
    const stats = computeScaledStats(def, 5, 'infantry');
    expect(stats.size).toBeGreaterThanOrEqual(4);
  });

  it('artillery at teeth=10: attackRange = max(4, round(10*1.2)) * 10 = 120', () => {
    const artStats = computeScaledStats(UNIT_DEFINITIONS.artillery, 10, 'artillery');
    expect(artStats.attackRange).toBe(120);
  });

  it('crystal_sentinel at teeth=10: attackRange = max(4, round(12)) * 6 = 72', () => {
    const stats = computeScaledStats(UNIT_DEFINITIONS.crystal_sentinel, 10, 'crystal_sentinel');
    expect(stats.attackRange).toBe(72);
  });

  it('infantry uses ENGAGE_DISTANCE-based attackRange', () => {
    const stats = computeScaledStats(def, 10, 'infantry');
    // s=1, max(36, round(36 * 1)) = 36
    expect(stats.attackRange).toBe(36);
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

  it('iron_guard produces higher mass than infantry at same teeth', () => {
    const ironGuardStats = computeScaledStats(UNIT_DEFINITIONS.iron_guard, 10, 'iron_guard');
    const infantryStats  = computeScaledStats(UNIT_DEFINITIONS.infantry, 10, 'infantry');
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

  it('chargeAccum=100 → 2× baseDamage', () => {
    expect(computeChargeDamage(10, 100)).toBe(20);
  });

  it('chargeAccum=50 → 1.5× baseDamage', () => {
    expect(computeChargeDamage(10, 50)).toBe(15);
  });
});
