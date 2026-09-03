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
  GEAR_MODULE,
  DEFAULT_TEETH,
  MIN_TEETH,
  MAX_TEETH,
  GEAR_MESH_TOLERANCE,
} from '../../src/constants/gear.constants';

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
  it('basic gear at teeth=10 → 50', () => {
    // base = round(10 * 10 * 0.5) = 50
    expect(gearMaxHp(10, 'motor')).toBe(50);
  });

  it('armored gear at teeth=10 → 150 (3×)', () => {
    expect(gearMaxHp(10, 'armored')).toBe(150);
  });

  it('spiked gear at teeth=10 → 35 (0.7×)', () => {
    // round(50 * 0.7) = 35
    expect(gearMaxHp(10, 'spiked')).toBe(35);
  });

  it('scales with teeth squared', () => {
    // teeth=20 base = round(20 * 20 * 0.5) = 200
    expect(gearMaxHp(20, 'motor')).toBe(200);
  });

  it('infantry_spawner returns same as motor (no special case)', () => {
    expect(gearMaxHp(10, 'infantry_spawner')).toBe(50);
  });
});

describe('turretRange', () => {
  it('crossbow at teeth=10 → 250', () => {
    expect(turretRange(10, 'crossbow_turret')).toBe(250);
  });

  it('artillery at teeth=10 → 400', () => {
    expect(turretRange(10, 'artillery_turret')).toBe(400);
  });

  it('crossbow at teeth=40 → round(250 * sqrt(4)) = 500', () => {
    expect(turretRange(40, 'crossbow_turret')).toBe(500);
  });

  it('artillery at teeth=40 → round(400 * sqrt(4)) = 800', () => {
    expect(turretRange(40, 'artillery_turret')).toBe(800);
  });
});

describe('constants sanity', () => {
  it('DEFAULT_TEETH is 10', () => expect(DEFAULT_TEETH).toBe(10));
  it('MIN_TEETH is 5', () => expect(MIN_TEETH).toBe(5));
  it('MAX_TEETH is 60', () => expect(MAX_TEETH).toBe(60));
  it('GEAR_MESH_TOLERANCE is 4', () => expect(GEAR_MESH_TOLERANCE).toBe(4));
});

describe('derived gear functions', () => {
  it('motorOutput scales linearly with teeth', () => {
    expect(motorOutput(10)).toBe(4);
    expect(motorOutput(20)).toBe(8);
  });

  it('motorTorque scales quadratically', () => {
    // teeth * teeth * 0.8
    expect(motorTorque(10)).toBe(80);
    expect(motorTorque(20)).toBe(320);
  });

  it('spikeDamage scales linearly', () => {
    expect(spikeDamage(10)).toBe(5);
    expect(spikeDamage(20)).toBe(10);
  });

  it('miningOutput scales linearly', () => {
    expect(miningOutput(10)).toBe(3);
    expect(miningOutput(20)).toBe(6);
  });

  it('researcherOutput scales linearly', () => {
    expect(researcherOutput(10)).toBe(1500);
  });

  it('healerOutput scales linearly', () => {
    expect(healerOutput(10)).toBe(15);
  });

  it('healerRadius = gearRadius * 3', () => {
    expect(healerRadius(10)).toBe(gearRadius(10) * 3);
  });

  it('turretMaxAmmo: max(3, round(teeth * 0.5))', () => {
    expect(turretMaxAmmo(10)).toBe(5);
    expect(turretMaxAmmo(4)).toBe(3); // clamped at 3
    expect(turretMaxAmmo(20)).toBe(10);
  });
});
