import { describe, it, expect } from 'vitest';
import {
  canWire, wireReach, wireCapacity, solveGrid, quantiseSatisfaction,
  motorPowerFactor, type PowerRole, type BatteryState,
} from '../../src/world/power.utils';
import {
  WIRE_BASE_RANGE, POLE_RANGE, MAX_WIRES_PER_GEAR, MAX_WIRES_PER_POLE,
  MOTOR_BASELINE, SATISFACTION_STEPS,
} from '../../src/constants/power.constants';
import { TIER_TEETH } from '../../src/constants/tier.constants';
import type { GearState } from '../../src/types/gear.types';

function gearAt(id: string, x: number, owner: 'player' | 'ai' = 'player'): GearState {
  return {
    id, type: 'motor', tier: 1, teeth: TIER_TEETH[1], x, y: 0, owner,
    angularVelocity: 0, currentAngle: 0, accumulatedAngle: 0, isSpinning: false,
    isBurntOut: false, isJammed: false, jamStress: 0, frictionLoad: 0,
    torqueOutput: 0, hp: 50, maxHp: 50, crackLevel: 0,
  };
}

const cand = (id: string, x: number, role: PowerRole | undefined, wires = 0, owner: 'player' | 'ai' = 'player') =>
  ({ gear: gearAt(id, x, owner), role, wireCount: wires });

// ─── Wiring rules ────────────────────────────────────────────────────────────

describe('canWire', () => {
  it('accepts two electrical gears in range', () => {
    expect(canWire(cand('a', 0, 'consumer'), cand('b', 50, 'generator'), false)).toBe('ok');
  });

  it('refuses a gear to itself', () => {
    expect(canWire(cand('a', 0, 'consumer'), cand('a', 0, 'consumer'), false)).toBe('same-gear');
  });

  it('refuses across owners -- you cannot plug into the enemy grid', () => {
    expect(canWire(cand('a', 0, 'consumer'), cand('b', 50, 'generator', 0, 'ai'), false))
      .toBe('different-owner');
  });

  it('refuses a gear with no electrical role', () => {
    expect(canWire(cand('a', 0, 'consumer'), cand('b', 50, undefined), false)).toBe('not-electrical');
  });

  it('refuses a duplicate wire', () => {
    expect(canWire(cand('a', 0, 'consumer'), cand('b', 50, 'generator'), true)).toBe('duplicate');
  });

  it('refuses beyond base reach', () => {
    expect(canWire(cand('a', 0, 'consumer'), cand('b', WIRE_BASE_RANGE + 1, 'generator'), false))
      .toBe('out-of-range');
  });

  it('accepts exactly at base reach', () => {
    expect(canWire(cand('a', 0, 'consumer'), cand('b', WIRE_BASE_RANGE, 'generator'), false)).toBe('ok');
  });

  /**
   * Reach is max(a, b), not min. Under min, a pole -- whose entire purpose is
   * to span distance -- could never reach an ordinary short-range consumer,
   * which would make poles useless.
   */
  it('a pole reaches a short-range consumer far beyond that consumer own reach', () => {
    const far = WIRE_BASE_RANGE + 100;
    expect(far).toBeLessThanOrEqual(POLE_RANGE);
    expect(canWire(cand('p', 0, 'pole'), cand('m', far, 'consumer'), false)).toBe('ok');
    // ...and symmetrically, with the pole as the second argument.
    expect(canWire(cand('m', far, 'consumer'), cand('p', 0, 'pole'), false)).toBe('ok');
  });

  it('still refuses past the pole reach', () => {
    expect(canWire(cand('p', 0, 'pole'), cand('m', POLE_RANGE + 1, 'consumer'), false))
      .toBe('out-of-range');
  });

  it('refuses once either end is at its wire limit', () => {
    expect(canWire(cand('a', 0, 'consumer', MAX_WIRES_PER_GEAR), cand('b', 50, 'generator'), false))
      .toBe('wire-limit');
    expect(canWire(cand('a', 0, 'consumer'), cand('b', 50, 'generator', MAX_WIRES_PER_GEAR), false))
      .toBe('wire-limit');
  });

  it('poles and ties take more wires than ordinary gears -- being a junction is their job', () => {
    expect(wireCapacity('pole')).toBe(MAX_WIRES_PER_POLE);
    expect(wireCapacity('tie')).toBe(MAX_WIRES_PER_POLE);
    expect(wireCapacity('consumer')).toBe(MAX_WIRES_PER_GEAR);
    expect(wireCapacity(undefined)).toBe(0);
    expect(wireReach(undefined)).toBe(0);
  });
});

// ─── Grid solve ──────────────────────────────────────────────────────────────

const battery = (charge: number, capacity = 40, maxDischarge = 8): BatteryState =>
  ({ charge, capacity, maxDischarge });

const solve = (over: Partial<Parameters<typeof solveGrid>[0]> = {}) =>
  solveGrid({ generation: 0, demand: 0, batteries: [], sellCap: 0, dt: 1, ...over });

