import { describe, it, expect } from 'vitest';
import { UnitSystem } from '../../src/systems/UnitSystem';
import { World } from '../../src/world/World';
import type { EventBus } from '../../src/systems/EventBus';
import type { UnitState } from '../../src/types/unit.types';
import { PLAYER_BASE_X, AI_BASE_X } from '../../src/constants/world.constants';
import { computeChargeDamage } from '../../src/systems/unit.utils';
import { IRON_GUARD_DAMAGE_REDUCTION } from '../../src/constants/unit.constants';

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

  describe('a flipped world (AI left, human right)', () => {
    function flippedRig() {
      const r = makeRig();
      r.world.setPlayerOnRight(true);
      return r;
    }

    it('units spawn on their own side', () => {
      const r = flippedRig();
      r.system.spawnSingleFromGear('player', 'infantry', 10);
      r.system.spawnSingleFromGear('ai', 'infantry', 10);

      const [playerUnit, aiUnit] = r.spawned();
      // Human is on the right now, so its units start further along x.
      expect(playerUnit.x).toBeGreaterThan(aiUnit.x);
    });

    it('units march toward the enemy, not their own base', () => {
      const r = flippedRig();
      r.system.spawnSingleFromGear('player', 'infantry', 10);
      r.system.spawnSingleFromGear('ai', 'infantry', 10);

      const before = [...r.system.getAllUnits().values()].map(u => ({ id: u.id, owner: u.owner, x: u.x }));
      for (let i = 0; i < 10; i++) r.system.update(0.1, i * 100, noProjectiles);

      for (const prev of before) {
        const now = r.system.getUnit(prev.id)!;
        const moved = now.x - prev.x;
        // Flipped: the human side marches left (-x), the AI right (+x).
        // This is the bug that made a player unit walk into its own base.
        expect(Math.sign(moved)).toBe(prev.owner === 'player' ? -1 : 1);
      }
    });

    it('arrival triggers at the enemy base, not the home base', () => {
      const r = flippedRig();
      r.system.spawnSingleFromGear('player', 'infantry', 10);

      const unit = [...r.system.getAllUnits().values()][0];
      // AI_BASE_X is the human's *own* base once flipped: no arrival here.
      unit.x = AI_BASE_X;
      r.system.update(0.016, 0, noProjectiles);
      expect(r.events('unit:reached_base')).toHaveLength(0);

      unit.x = PLAYER_BASE_X;
      r.system.update(0.016, 0, noProjectiles);
      expect(r.events('unit:reached_base')).toHaveLength(1);
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

  describe('counter matrix applies outside CombatSystem too', () => {
    /** Place two units of the given types at contact distance, facing each other. */
    function faceOff(attackerOwner: 'player' | 'ai', attackerType: string, defenderType: string) {
      const r = makeRig();
      const defenderOwner = attackerOwner === 'player' ? 'ai' : 'player';
      r.system.spawnSingleFromGear(attackerOwner, attackerType as any, 10);
      r.system.spawnSingleFromGear(defenderOwner, defenderType as any, 10);

      const units = [...r.system.getAllUnits().values()];
      const attacker = units.find(u => u.type === attackerType)!;
      const defender = units.find(u => u.type === defenderType)!;
      // Same spot so contact/detection triggers on the first tick regardless of side facing.
      defender.x = attacker.x;
      defender.y = attacker.y;
      return { ...r, attacker, defender };
    }

    it('cavalry deals the favored 2x to infantry via its own charge-hit code path', () => {
      const r = faceOff('player', 'cavalry', 'infantry');
      const hpBefore = r.defender.hp;

      // Cavalry needs to be mid-charge to hit; give it a tick to accelerate into contact range.
      r.system.update(0.05, 0, noProjectiles);

      const dealt = r.events('unit:damaged').find(e => e.payload.unitId === r.defender.id);
      expect(dealt).toBeDefined();
      // Base cavalry charge damage at chargeAccum~0 is baseDamage itself; counter mult is 2x.
      expect(hpBefore - r.defender.hp).toBeCloseTo(dealt!.payload.damage, 6);
      expect(dealt!.payload.damage).toBeGreaterThan(r.attacker.baseDamage); // counter mult inflated it
    });

    it('Iron Guard takes reduced damage from a cavalry charge', () => {
      const r = faceOff('player', 'cavalry', 'iron_guard');
      const hpBefore = r.defender.hp;

      r.system.update(0.05, 0, noProjectiles);

      const dealt = r.events('unit:damaged').find(e => e.payload.unitId === r.defender.id);
      expect(dealt).toBeDefined();
      // cavalry->iron_guard counter is 0.5x; armor knocks IRON_GUARD_DAMAGE_REDUCTION off that.
      // chargeAccum has advanced by one tick (0.05s * accel) before the contact check fires.
      const rawChargeDmg = computeChargeDamage(r.attacker.baseDamage, 0.05 * 200);
      expect(dealt!.payload.damage).toBeCloseTo(rawChargeDmg * 0.5 * IRON_GUARD_DAMAGE_REDUCTION, 6);
    });
  });

  describe('crystal sentinel shield aura', () => {
    it('shields a nearby ally, reducing damage that ally takes afterward', () => {
      const r = makeRig();
      r.system.spawnSingleFromGear('player', 'crystal_sentinel', 10);
      r.system.spawnSingleFromGear('player', 'infantry', 10);
      r.system.spawnSingleFromGear('ai', 'infantry', 10); // gives the sentinel a target to fire at

      const sentinel = [...r.system.getAllUnits().values()].find(u => u.type === 'crystal_sentinel')!;
      const ally = [...r.system.getAllUnits().values()].find(u => u.type === 'infantry' && u.owner === 'player')!;
      const enemy = [...r.system.getAllUnits().values()].find(u => u.owner === 'ai')!;
      ally.x = sentinel.x;
      ally.y = sentinel.y; // well within the aura radius
      enemy.x = sentinel.x + 50; // in range so the sentinel actually fires this tick
      enemy.y = sentinel.y;

      expect(ally.shieldFactor).toBe(1);
      r.system.update(0.05, 900, noProjectiles); // > 800ms cooldown gate uses now, not elapsed -- 900 clears lastAttackTime=0

      expect(ally.shieldFactor).toBeLessThan(1);
      expect(ally.shieldTimer).toBeGreaterThan(0);
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
