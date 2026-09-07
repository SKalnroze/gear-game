import { describe, it, expect, vi } from 'vitest';
import { GEAR_BEHAVIOURS } from '../../src/gears/registry';
import { CONVERTER_GOLD_RATE } from '../../src/gears/behaviours/refinery';
import { GEAR_DEFINITIONS, turretMaxAmmo, miningOutput, converterOutput } from '../../src/constants/gear.constants';
import { TIER_TEETH, tierPower } from '../../src/constants/tier.constants';
import type { GearState, GearType, GearTier } from '../../src/types/gear.types';
import type { GearBehaviourCtx, Owner, StockResource } from '../../src/gears/types';
import type { ResourceState } from '../../src/types/economy.types';

function makeGear(type: GearType, tier: GearTier = 1, over: Partial<GearState> = {}): GearState {
  return {
    id: `g_${type}`, type, tier, teeth: TIER_TEETH[tier], x: 0, y: 0, owner: 'player',
    angularVelocity: 0, currentAngle: 0, accumulatedAngle: 0, isSpinning: false,
    isBurntOut: false, isJammed: false, jamStress: 0, frictionLoad: 0, torqueOutput: 0,
    hp: 50, maxHp: 100, crackLevel: 0, ...over,
  };
}

/**
 * A behaviour never sees a system class, so a plain object is a complete
 * stand-in. That is the whole reason the refactor is worth doing: every payout
 * rule in the game is now exercisable without booting Phaser.
 */
function makeCtx(gear: GearState, resources: Partial<ResourceState> = {}) {
  const res: ResourceState = { gold: 100, iron: 0, crystal: 0, aether: 0, ...resources };
  const gears = new Map<string, GearState>([[gear.id, gear]]);
  const reports: Array<{ text: string; color: number }> = [];
  const events: Array<{ event: string; payload: unknown }> = [];

  const ctx: GearBehaviourCtx = {
    gear,
    owner: 'player' as Owner,
    tier: gear.tier,
    power: tierPower(gear.tier),
    now: 0,
    world: { getAllGears: () => gears, updateGear: vi.fn() },
    economy: {
      earnGold: (_o, amt) => { res.gold += amt; },
      spendGold: (_o, amt) => { if (res.gold < amt) return false; res.gold -= amt; return true; },
      canAffordGold: (_o, amt) => res.gold >= amt,
      earnResource: (_o, t, amt) => { res[t] += amt; },
      spendResource: (_o, t, amt) => { if (res[t] < amt) return false; res[t] -= amt; return true; },
      getResources: () => res,
    },
    units: null,
    emit: (event, payload) => { events.push({ event, payload }); },
    report: (text, color) => { reports.push({ text, color }); },
  };
  return { ctx, res, reports, events, gears };
}

// ─── Structural invariants ───────────────────────────────────────────────────
//
// The net that the scattered `Record<GearType, ...>` maps never provided. Two
// spawners once shipped declared, tech-gated, documented and completely inert
// because one map entry was missing; these assertions are what make that class
// of gap impossible to reintroduce silently.

describe('registry completeness', () => {
  const types = Object.keys(GEAR_DEFINITIONS) as GearType[];

  it('every defined gear type has a behaviour spec', () => {
    for (const type of types) {
      expect(GEAR_BEHAVIOURS[type], `no behaviour spec for '${type}'`).toBeDefined();
      expect(GEAR_BEHAVIOURS[type].category).toBeTruthy();
    }
  });

  it('every behaviour spec corresponds to a defined gear type', () => {
    for (const type of Object.keys(GEAR_BEHAVIOURS) as GearType[]) {
      expect(GEAR_DEFINITIONS[type], `behaviour for undefined gear '${type}'`).toBeDefined();
    }
  });

  it('the factory category and the _spawner naming agree in both directions', () => {
    for (const type of types) {
      const isFactory = GEAR_BEHAVIOURS[type].category === 'factory';
      expect(isFactory, `'${type}' category/name mismatch`).toBe(type.endsWith('_spawner'));
    }
  });

  it('every gear that buys ammo also seeds it at placement', () => {
    for (const type of types) {
      const spec = GEAR_BEHAVIOURS[type];
      if (spec.category !== 'defense') continue;
      expect(spec.onPlace, `'${type}' buys ammo but never initialises it`).toBeDefined();
      expect(spec.onRotation).toBeDefined();
    }
  });
});

// ─── Placement ───────────────────────────────────────────────────────────────

