import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { World } from '../../src/world/World';
import { GearMeshGraph } from '../../src/world/GearMeshGraph';
import { PowerGraph } from '../../src/world/PowerGraph';
import { PowerSystem } from '../../src/systems/PowerSystem';
import { GEAR_BEHAVIOURS } from '../../src/gears/registry';
import { GearSystem } from '../../src/systems/GearSystem';
import { EconomySystem } from '../../src/systems/EconomySystem';
import { WinConditionSystem } from '../../src/systems/WinConditionSystem';
import { RotationPhysicsSystem } from '../../src/systems/RotationPhysicsSystem';
import { TechSystem } from '../../src/systems/TechSystem';
import { UnitSystem } from '../../src/systems/UnitSystem';
import { GameClock } from '../../src/systems/GameClock';
import { AIController } from '../../src/ai/AIController';
import type { EventBus } from '../../src/systems/EventBus';
import type { TechState } from '../../src/types/tech.types';
import type { AIStrategyProfile, AIPersonality } from '../../src/types/ai.types';

/**
 * AIController (1250+ lines, substantially rewritten this session) had zero
 * unit tests. The headline fix this session replaced a fixed 2/3/5 chain
 * cap (never grew for the rest of the match) with a posture-driven capacity
 * that grows with gold income and match length. That fix was previously
 * tested only at the computePosture() helper level -- nothing simulated an
 * actual AIController across a match and confirmed chain count grows past
 * the old fixed cap. This does that.
 */