describe('solveGrid', () => {
  it('fully serves demand it can cover', () => {
    const r = solve({ generation: 10, demand: 10 });
    expect(r.satisfaction).toBe(1);
    expect(r.brownout).toBe(false);
    expect(r.overflow).toBe(0);
  });

  it('a grid with no demand is satisfied by definition', () => {
    expect(solve({ generation: 0, demand: 0 }).satisfaction).toBe(1);
  });

  it('browns out proportionally when generation falls short', () => {
    const r = solve({ generation: 5, demand: 10 });
    expect(r.satisfaction).toBeCloseTo(0.5, 6);
    expect(r.brownout).toBe(true);
  });

  it('a grid with no generation and no storage delivers nothing', () => {
    const r = solve({ generation: 0, demand: 10 });
    expect(r.satisfaction).toBe(0);
    expect(r.brownout).toBe(true);
  });

  it('storage covers a deficit and is drained for it', () => {
    const r = solve({ generation: 4, demand: 10, batteries: [battery(20)] });
    expect(r.satisfaction).toBe(1);
    expect(r.brownout).toBe(false);
    expect(r.batteryDeltas[0]).toBeCloseTo(-6, 6);
  });

  it('storage cannot discharge faster than its rate cap', () => {
    const r = solve({ generation: 0, demand: 100, batteries: [battery(100, 200, 8)] });
    // Only 8/sec can come out, however much is stored.
    expect(r.satisfaction).toBeCloseTo(quantiseSatisfaction(0.08), 6);
  });

  it('surplus charges storage before anything else', () => {
    const r = solve({ generation: 10, demand: 0, batteries: [battery(0)], sellCap: 100 });
    expect(r.batteryDeltas[0]).toBeCloseTo(10, 6);
    // A battery bank should protect you from overload, not merely earn less.
    expect(r.sold).toBe(0);
    expect(r.overflow).toBe(0);
  });

  it('sells only once storage is full', () => {
    const r = solve({ generation: 10, demand: 0, batteries: [battery(40, 40)], sellCap: 100 });
    expect(r.batteryDeltas[0]).toBe(0);
    expect(r.sold).toBeCloseTo(10, 6);
    expect(r.overflow).toBe(0);
  });

  it('caps selling at the tie intake and overloads on the rest', () => {
    const r = solve({ generation: 20, demand: 0, sellCap: 12 });
    expect(r.sold).toBeCloseTo(12, 6);
    expect(r.overflow).toBeCloseTo(8, 6);
  });

  it('charges several batteries in proportion to their free headroom', () => {
    const r = solve({
      generation: 12, demand: 0,
      batteries: [battery(0, 30), battery(20, 30)], // headroom 30 and 10
    });
    expect(r.batteryDeltas[0] / r.batteryDeltas[1]).toBeCloseTo(3, 6);
  });

  /**
   * The grid tie is the whole reason selling exists as a built thing rather
   * than an ambient rule: a grid that never reached the buyer sells nothing and
   * cooks itself instead.
   */
  it('a grid not wired to a tie sells nothing and overloads', () => {
    const r = solve({ generation: 15, demand: 0, sellCap: 0 });
    expect(r.sold).toBe(0);
    expect(r.overflow).toBeCloseTo(15, 6);
  });

  /**
   * Splitting a network to multiply sell income is self-defeating rather than
   * blocked: sellCap is a property of the tie's own component, so the halves
   * that no longer reach the tie simply cannot sell. No anti-exploit rule.
   */
  it('splitting a tied grid leaves only the tie-connected half selling', () => {
    const whole = solve({ generation: 20, demand: 0, sellCap: 12 });
    const tied = solve({ generation: 10, demand: 0, sellCap: 12 });
    const orphan = solve({ generation: 10, demand: 0, sellCap: 0 });

    expect(tied.sold + orphan.sold).toBeLessThan(whole.sold + 1e-9);
    expect(orphan.sold).toBe(0);
    expect(orphan.overflow).toBeCloseTo(10, 6);
  });

  it('never returns a negative overflow or an out-of-range satisfaction', () => {
    for (const [generation, demand] of [[0, 0], [100, 1], [1, 100], [0, 50], [50, 0]]) {
      const r = solve({ generation, demand, sellCap: 5 });
      expect(r.overflow).toBeGreaterThanOrEqual(0);
      expect(r.satisfaction).toBeGreaterThanOrEqual(0);
      expect(r.satisfaction).toBeLessThanOrEqual(1);
    }
  });
});

// ─── Motor response ──────────────────────────────────────────────────────────

describe('motor power response', () => {
  const B = MOTOR_BASELINE;

  it('an unpowered motor still idles rather than bricking', () => {
    expect(motorPowerFactor(0, B)).toBe(B);
    expect(B).toBeGreaterThan(0);
  });

  it('a fully powered motor runs at full torque', () => {
    expect(motorPowerFactor(1, B)).toBeCloseTo(1, 6);
  });

  it('rises monotonically with satisfaction', () => {
    let prev = -Infinity;
    for (let s = 0; s <= 1; s += 0.1) {
      const f = motorPowerFactor(s, B);
      expect(f).toBeGreaterThan(prev);
      prev = f;
    }
  });

  it('clamps out-of-range satisfaction rather than overdriving', () => {
    expect(motorPowerFactor(5, B)).toBeCloseTo(1, 6);
    expect(motorPowerFactor(-5, B)).toBe(B);
  });

  it('electricity is a real multiplier, not a rounding difference', () => {
    // If baseline crept back toward 1 the grid would still "work" and every
    // test would still pass, while the mechanic quietly stopped mattering.
    expect(motorPowerFactor(1, B) / motorPowerFactor(0, B)).toBeGreaterThan(3);
  });
});

describe('quantiseSatisfaction', () => {
  /**
   * Motor torque depends on satisfaction, and a torque change forces
   * RotationPhysicsSystem into an O(V+E) double BFS. Quantising is what stops a
   * continuously drifting grid from rebuilding every chain every frame.
   */
  it('snaps to a fixed number of steps', () => {
    const step = 1 / SATISFACTION_STEPS;
    expect(quantiseSatisfaction(0.5 + step / 8)).toBe(quantiseSatisfaction(0.5));
  });

  it('keeps the endpoints exact', () => {
    expect(quantiseSatisfaction(0)).toBe(0);
    expect(quantiseSatisfaction(1)).toBe(1);
  });
});