describe('onPlace', () => {
  /**
   * Regression: the old inline placement check covered crossbow_turret and
   * artillery_turret but not minelayer, so a minelayer's maxAmmo stayed
   * undefined and the `?? 3` fallback at the use site capped every minelayer
   * at three mines no matter its size.
   */
  it('seeds ammo for all three ammo gears, minelayer included', () => {
    for (const type of ['crossbow_turret', 'artillery_turret', 'minelayer'] as const) {
      const gear = makeGear(type, 4);
      const { ctx } = makeCtx(gear);
      GEAR_BEHAVIOURS[type].onPlace!(ctx);
      expect(gear.ammo).toBe(0);
      expect(gear.maxAmmo, `'${type}' maxAmmo not seeded`).toBe(turretMaxAmmo(gear.teeth));
    }
  });

  it('minelayer ammo capacity now grows with tier instead of being stuck at 3', () => {
    const cap = (tier: GearTier) => {
      const gear = makeGear('minelayer', tier);
      GEAR_BEHAVIOURS.minelayer.onPlace!(makeCtx(gear).ctx);
      return gear.maxAmmo!;
    };
    expect(cap(5)).toBeGreaterThan(cap(1));
  });

  it('refuses to touch the economy at placement time', () => {
    // GearSystem passes a throwing economy port; a behaviour that charged the
    // player mid-drag should fail loudly rather than quietly take their gold.
    const gear = makeGear('crossbow_turret');
    const { ctx } = makeCtx(gear);
    const spent = vi.fn();
    GEAR_BEHAVIOURS.crossbow_turret.onPlace!({ ...ctx, economy: { ...ctx.economy, spendGold: spent } });
    expect(spent).not.toHaveBeenCalled();
  });
});

// ─── Extraction ──────────────────────────────────────────────────────────────

describe('miners', () => {
  const cases: Array<[GearType, StockResource]> = [
    ['iron_miner', 'iron'], ['crystal_miner', 'crystal'], ['aether_miner', 'aether'],
  ];

  it.each(cases)('%s earns miningOutput of its resource', (type, resource) => {
    const gear = makeGear(type, 1);
    const { ctx, res, reports } = makeCtx(gear);
    GEAR_BEHAVIOURS[type].onRotation!(ctx);
    expect(res[resource]).toBeCloseTo(miningOutput(gear.teeth), 6);
    expect(reports[0].text).toContain(resource);
  });

  it('a tier-3 miner yields exactly 2.25x a tier-1 one', () => {
    const yieldAt = (tier: GearTier) => {
      const gear = makeGear('iron_miner', tier);
      const { ctx, res } = makeCtx(gear);
      GEAR_BEHAVIOURS.iron_miner.onRotation!(ctx);
      return res.iron;
    };
    expect(yieldAt(3) / yieldAt(1)).toBeCloseTo(2.25, 6);
  });
});

// ─── Refining ────────────────────────────────────────────────────────────────

describe('converters', () => {
  const cases: Array<[GearType, StockResource]> = [
    ['iron_converter', 'iron'], ['crystal_converter', 'crystal'], ['aether_converter', 'aether'],
  ];

  it.each(cases)('%s burns its input for gold at the documented rate', (type, resource) => {
    const gear = makeGear(type, 1);
    const amount = converterOutput(gear.teeth);
    const { ctx, res } = makeCtx(gear, { gold: 0, [resource]: amount });
    GEAR_BEHAVIOURS[type].onRotation!(ctx);
    expect(res[resource]).toBeCloseTo(0, 6);
    expect(res.gold).toBeCloseTo(amount * CONVERTER_GOLD_RATE[resource], 6);
  });

  it.each(cases)('%s does nothing, and stays silent, when starved', (type, resource) => {
    const gear = makeGear(type, 1);
    const { ctx, res, reports } = makeCtx(gear, { gold: 0, [resource]: 0 });
    GEAR_BEHAVIOURS[type].onRotation!(ctx);
    expect(res.gold).toBe(0);
    // A starved converter is a normal mid-chain state, not an error to shout
    // about every single revolution.
    expect(reports).toHaveLength(0);
  });

  it('aether is worth more per unit than crystal, which beats iron', () => {
    expect(CONVERTER_GOLD_RATE.aether).toBeGreaterThan(CONVERTER_GOLD_RATE.crystal);
    expect(CONVERTER_GOLD_RATE.crystal).toBeGreaterThan(CONVERTER_GOLD_RATE.iron);
  });
});

// ─── Defense ─────────────────────────────────────────────────────────────────