function makeBus(): EventBus {
  const handlers = new Map<string, ((p: any) => void)[]>();
  const bus = {
    emit: (event: string, payload: any) => { for (const h of handlers.get(event) ?? []) h(payload); },
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
  return bus as unknown as EventBus;
}

interface Rig {
  clock: GameClock;
  world: World;
  economySystem: EconomySystem;
  rotationPhysics: RotationPhysicsSystem;
  techSystem: TechSystem;
  ai: AIController;
  powerSystem: PowerSystem;
}

function makeRig(profile: AIStrategyProfile, personality: AIPersonality | 'random' = 'balanced'): Rig {
  const bus = makeBus();
  const clock = new GameClock();
  const world = new World();
  world.setPlayerOnRight(false);
  const meshGraph = new GearMeshGraph();
  const playerTech: TechState = { researched: new Set(), queue: [], unlockedTeeth: [10] };
  const aiTech: TechState = { researched: new Set(), queue: [], unlockedTeeth: [10] };

  const gearSystem = new GearSystem(world, meshGraph, bus, playerTech, aiTech, clock);
  const rotationPhysics = new RotationPhysicsSystem(world, meshGraph, bus, clock);
  const economySystem = new EconomySystem(bus, world);
  const unitSystem = new UnitSystem(bus);
  unitSystem.setWorld(world);
  unitSystem.setEconomySystem(economySystem);
  const winSystem = new WinConditionSystem(bus, false);
  const techSystem = new TechSystem(bus, economySystem, unitSystem, rotationPhysics, winSystem, playerTech, aiTech, clock);

  // The AI must have a power grid, exactly as GameScene gives it one. Without
  // it every motor idles at MOTOR_BASELINE forever, no chain ever matures, and
  // the AI bootstraps new chains without bound -- which is a real failure mode,
  // but not the configuration the game actually ships.
  const powerGraph = new PowerGraph((gear) => GEAR_BEHAVIOURS[gear.type].power?.role);
  const powerSystem = new PowerSystem(bus, world, powerGraph);
  powerSystem.setEconomySystem(economySystem);

  const ai = new AIController(
    bus, gearSystem, economySystem, unitSystem, winSystem, rotationPhysics,
    world, meshGraph, profile, personality, techSystem, 'ai', clock,
  );
  ai.setPowerGrid(powerGraph, powerSystem);

  return { clock, world, economySystem, rotationPhysics, techSystem, ai, powerSystem };
}

/**
 * Advance the whole rig by one AI-poll-sized tick (500ms).
 *
 * Adds a flat gold top-up standing in for the income a real chain's motors
 * would generate through actual gear rotation -- this rig doesn't drive
 * rotational physics realistically enough to spin gears up to speed, and
 * without it the AI is economy-starved (base passive income alone barely
 * covers research spending) regardless of how capacity grows, which would
 * make this test measure "is the economy rich enough" rather than "does
 * capacity translate into more chains," which is the thing #10 asked for.
 */
function tick(rig: Rig): void {
  rig.clock.advance(500);
  // Power first, exactly as GameScene orders it -- motor torque this step must
  // reflect this step's generation.
  rig.powerSystem.update(0.5, rig.clock.now);
  if (rig.powerSystem.consumePowerDirty()) rig.rotationPhysics.markChainsDirty();
  rig.rotationPhysics.update(0.5);
  rig.economySystem.update(rig.clock.now);
  rig.economySystem.earnGold('ai', 5);
  rig.techSystem.update(rig.clock.now);
  rig.ai.update(rig.clock.now);
}

/**
 * Deterministic mulberry32 PRNG, so slot-jitter/mistake randomness in
 * AIChainPlanner can't make chain-count growth flaky from run to run --
 * that randomness is already covered on its own in aiChainPlanner.test.ts;
 * here it's just noise around the thing actually under test (capacity).
 */
function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('AIController chain-count growth (proves the fixed-cap-plateau fix)', () => {
  let randomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    randomSpy = vi.spyOn(Math, 'random').mockImplementation(seededRandom(42));
  });

  afterEach(() => {
    randomSpy.mockRestore();
  });

  it('hard AI grows past the old fixed cap of 5 chains over a long match', () => {
    const rig = makeRig('hard', 'balanced');

    let countAt2Min = 0;
    for (let ms = 0; ms < 30 * 60_000; ms += 500) {
      tick(rig);
      if (ms === 2 * 60_000) countAt2Min = rig.ai.getDebugState().chainCount;
    }

    const finalCount = rig.ai.getDebugState().chainCount;

    // Old behaviour: hard AI capped permanently at 5 chains, reached early
    // and never exceeded for the rest of the match. New behaviour: capacity
    // grows with gold income and elapsed time, so a long match should blow
    // well past that old ceiling.
    expect(finalCount).toBeGreaterThan(5);
    // And it must be actual growth over time, not just a higher fixed number.
    expect(finalCount).toBeGreaterThan(countAt2Min);
    // 90s, not 20s: the AI now builds a generator alongside roughly every motor
    // and PowerSystem solves every grid each tick, so a 30-minute hard-AI
    // simulation moves about twice the gears it used to through a sim whose
    // cost is superlinear in gear count. The wall time is the test doing more
    // work, not the AI misbehaving -- chain growth itself is asserted above.
  }, 90_000);

  it('easy AI also grows past its own old fixed cap of 2, just more slowly than hard', () => {
    const rig = makeRig('easy', 'balanced');

    for (let ms = 0; ms < 20 * 60_000; ms += 500) {
      tick(rig);
    }

    expect(rig.ai.getDebugState().chainCount).toBeGreaterThan(2);
  }, 20_000);

  it('a longer match yields a higher chain-cap ceiling than a short one, for the same profile', () => {
    const short = makeRig('medium', 'balanced');
    for (let ms = 0; ms < 3 * 60_000; ms += 500) tick(short);

    const long = makeRig('medium', 'balanced');
    for (let ms = 0; ms < 18 * 60_000; ms += 500) tick(long);

    expect(long.ai.getDebugState().chainCount).toBeGreaterThan(short.ai.getDebugState().chainCount);
  }, 20_000);
});

describe('AIController smoke tests', () => {
  it('runs a full simulated match without throwing, across every difficulty and personality', () => {
    const profiles: AIStrategyProfile[] = ['easy', 'medium', 'hard'];
    const personalities: AIPersonality[] = ['rusher', 'economist', 'turtle', 'balanced'];

    for (const profile of profiles) {
      for (const personality of personalities) {
        const rig = makeRig(profile, personality);
        expect(() => {
          for (let ms = 0; ms < 5 * 60_000; ms += 500) tick(rig);
        }).not.toThrow();
      }
    }
  }, 30_000);

  it('getDebugState() stays well-formed throughout a match (owner, gold, chainSummaries in sync with chainCount)', () => {
    const rig = makeRig('medium', 'balanced');
    for (let ms = 0; ms < 8 * 60_000; ms += 500) {
      tick(rig);
    }
    const debug = rig.ai.getDebugState();
    expect(debug.owner).toBe('ai');
    expect(debug.gold).toBeGreaterThanOrEqual(0);
    expect(debug.chainSummaries.length).toBe(debug.chainCount);
  }, 20_000);

  it('practice profile never places gears or spends the action budget', () => {
    const rig = makeRig('practice', 'balanced');
    for (let ms = 0; ms < 5 * 60_000; ms += 500) tick(rig);
    expect(rig.world.getGearsOwnedBy('ai')).toHaveLength(0);
  }, 20_000);
});
