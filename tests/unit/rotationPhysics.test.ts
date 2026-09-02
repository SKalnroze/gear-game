import { describe, it, expect } from 'vitest';
import { RotationPhysicsSystem } from '../../src/systems/RotationPhysicsSystem';
import { World } from '../../src/world/World';
import { GearMeshGraph } from '../../src/world/GearMeshGraph';
import type { EventBus } from '../../src/systems/EventBus';
import { GameClock } from '../../src/systems/GameClock';
import type { GearState, GearType } from '../../src/types/gear.types';
import { gearRadius, motorTorque, motorOutput, INERTIA_DENSITY } from '../../src/constants/gear.constants';
import {
  AMPLIFIER_CHAIN_MULTIPLIER,
  OVERCLOCK_SPEED_BONUS,
  CAPACITOR_BURST_MULTIPLIER,
  CAPACITOR_BURST_ROTATIONS,
} from '../../src/constants/balance.constants';

const TWO_PI = Math.PI * 2;

interface Emitted { event: string; payload: any }

/**
 * Stub EventBus. The real one wraps Phaser's emitter, which needs a DOM;
 * these tests only care about what gets emitted, so record it instead.
 */
function makeBus() {
  const emitted: Emitted[] = [];
  const offCalls: string[] = [];
  const bus = {
    emit: (event: string, payload: unknown) => { emitted.push({ event, payload }); },
    on: () => {},
    once: () => {},
    off: (event: string) => { offCalls.push(event); },
    removeAllListeners: () => {},
    destroy: () => {},
  };
  return { bus: bus as unknown as EventBus, emitted, offCalls };
}

function makeGear(
  id: string, x: number, y: number, teeth: number, type: GearType = 'motor',
  overrides: Partial<GearState> = {},
): GearState {
  return {
    id,
    definitionKey: type,
    type,
    teeth,
    x,
    y,
    owner: 'player',
    angularVelocity: 0,
    currentAngle: 0,
    accumulatedAngle: 0,
    frictionLoad: 0,
    torqueOutput: 0,
    isSpinning: false,
    isBurntOut: false,
    hp: 1000,
    maxHp: 1000,
    isJammed: false,
    crackLevel: 0,
    jamStress: 0,
    ...overrides,
  };
}

/** Rotational inertia the system attributes to a gear, before ratio weighting. */
function inertiaOf(teeth: number): number {
  const r = gearRadius(teeth);
  return Math.PI * r * r * INERTIA_DENSITY;
}

interface Rig {
  world: World;
  graph: GearMeshGraph;
  physics: RotationPhysicsSystem;
  clock: GameClock;
  emitted: Emitted[];
  offCalls: string[];
  events: (name: string) => Emitted[];
}

function rig(gears: GearState[]): Rig {
  const world = new World();
  const graph = new GearMeshGraph();
  const { bus, emitted, offCalls } = makeBus();

  for (const g of gears) {
    world.placeGear(g);
    graph.addGear(g);
  }
  for (const g of gears) {
    graph.rebuildEdgesFor(g, world.getAllGears());
  }

  const clock = new GameClock();
  const physics = new RotationPhysicsSystem(world, graph, bus, clock);
  physics.rebuildChains();

  return {
    world, graph, physics, clock, emitted, offCalls,
    events: (name: string) => emitted.filter(e => e.event === name),
  };
}

