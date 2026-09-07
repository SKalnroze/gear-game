import { describe, it, expect } from 'vitest';
import { GearUnitInteractionSystem } from '../../src/systems/GearUnitInteractionSystem';
import { World } from '../../src/world/World';
import type { EventBus } from '../../src/systems/EventBus';
import type { GearState } from '../../src/types/gear.types';
import type { UnitState } from '../../src/types/unit.types';
import { tierForTeeth, TIER_TEETH } from '../../src/constants/tier.constants';

/**
 * The grid only rebuilds once per update() call. Two units hitting the same
 * low-hp gear in one call used to resurrect it: the first kill removed it
 * from World, but the second unit's stale grid candidate (same object,
 * hp=0) still made it through to world.updateGear(gear), which blindly
 * re-inserted it with no meshGraph entry, no owner index, and no sprite --
 * an untargetable zombie that units would still path onto forever.
 */

interface Emitted { event: string; payload: any }

function makeBus(world: World) {
  const emitted: Emitted[] = [];
  const handlers = new Map<string, ((p: any) => void)[]>();
  const bus = {
    emit: (event: string, payload: any) => {
      emitted.push({ event, payload });
      for (const h of handlers.get(event) ?? []) h(payload);
    },
    on: (event: string, handler: (p: any) => void) => {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    once: () => {},
    off: () => {},
    removeAllListeners: () => {},
    destroy: () => {},
  };
  // Mimic GameScene's own wiring: gear:destroyed -> actually remove it from World.
  (bus.on as any)('gear:destroyed', ({ gearId }: { gearId: string }) => world.removeGear(gearId));
  return { bus: bus as unknown as EventBus, emitted };
}

function makeGear(id: string, hp: number): GearState {
  return {
    id, type: 'motor', tier: 1, teeth: TIER_TEETH[1], x: 0, y: 0, owner: 'ai',
    angularVelocity: 0, currentAngle: 0, accumulatedAngle: 0,
    frictionLoad: 0, torqueOutput: 0, isSpinning: false, isBurntOut: false,
    hp, maxHp: 100, isJammed: false, crackLevel: 0, jamStress: 0,
  };
}

function makeUnit(id: string, x: number, baseDamage: number): UnitState {
  return {
    id, type: 'infantry', hp: 30, maxHp: 30, x, y: 0, owner: 'player',
    speed: 60, baseDamage, inCombat: false, reachedBase: false, damage: 3,
    frictionValue: 0, size: 12, attackRange: 36, mass: 10,
    vx: 0, vy: 0, behaviorState: 'marching', lastAttackTime: 0,
    chargeAccum: 0, retreatTimer: 0, slowTimer: 0, slowFactor: 1,
    shieldTimer: 0, shieldFactor: 1,
  } as UnitState;
}

describe('GearUnitInteractionSystem', () => {
  it('a second unit hitting an already-destroyed gear in the same tick cannot resurrect it', () => {
    const world = new World();
    const { bus, emitted } = makeBus(world);
    const system = new GearUnitInteractionSystem(world, bus);

    const gear = makeGear('g1', 1); // 1 hp -- any hit kills it
    world.placeGear(gear);

    const unitA = makeUnit('a', 0, 100); // damage = 100 * rate * deltaSec, one-shots the gear
    const unitB = makeUnit('b', 0, 100); // same spot, same contact -- stale candidate after A kills it
    const allUnits = new Map([[unitA.id, unitA], [unitB.id, unitB]]);
    const allGears = world.getAllGears();

    system.update(1, allUnits, allGears);

    expect(world.getGear('g1')).toBeUndefined();
    expect(emitted.filter(e => e.event === 'gear:destroyed')).toHaveLength(1);
  });
});
