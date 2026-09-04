import { describe, it, expect } from 'vitest';
import { World } from '../../src/world/World';
import { GearMeshGraph } from '../../src/world/GearMeshGraph';
import { GearSystem } from '../../src/systems/GearSystem';
import { EconomySystem } from '../../src/systems/EconomySystem';
import { UnitSystem } from '../../src/systems/UnitSystem';
import { ProjectileSystem } from '../../src/systems/ProjectileSystem';
import { RotationPhysicsSystem } from '../../src/systems/RotationPhysicsSystem';
import { MinelayerSystem } from '../../src/systems/MinelayerSystem';
import { GameClock } from '../../src/systems/GameClock';
import type { EventBus } from '../../src/systems/EventBus';
import type { TechState } from '../../src/types/tech.types';

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

describe('new Phase 4 content sanity', () => {
  it('slime dies and creates a puddle that slows a nearby unit and adds gear friction', () => {
    const bus = makeBus();
    const clock = new GameClock();
    const world = new World();
    world.setPlayerOnRight(false);
    const meshGraph = new GearMeshGraph();
    const playerTech: TechState = { researched: new Set(), queue: [], unlockedTeeth: [10] };
    const aiTech: TechState = { researched: new Set(), queue: [], unlockedTeeth: [10] };
    const gearSystem = new GearSystem(world, meshGraph, bus, playerTech, aiTech, clock);
    const economySystem = new EconomySystem(bus, world);
    const unitSystem = new UnitSystem(bus);
    unitSystem.setWorld(world);
    unitSystem.setEconomySystem(economySystem);
    const projectileSystem = new ProjectileSystem();

    const gear = gearSystem.tryPlace('motor', 10, 500, 700, 'player', true)!;
    expect(gear).toBeTruthy();

    unitSystem.spawnSingleFromGear('ai', 'slime', 10);
    unitSystem.spawnSingleFromGear('player', 'infantry', 10);
    const units = [...unitSystem.getAllUnits().values()];
    const slime = units.find(u => u.type === 'slime')!;
    const victim = units.find(u => u.type === 'infantry')!;
    slime.x = 500; slime.y = 700; slime.hp = 0;
    victim.x = 505; victim.y = 700;

    unitSystem.update(0.016, clock.now, projectileSystem); // kills slime, creates puddle
    clock.advance(16);
    unitSystem.update(0.016, clock.now, projectileSystem); // applies puddle effects

    // Puddle should have slowed the victim and added friction to the nearby gear
    expect(victim.slowFactor).toBeLessThan(1);
    const gearAfter = world.getGear(gear.id)!;
    expect(gearAfter.frictionLoad).toBeGreaterThan(0);
  });

  it('sentry pulse reveals a hidden enemy mine to MinelayerSystem', () => {
    const bus = makeBus();
    const world = new World();
    world.setPlayerOnRight(false);
    const minelayerSystem = new MinelayerSystem(world, bus);
    const projectileSystem = new ProjectileSystem();

    bus.emit('mine:landed', { x: 100, y: 100, owner: 'ai', radius: 30, damage: 10 });
    const mine = [...minelayerSystem.getMines().values()][0];
    expect(mine.revealedUntil).toBeUndefined();

    minelayerSystem.update(0.016, 1000, new Map(), projectileSystem);
    bus.emit('sentry:pulse', { owner: 'player', x: 100, y: 100, radius: 150 });
    minelayerSystem.update(0.016, 2000, new Map(), projectileSystem);

    expect(mine.revealedUntil).toBeGreaterThan(2000);
  });

  it('relief valve reduces its own jam damage vs a plain gear at the same stress', () => {
    const bus = makeBus();
    const clock = new GameClock();
    const world = new World();
    world.setPlayerOnRight(false);
    const meshGraph = new GearMeshGraph();
    const playerTech: TechState = { researched: new Set(), queue: [], unlockedTeeth: [10] };
    const aiTech: TechState = { researched: new Set(), queue: [], unlockedTeeth: [10] };
    const gearSystem = new GearSystem(world, meshGraph, bus, playerTech, aiTech, clock);
    const rotationPhysics = new RotationPhysicsSystem(world, meshGraph, bus, clock);

    const relief = gearSystem.tryPlace('relief_valve', 10, 500, 700, 'player', true)!;
    const plain = gearSystem.tryPlace('spiked', 10, 600, 700, 'player', true)!;
    relief.isJammed = true;
    relief.jamStress = 10;
    plain.isJammed = true;
    plain.jamStress = 10;
    (rotationPhysics as any).jamStressMap.set(relief.id, 10);
    (rotationPhysics as any).jamStressMap.set(plain.id, 10);

    rotationPhysics.update(1);

    const reliefAfter = world.getGear(relief.id)!;
    const plainAfter = world.getGear(plain.id)!;
    expect(reliefAfter.hp).toBeGreaterThan(plainAfter.hp);
  });
});