describe('ammo gears', () => {
  it('buys one round per rotation and charges for it', () => {
    const gear = makeGear('crossbow_turret', 1, { ammo: 0, maxAmmo: 5 });
    const { ctx, res } = makeCtx(gear, { gold: 10 });
    GEAR_BEHAVIOURS.crossbow_turret.onRotation!(ctx);
    expect(gear.ammo).toBe(1);
    expect(res.gold).toBe(8);
  });

  it('reports full and spends nothing when at capacity', () => {
    const gear = makeGear('artillery_turret', 1, { ammo: 3, maxAmmo: 3 });
    const { ctx, res, reports } = makeCtx(gear, { gold: 100 });
    GEAR_BEHAVIOURS.artillery_turret.onRotation!(ctx);
    expect(gear.ammo).toBe(3);
    expect(res.gold).toBe(100);
    expect(reports[0].text).toBe('AMMO FULL');
  });

  it('buys nothing when it cannot afford the round', () => {
    const gear = makeGear('artillery_turret', 1, { ammo: 0, maxAmmo: 3 });
    const { ctx, res } = makeCtx(gear, { gold: 1 }); // shells cost 6
    GEAR_BEHAVIOURS.artillery_turret.onRotation!(ctx);
    expect(gear.ammo).toBe(0);
    expect(res.gold).toBe(1);
  });
});

// ─── Support ─────────────────────────────────────────────────────────────────

describe('support gears', () => {
  it('armour repairs itself for gold', () => {
    const gear = makeGear('armored', 1, { hp: 10, maxHp: 100 });
    const { ctx, res } = makeCtx(gear, { gold: 50 });
    GEAR_BEHAVIOURS.armored.onRotation!(ctx);
    expect(gear.hp).toBeGreaterThan(10);
    expect(res.gold).toBeLessThan(50);
  });

  it('armour does not repair when broke', () => {
    const gear = makeGear('armored', 1, { hp: 10, maxHp: 100 });
    const { ctx } = makeCtx(gear, { gold: 0 });
    GEAR_BEHAVIOURS.armored.onRotation!(ctx);
    expect(gear.hp).toBe(10);
  });

  it('spikes mend for free', () => {
    const gear = makeGear('spiked', 1, { hp: 10, maxHp: 100 });
    const { ctx, res } = makeCtx(gear, { gold: 0 });
    GEAR_BEHAVIOURS.spiked.onRotation!(ctx);
    expect(gear.hp).toBeGreaterThan(10);
    expect(res.gold).toBe(0);
  });

  it('neither heals past maxHp', () => {
    for (const type of ['armored', 'spiked'] as const) {
      const gear = makeGear(type, 1, { hp: 100, maxHp: 100 });
      GEAR_BEHAVIOURS[type].onRotation!(makeCtx(gear, { gold: 500 }).ctx);
      expect(gear.hp).toBe(100);
    }
  });

  it('researcher emits a boost scaled by tier', () => {
    const boost = (tier: GearTier) => {
      const { ctx, events } = makeCtx(makeGear('researcher', tier));
      GEAR_BEHAVIOURS.researcher.onRotation!(ctx);
      return (events.find((e) => e.event === 'gear:research_boost')!.payload as { amount: number }).amount;
    };
    expect(boost(3) / boost(1)).toBeCloseTo(2.25, 6);
  });

  it('healer mends friendly gears but not enemy ones', () => {
    const healer = makeGear('healer', 3, { id: 'h', x: 0, y: 0 });
    const friend = makeGear('motor', 1, { id: 'f', x: 10, y: 0, hp: 10, maxHp: 100 });
    const enemy = makeGear('motor', 1, { id: 'e', x: 12, y: 0, hp: 10, maxHp: 100, owner: 'ai' });
    const { ctx } = makeCtx(healer);
    const gears = new Map([[healer.id, healer], [friend.id, friend], [enemy.id, enemy]]);
    GEAR_BEHAVIOURS.healer.onRotation!({ ...ctx, world: { ...ctx.world, getAllGears: () => gears } });
    expect(friend.hp).toBeGreaterThan(10);
    expect(enemy.hp).toBe(10);
  });

  it('sentry gear emits a pulse the minelayer reveal logic can hear', () => {
    const { ctx, events } = makeCtx(makeGear('sentry_gear', 2));
    GEAR_BEHAVIOURS.sentry_gear.onRotation!(ctx);
    expect(events.some((e) => e.event === 'sentry:pulse')).toBe(true);
  });
});
