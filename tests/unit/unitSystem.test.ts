import { describe, it, expect } from 'vitest';
import { UnitSystem } from '../../src/systems/UnitSystem';
import { World } from '../../src/world/World';
import type { EventBus } from '../../src/systems/EventBus';
import type { UnitState } from '../../src/types/unit.types';
import { PLAYER_BASE_X, AI_BASE_X } from '../../src/constants/world.constants';

interface Emitted { event: string; payload: any }

/** Stub EventBus: the real one wraps a Phaser emitter and needs a DOM. */
function makeBus() {
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
  return { bus: bus as unknown as EventBus, emitted };
}

/** Only the four methods UnitSystem actually calls. */
function makeEconomy() {
  return {
    getResources: () => ({
      power: 9999, gold: 9999, iron: 9999, crystal: 9999, aether: 9999,
    }),
    spendGold: () => true,
    spendResource: () => true,
    canAffordGold: () => true,
  };
}

function makeRig() {
  const { bus, emitted } = makeBus();
  const world = new World();
  const system = new UnitSystem(bus);
  system.setWorld(world);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  system.setEconomySystem(makeEconomy() as any);
  return {
    system, world, emitted,
    events: (name: string) => emitted.filter(e => e.event === name),
    spawned: () => emitted.filter(e => e.event === 'unit:spawned').map(e => e.payload.unit as UnitState),
  };
}

/** ProjectileSystem stand-in: only fireArtilleryShell is reachable from update(). */
const noProjectiles = { fireArtilleryShell: () => {} } as any;

describe('UnitSystem', () => {
  describe('tech bonuses are per side', () => {
    it('a bonus researched by one side does not reach the other', () => {
      const r = makeRig();

      r.system.applyHpBonus('player', 'infantry', 1.0);   // +100% for the player only
      r.system.spawnSingleFromGear('player', 'infantry', 10);
      r.system.spawnSingleFromGear('ai', 'infantry', 10);

      const [playerUnit, aiUnit] = r.spawned();
      expect(playerUnit.owner).toBe('player');
      expect(aiUnit.owner).toBe('ai');
      // The AI unit must be unaffected; these used to be the same number.
      expect(playerUnit.hp).toBeCloseTo(aiUnit.hp * 2, 6);
    });

    it('speed and damage bonuses are likewise per side', () => {
      const r = makeRig();

      r.system.applySpeedBonus('ai', 'infantry', 0.5);
      r.system.applyDamageBonus('ai', 'infantry', 1.0);
      r.system.spawnSingleFromGear('player', 'infantry', 10);
      r.system.spawnSingleFromGear('ai', 'infantry', 10);

      const [playerUnit, aiUnit] = r.spawned();
      expect(aiUnit.speed).toBeCloseTo(playerUnit.speed * 1.5, 6);
      expect(aiUnit.baseDamage).toBe(playerUnit.baseDamage * 2);
    });

    it('bonuses accumulate within a side', () => {
      const r = makeRig();

      r.system.applyHpBonus('player', 'infantry', 0.25);
      r.system.applyHpBonus('player', 'infantry', 0.25);

      expect(r.system.getUnitBonuses('player', 'infantry').hp).toBeCloseTo(0.5, 6);
      expect(r.system.getUnitBonuses('ai', 'infantry').hp).toBe(0);
    });

    it('a bonus on one unit type does not leak to another', () => {
      const r = makeRig();

      r.system.applyHpBonus('player', 'cavalry', 5);

      expect(r.system.getUnitBonuses('player', 'infantry').hp).toBe(0);
    });
  });

  describe('units that reach a base are removed', () => {
    /** Drop a unit straight onto the enemy base and run one tick. */
    function arriveAtBase(owner: 'player' | 'ai') {
      const r = makeRig();
      r.system.spawnSingleFromGear(owner, 'infantry', 10);

      const unit = [...r.system.getAllUnits().values()][0];
      unit.x = owner === 'player' ? AI_BASE_X : PLAYER_BASE_X;

      r.system.update(0.016, 0, noProjectiles);
      return { ...r, unit };
    }

    it('a player unit reaching the AI base reports and is dropped', () => {
      const r = arriveAtBase('player');

      expect(r.events('unit:reached_base')).toHaveLength(1);
      // It used to stay in the map forever, growing it for the whole match.
      expect(r.system.getAllUnits().size).toBe(0);
    });

    it('an AI unit reaching the player base reports and is dropped', () => {
      const r = arriveAtBase('ai');

      expect(r.events('unit:reached_base')).toHaveLength(1);
      expect(r.system.getAllUnits().size).toBe(0);
    });

    it('arrival is reported exactly once, not once per frame', () => {
      const r = arriveAtBase('player');

      r.system.update(0.016, 0, noProjectiles);
      r.system.update(0.016, 0, noProjectiles);

      expect(r.events('unit:reached_base')).toHaveLength(1);
    });

    it('a unit short of the base is kept', () => {
      const r = makeRig();
      r.system.spawnSingleFromGear('player', 'infantry', 10);

      r.system.update(0.016, 0, noProjectiles);

      expect(r.events('unit:reached_base')).toHaveLength(0);
      expect(r.system.getAllUnits().size).toBe(1);
    });
  });

  describe('death', () => {
    it('a unit that dies is removed from the map', () => {
      const r = makeRig();
      r.system.spawnSingleFromGear('player', 'infantry', 10);

      const unit = [...r.system.getAllUnits().values()][0];
      unit.hp = 0;

      r.system.update(0.016, 0, noProjectiles);

      expect(r.events('unit:died')).toHaveLength(1);
      expect(r.system.getAllUnits().size).toBe(0);
    });
  });

  describe('spawning', () => {
    it('spawns one unit per call, owned by the requesting side', () => {
      const r = makeRig();

      r.system.spawnSingleFromGear('ai', 'infantry', 10);

      expect(r.system.getAllUnits().size).toBe(1);
      expect(r.spawned()[0].owner).toBe('ai');
    });

    it('stats scale with the spawner gear teeth', () => {
      const r = makeRig();

      r.system.spawnSingleFromGear('player', 'infantry', 10);
      r.system.spawnSingleFromGear('player', 'infantry', 30);

      const [small, large] = r.spawned();
      expect(large.hp).toBeGreaterThan(small.hp);
    });
  });
});