describe('RotationPhysicsSystem', () => {
  describe('torque and omega', () => {
    it('a lone motor spins at torque / inertia', () => {
      const { world } = rig([makeGear('m', 0, 0, 10, 'motor')]);
      // 10 teeth: torque 80, r 25, inertia PI*625*0.01 = 19.635, so omega = 4.074
      const expected = motorTorque(10) / inertiaOf(10);
      expect(expected).toBeCloseTo(4.074, 3);
      expect(world.getGear('m')!.angularVelocity).toBeCloseTo(expected, 6);
      expect(world.getGear('m')!.isSpinning).toBe(true);
      expect(world.getGear('m')!.torqueOutput).toBe(motorTorque(10));
    });

    it('a chain with no motor does not spin', () => {
      const { world } = rig([
        makeGear('a', 0, 0, 10, 'amplifier'),
        makeGear('b', 50, 0, 10, 'amplifier'),
      ]);
      expect(world.getGear('a')!.angularVelocity).toBe(0);
      expect(world.getGear('a')!.isSpinning).toBe(false);
      expect(world.getGear('b')!.isSpinning).toBe(false);
    });

    it('a burnt-out motor drives nothing', () => {
      const { world } = rig([
        makeGear('m', 0, 0, 10, 'motor', { isBurntOut: true }),
        makeGear('b', 50, 0, 10, 'amplifier'),
      ]);
      expect(world.getGear('m')!.isSpinning).toBe(false);
      expect(world.getGear('b')!.isSpinning).toBe(false);
    });

    it('a meshed neighbour turns the opposite way', () => {
      const { world } = rig([
        makeGear('m', 0, 0, 10, 'motor'),
        makeGear('b', 50, 0, 10, 'amplifier'),
      ]);
      const m = world.getGear('m')!.angularVelocity;
      const b = world.getGear('b')!.angularVelocity;
      expect(Math.sign(m)).toBe(-Math.sign(b));
    });

    it('omega scales by the inverse tooth ratio', () => {
      // A 10-tooth motor drives a 20-tooth gear at half the speed, reversed.
      const { world } = rig([
        makeGear('m', 0, 0, 10, 'motor'),
        makeGear('b', 75, 0, 20, 'amplifier'),
      ]);
      const m = world.getGear('m')!.angularVelocity;
      const b = world.getGear('b')!.angularVelocity;
      expect(b).toBeCloseTo(-(m * 10 / 20), 6);

      // Chain inertia is ratio-weighted: I_m + I_b * (10/20)^2
      const expectedM = motorTorque(10) / (inertiaOf(10) + inertiaOf(20) * 0.25);
      expect(expectedM).toBeCloseTo(2.037, 3);
      expect(m).toBeCloseTo(expectedM, 6);
    });

    it('direction alternates along a three-gear run', () => {
      const { world } = rig([
        makeGear('m', 0, 0, 10, 'motor'),
        makeGear('b', 50, 0, 10, 'amplifier'),
        makeGear('c', 100, 0, 10, 'amplifier'),
      ]);
      const [m, b, c] = ['m', 'b', 'c'].map(id => world.getGear(id)!.angularVelocity);
      expect(Math.sign(b)).toBe(-Math.sign(m));
      expect(Math.sign(c)).toBe(Math.sign(m));
    });

    it('friction load slows the chain', () => {
      const clean = rig([makeGear('m', 0, 0, 10, 'motor')]);
      const loaded = rig([makeGear('m', 0, 0, 10, 'motor', { frictionLoad: 10 })]);
      const fast = clean.world.getGear('m')!.angularVelocity;
      const slow = loaded.world.getGear('m')!.angularVelocity;
      expect(slow).toBeLessThan(fast);
      expect(slow).toBeCloseTo(motorTorque(10) / (inertiaOf(10) + 10), 6);
    });

    it('an unmeshed motor does not drive a distant gear', () => {
      const { world } = rig([
        makeGear('m', 0, 0, 10, 'motor'),
        makeGear('far', 800, 0, 10, 'amplifier'),
      ]);
      expect(world.getGear('m')!.isSpinning).toBe(true);
      expect(world.getGear('far')!.isSpinning).toBe(false);
    });
  });

  describe('overclock', () => {
    // Times are game-clock ms, which starts at 0 for a fresh rig -- the system
    // no longer reads the wall clock, so pause and game speed apply to
    // overclock windows like everything else.
    const ACTIVE_UNTIL = 10_000;
    const ALREADY_EXPIRED = -1;

    /** motor - driven - overclock in a line; only the driven gear neighbours the overclock. */
    function overclockRig(until: number) {
      return rig([
        makeGear('m', 0, 0, 10, 'motor'),
        makeGear('b', 50, 0, 10, 'amplifier'),
        makeGear('oc', 100, 0, 10, 'overclock', { overclockUntil: until }),
      ]);
    }

    it('an active overclock neighbour boosts omega', () => {
      const active = overclockRig(ACTIVE_UNTIL);
      const expired = overclockRig(ALREADY_EXPIRED);
      const boosted = Math.abs(active.world.getGear('b')!.angularVelocity);
      const base = Math.abs(expired.world.getGear('b')!.angularVelocity);
      expect(boosted / base).toBeCloseTo(1 + OVERCLOCK_SPEED_BONUS, 6);
    });

    it('the boost expires as game time passes the window', () => {
      const r = overclockRig(ACTIVE_UNTIL);
      const boosted = Math.abs(r.world.getGear('b')!.angularVelocity);

      r.clock.advance(ACTIVE_UNTIL + 1);
      r.physics.rebuildChains();

      const after = Math.abs(r.world.getGear('b')!.angularVelocity);
      expect(after).toBeLessThan(boosted);
      expect(boosted / after).toBeCloseTo(1 + OVERCLOCK_SPEED_BONUS, 6);
    });

    it('a paused clock keeps the boost alive', () => {
      const r = overclockRig(ACTIVE_UNTIL);
      const boosted = Math.abs(r.world.getGear('b')!.angularVelocity);

      r.clock.setPaused(true);
      r.clock.advance(ACTIVE_UNTIL * 10);
      r.physics.rebuildChains();

      expect(Math.abs(r.world.getGear('b')!.angularVelocity)).toBeCloseTo(boosted, 6);
      expect(r.physics.checkOverclockBurnouts(r.clock.now)).toEqual([]);
    });

    it('burns out an overclock gear once its window closes', () => {
      const r = overclockRig(ALREADY_EXPIRED);
      const burnt = r.physics.checkOverclockBurnouts(r.clock.now);
      expect(burnt).toEqual(['oc']);
      expect(r.world.getGear('oc')!.isBurntOut).toBe(true);
      expect(r.world.getGear('oc')!.isSpinning).toBe(false);
      expect(r.events('gear:burnt_out')).toHaveLength(1);
    });

    it('does not burn out before the window closes', () => {
      const r = overclockRig(ACTIVE_UNTIL);
      expect(r.physics.checkOverclockBurnouts(r.clock.now)).toEqual([]);
      expect(r.world.getGear('oc')!.isBurntOut).toBe(false);
    });

    it('the no-burnout ability spares a player gear', () => {
      const r = overclockRig(ALREADY_EXPIRED);
      r.physics.setAbilitySystem({ isUnlocked: (id) => id === 'overclock_no_burnout' });
      expect(r.physics.checkOverclockBurnouts(r.clock.now)).toEqual([]);
      expect(r.world.getGear('oc')!.isBurntOut).toBe(false);
    });
  });

  describe('jams', () => {
    /** Equilateral triangle of equal gears: every pair sits at exactly r + r. */
    function ring3() {
      const r = gearRadius(10);
      const side = 2 * r;
      const h = side * Math.sqrt(3) / 2;
      return rig([
        makeGear('m', 0, 0, 10, 'motor'),
        makeGear('b', side, 0, 10, 'amplifier'),
        makeGear('c', side / 2, h, 10, 'amplifier'),
      ]);
    }

    it('an odd cycle jams because the loop demands both directions at once', () => {
      const r = ring3();
      expect(r.events('gear:jammed').length).toBeGreaterThan(0);

      const jammed = [...r.world.getAllGears().values()].filter(g => g.isJammed);
      expect(jammed.length).toBe(2);
      for (const g of jammed) {
        expect(g.angularVelocity).toBe(0);
        expect(g.isSpinning).toBe(false);
      }
    });

    it('an even cycle is consistent and does not jam', () => {
      // Square of side 2r: adjacent corners mesh, diagonals (2r * sqrt2) are too far.
      const side = 2 * gearRadius(10);
      const r = rig([
        makeGear('m', 0, 0, 10, 'motor'),
        makeGear('b', side, 0, 10, 'amplifier'),
        makeGear('c', side, side, 10, 'amplifier'),
        makeGear('d', 0, side, 10, 'amplifier'),
      ]);
      expect(r.events('gear:jammed')).toHaveLength(0);
      for (const g of r.world.getAllGears().values()) {
        expect(g.isJammed).toBe(false);
        expect(g.isSpinning).toBe(true);
      }
    });

    it('jammed gears take stress damage over time', () => {
      const r = ring3();
      const jammed = [...r.world.getAllGears().values()].find(g => g.isJammed)!;
      const before = jammed.hp;

      r.physics.update(1);

      const after = r.world.getGear(jammed.id)!.hp;
      expect(after).toBeLessThan(before);

      const dmg = r.events('gear:damaged')[0].payload.damage;
      expect(before - after).toBeCloseTo(dmg, 6);
      expect(r.events('gear:damaged')[0].payload.source).toBe('jam');
      expect(dmg).toBeGreaterThan(0);
    });

    it('jam damage raises the crack level as HP falls', () => {
      const r = ring3();
      const jammed = [...r.world.getAllGears().values()].find(g => g.isJammed)!;
      jammed.hp = jammed.maxHp * 0.5;
      r.world.updateGear(jammed);

      r.physics.update(0.1);
      expect(r.world.getGear(jammed.id)!.crackLevel).toBeGreaterThanOrEqual(2);
    });

    it('a gear destroyed by jamming is reported once, with HP floored at zero', () => {
      const r = ring3();
      const jammed = [...r.world.getAllGears().values()].find(g => g.isJammed)!;
      jammed.hp = 0.0001;
      r.world.updateGear(jammed);

      r.physics.update(1);

      const destroyed = r.events('gear:destroyed');
      expect(destroyed).toHaveLength(1);
      expect(destroyed[0].payload.gearId).toBe(jammed.id);
      expect(destroyed[0].payload.cause).toBe('jam');
      expect(r.world.getGear(jammed.id)!.hp).toBe(0);

      // No second death report on the following tick.
      r.physics.update(1);
      expect(r.events('gear:destroyed')).toHaveLength(1);
    });

    it('re-propagating clears stale jams', () => {
      const r = ring3();
      expect([...r.world.getAllGears().values()].some(g => g.isJammed)).toBe(true);

      // Break the ring: move one gear out of mesh range.
      const c = r.world.getGear('c')!;
      c.x = 900;
      r.world.updateGear(c);
      r.graph.rebuildEdgesFor(c, r.world.getAllGears());
      r.physics.rebuildChains();

      expect([...r.world.getAllGears().values()].some(g => g.isJammed)).toBe(false);
      expect(r.events('gear:jam_cleared').length).toBeGreaterThan(0);
    });
  });

  describe('rotation accounting', () => {
    it('accumulates angle and fires one full-rotation event per turn', () => {
      const r = rig([makeGear('m', 0, 0, 10, 'motor')]);
      const omega = r.world.getGear('m')!.angularVelocity;
      const oneTurn = (TWO_PI / Math.abs(omega)) * 1.001;

      r.physics.update(oneTurn);
      expect(r.events('gear:full_rotation')).toHaveLength(1);
      expect(r.events('gear:full_rotation')[0].payload.rotationCount).toBe(1);

      r.physics.update(oneTurn);
      expect(r.events('gear:full_rotation')).toHaveLength(2);
      expect(r.events('gear:full_rotation')[1].payload.rotationCount).toBe(2);
    });

    it('a partial turn fires nothing but still advances the angle', () => {
      const r = rig([makeGear('m', 0, 0, 10, 'motor')]);
      const omega = r.world.getGear('m')!.angularVelocity;

      r.physics.update((TWO_PI / Math.abs(omega)) * 0.5);
      expect(r.events('gear:full_rotation')).toHaveLength(0);
      expect(r.world.getGear('m')!.accumulatedAngle).toBeCloseTo(Math.PI, 4);
    });

    it('a single large step fires every rotation it covers', () => {
      const r = rig([makeGear('m', 0, 0, 10, 'motor')]);
      const omega = r.world.getGear('m')!.angularVelocity;

      r.physics.update((TWO_PI / Math.abs(omega)) * 3.5);
      expect(r.events('gear:full_rotation')).toHaveLength(3);
    });

    it('a stopped gear accumulates nothing', () => {
      const r = rig([
        makeGear('a', 0, 0, 10, 'amplifier'),
        makeGear('b', 50, 0, 10, 'amplifier'),
      ]);
      r.physics.update(10);
      expect(r.events('gear:full_rotation')).toHaveLength(0);
      expect(r.world.getGear('a')!.accumulatedAngle).toBe(0);
    });
  });

  describe('chain output', () => {
    function outputOf(r: Rig): number {
      const chain = r.physics.getChainForGear('m')!;
      return r.physics.computeChainOutput(chain, r.world.getAllGears());
    }

    it('a motor-only chain outputs its motor rating', () => {
      const r = rig([makeGear('m', 0, 0, 10, 'motor')]);
      expect(outputOf(r)).toBeCloseTo(motorOutput(10), 6);
    });

    it('an amplifier multiplies the chain', () => {
      const r = rig([
        makeGear('m', 0, 0, 10, 'motor'),
        makeGear('amp', 50, 0, 10, 'amplifier'),
      ]);
      expect(outputOf(r)).toBeCloseTo(motorOutput(10) * AMPLIFIER_CHAIN_MULTIPLIER, 6);
    });

    it('amplifiers stack multiplicatively', () => {
      const r = rig([
        makeGear('m', 0, 0, 10, 'motor'),
        makeGear('amp1', 50, 0, 10, 'amplifier'),
        makeGear('amp2', 100, 0, 10, 'amplifier'),
      ]);
      expect(outputOf(r)).toBeCloseTo(
        motorOutput(10) * AMPLIFIER_CHAIN_MULTIPLIER * AMPLIFIER_CHAIN_MULTIPLIER, 6,
      );
    });

    it('a burnt-out amplifier stops contributing', () => {
      const r = rig([
        makeGear('m', 0, 0, 10, 'motor'),
        makeGear('amp', 50, 0, 10, 'amplifier', { isBurntOut: true }),
      ]);
      expect(outputOf(r)).toBeCloseTo(motorOutput(10), 6);
    });

    it('two motors on one chain sum their output', () => {
      const r = rig([
        makeGear('m', 0, 0, 10, 'motor'),
        makeGear('m2', 75, 0, 20, 'motor'),
      ]);
      const chain = r.physics.getChainForGear('m')!;
      expect(r.physics.computeChainOutput(chain, r.world.getAllGears()))
        .toBeCloseTo(motorOutput(10) + motorOutput(20), 6);
    });

    it('the tech power bonus scales the result', () => {
      const r = rig([makeGear('m', 0, 0, 10, 'motor')]);
      r.physics.setPowerBonusPct('player', 0.25);
      expect(outputOf(r)).toBeCloseTo(motorOutput(10) * 1.25, 6);
    });

    it('a chain without a motor outputs nothing', () => {
      const r = rig([
        makeGear('a', 0, 0, 10, 'amplifier'),
        makeGear('b', 50, 0, 10, 'amplifier'),
      ]);
      const chain = r.physics.getChainForGear('a')!;
      expect(r.physics.computeChainOutput(chain, r.world.getAllGears())).toBe(0);
    });
  });

  describe('capacitor bursts', () => {
    function capRig() {
      return rig([
        makeGear('m', 0, 0, 10, 'motor'),
        makeGear('cap', 50, 0, 10, 'capacitor'),
      ]);
    }

    /** Advance the capacitor by exactly `turns` full rotations. */
    function spin(r: Rig, turns: number) {
      const omega = Math.abs(r.world.getGear('cap')!.angularVelocity);
      const oneTurn = (TWO_PI / omega) * 1.001;
      for (let i = 0; i < turns; i++) r.physics.update(oneTurn);
    }

    it('bursts once every CAPACITOR_BURST_ROTATIONS turns', () => {
      const r = capRig();
      spin(r, CAPACITOR_BURST_ROTATIONS - 1);
      expect(r.events('power:capacitor_burst')).toHaveLength(0);

      spin(r, 1);
      expect(r.events('power:capacitor_burst')).toHaveLength(1);

      spin(r, CAPACITOR_BURST_ROTATIONS);
      expect(r.events('power:capacitor_burst')).toHaveLength(2);
    });

    it('the burst releases the chain output times the burst multiplier', () => {
      const r = capRig();
      spin(r, CAPACITOR_BURST_ROTATIONS);

      const chain = r.physics.getChainForGear('cap')!;
      const chainOutput = r.physics.computeChainOutput(chain, r.world.getAllGears());
      const burst = r.events('power:capacitor_burst')[0].payload;
      expect(burst.powerReleased).toBeCloseTo(chainOutput * CAPACITOR_BURST_MULTIPLIER, 6);
      expect(burst.owner).toBe('player');
    });

    it('setCapacitorBurstMultiplier overrides the default', () => {
      const r = capRig();
      r.physics.setCapacitorBurstMultiplier('player', 10);
      spin(r, CAPACITOR_BURST_ROTATIONS);

      const chain = r.physics.getChainForGear('cap')!;
      const chainOutput = r.physics.computeChainOutput(chain, r.world.getAllGears());
      expect(r.events('power:capacitor_burst')[0].payload.powerReleased)
        .toBeCloseTo(chainOutput * 10, 6);
    });

    it('a non-capacitor gear never bursts', () => {
      const r = rig([
        makeGear('m', 0, 0, 10, 'motor'),
        makeGear('other', 50, 0, 10, 'amplifier'),
      ]);
      const omega = Math.abs(r.world.getGear('other')!.angularVelocity);
      for (let i = 0; i < CAPACITOR_BURST_ROTATIONS + 2; i++) {
        r.physics.update((TWO_PI / omega) * 1.001);
      }
      expect(r.events('power:capacitor_burst')).toHaveLength(0);
    });
  });

  describe('chain bookkeeping', () => {
    it('groups meshed gears into one chain and flags its contents', () => {
      const r = rig([
        makeGear('m', 0, 0, 10, 'motor'),
        makeGear('amp', 50, 0, 10, 'amplifier'),
        makeGear('cap', 100, 0, 10, 'capacitor'),
      ]);
      const chains = r.physics.getChains();
      expect(chains.size).toBe(1);

      const chain = [...chains.values()][0];
      expect(chain.gearIds.sort()).toEqual(['amp', 'cap', 'm']);
      expect(chain.hasMotor).toBe(true);
      expect(chain.hasAmplifier).toBe(true);
      expect(chain.hasCapacitor).toBe(true);
      expect(chain.owner).toBe('player');
    });

    it('separates gears that are not meshed into distinct chains', () => {
      const r = rig([
        makeGear('m', 0, 0, 10, 'motor'),
        makeGear('m2', 800, 0, 10, 'motor'),
      ]);
      expect(r.physics.getChains().size).toBe(2);
      expect(r.physics.getChainForGear('m')!.id)
        .not.toBe(r.physics.getChainForGear('m2')!.id);
    });

    it('getChainForGear returns undefined for an unknown gear', () => {
      const r = rig([makeGear('m', 0, 0, 10, 'motor')]);
      expect(r.physics.getChainForGear('nope')).toBeUndefined();
    });

    it('destroy unsubscribes from the mesh and placement events', () => {
      const r = rig([makeGear('m', 0, 0, 10, 'motor')]);
      r.physics.destroy();
      expect(r.offCalls.sort()).toEqual(['gear:mesh_updated', 'gear:placed', 'gear:removed']);
    });
  });
});
