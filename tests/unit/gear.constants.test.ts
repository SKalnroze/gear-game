import { describe, it, expect } from 'vitest';
import {
  gearRadius,
  gearMaxHp,
  turretRange,
  motorOutput,
  motorTorque,
  spikeDamage,
  miningOutput,
  researcherOutput,
  healerOutput,
  healerRadius,
  turretMaxAmmo,
  gearInertia,
  GEAR_MODULE,
  DEFAULT_TEETH,
  MAX_GEAR_TEETH,
  GEAR_MESH_TOLERANCE,
} from '../../src/constants/gear.constants';
import { TIER_TEETH, tierPower, tierRangeFactor } from '../../src/constants/tier.constants';

// Every strength stat is now BASE x tierPower(tier); the bases are calibrated
// to what the old per-teeth formulas produced at 10 teeth. Tests address tiers
// by their canonical tooth counts rather than by raw numbers, so a change to
// the ladder shows up here as one failing table rather than fifty magic values.
const T1 = TIER_TEETH[1];  // 8
const T2 = TIER_TEETH[2];  // 12
const T5 = TIER_TEETH[5];  // 40

describe('gearRadius', () => {
  it('teeth=10 → 25', () => {
    expect(gearRadius(10)).toBe(25);
  });

  it('teeth=20 → 50', () => {
    expect(gearRadius(20)).toBe(50);
  });

  it('teeth=1 → GEAR_MODULE', () => {
    expect(gearRadius(1)).toBe(GEAR_MODULE);
  });

  it('uses GEAR_MODULE=2.5', () => {
    expect(GEAR_MODULE).toBe(2.5);
  });
});

describe('gearMaxHp', () => {
  it('basic gear at tier 1 -> 50', () => {
    expect(gearMaxHp(T1, 'motor')).toBe(50);
  });

  it('armored gear at tier 1 -> 150 (3x)', () => {
    expect(gearMaxHp(T1, 'armored')).toBe(150);
  });

  it('spiked gear at tier 1 -> 35 (0.7x)', () => {
    expect(gearMaxHp(T1, 'spiked')).toBe(35);
  });

  it('steps exactly 1.5x per tier', () => {
    expect(gearMaxHp(T2, 'motor')).toBe(Math.round(50 * 1.5));
    expect(gearMaxHp(T5, 'motor')).toBe(Math.round(50 * tierPower(5)));
  });

  it('infantry_spawner returns same as motor (no special case)', () => {
    expect(gearMaxHp(T1, 'infantry_spawner')).toBe(50);
  });
});

describe('turretRange', () => {
  // Derived from the mobile unit's own range (size * mult), times a fraction
  // < 1 -- a turret must always under-range its mobile counterpart, never
  // out-range it. The tier factor is the SHALLOW curve (1.15^p), not 1.5^p,
  // because a tier-5 artillery at full strength scaling would shoot across
  // most of the map. Both the turret and the mobile unit use the shallow
  // curve, so the fraction holds at every tier.
  const baseSize = Math.round(TIER_TEETH[1] * 1.2); // 10

  it('crossbow at tier 1 -> round(10 * 4 * 0.75) = 30', () => {
    expect(turretRange(T1, 'crossbow_turret')).toBe(30);
  });

  it('artillery at tier 1 -> round(10 * 10 * 0.8) = 80', () => {
    expect(turretRange(T1, 'artillery_turret')).toBe(80);
  });

  it('grows on the shallow range curve, not the strength curve', () => {
    expect(turretRange(T5, 'crossbow_turret'))
      .toBe(Math.round(baseSize * 4 * 0.75 * tierRangeFactor(5)));
    expect(turretRange(T5, 'artillery_turret'))
      .toBe(Math.round(baseSize * 10 * 0.8 * tierRangeFactor(5)));
  });

  it('tier 5 reaches well under 2x tier 1 -- the deliberate exception', () => {
    const ratio = turretRange(T5, 'artillery_turret') / turretRange(T1, 'artillery_turret');
    expect(ratio).toBeLessThan(2);
    expect(ratio).toBeGreaterThan(1.5);
  });
});

describe('constants sanity', () => {
  it('DEFAULT_TEETH is tier 1', () => expect(DEFAULT_TEETH).toBe(TIER_TEETH[1]));
  it('MAX_GEAR_TEETH is tier 5', () => expect(MAX_GEAR_TEETH).toBe(TIER_TEETH[5]));
  it('GEAR_MESH_TOLERANCE is 4', () => expect(GEAR_MESH_TOLERANCE).toBe(4));
});

describe('derived gear functions', () => {
  it('motorOutput steps 1.5x per tier from a base of 4', () => {
    expect(motorOutput(T1)).toBe(4);
    expect(motorOutput(T2)).toBe(6);
  });

  it('motorTorque steps 1.5x per tier from a base of 80', () => {
    expect(motorTorque(T1)).toBe(80);
    expect(motorTorque(T2)).toBe(120);
    expect(motorTorque(T5)).toBeCloseTo(80 * tierPower(5), 6);
  });

  it('spikeDamage steps 1.5x per tier', () => {
    expect(spikeDamage(T1)).toBe(5);
    expect(spikeDamage(T2)).toBe(7.5);
  });

  it('miningOutput steps 1.5x per tier', () => {
    expect(miningOutput(T1)).toBe(3);
    expect(miningOutput(T2)).toBe(4.5);
  });

  it('researcherOutput steps 1.5x per tier', () => {
    expect(researcherOutput(T1)).toBe(1500);
    expect(researcherOutput(T2)).toBe(2250);
  });

  it('healerOutput steps 1.5x per tier', () => {
    expect(healerOutput(T1)).toBe(15);
    expect(healerOutput(T2)).toBe(22.5);
  });

  it('healerRadius stays geometric -- it tracks the drawn gear, not strength', () => {
    expect(healerRadius(T1)).toBe(gearRadius(T1) * 3);
    expect(healerRadius(T5)).toBe(gearRadius(T5) * 3);
  });

  it('turretMaxAmmo steps 1.5x per tier, floored at 3', () => {
    expect(turretMaxAmmo(T1)).toBe(5);
    expect(turretMaxAmmo(T2)).toBe(8); // round(7.5)
  });

  /**
   * The regression guard for the whole redesign. Motor torque and gear inertia
   * must scale identically, or size silently becomes a speed penalty again --
   * the r^4-vs-r^2 mismatch that made a 40-tooth motor spin 634x slower than
   * an 8-tooth one and made avoiding gears the optimal line.
   */
  it('torque and inertia scale together, so tier never changes a lone motor speed', () => {
    const omega = (teeth: number) => motorTorque(teeth) / gearInertia(teeth);
    const base = omega(T1);
    for (const teeth of Object.values(TIER_TEETH)) {
      expect(omega(teeth)).toBeCloseTo(base, 6);
    }
  });
});
