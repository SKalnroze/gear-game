/**
 * What every gear type does, in one place.
 *
 * `GearBehaviourRegistry` is a total `Record<GearType, ...>`, so adding a gear
 * type to the union without deciding what it does is a compile error. That is
 * the point: the previous arrangement scattered behaviour across five systems
 * and silently tolerated a type having none.
 *
 * This lives in src/gears/ rather than in gear.constants.ts on purpose --
 * behaviours import World and unit types, while gear.constants.ts must stay
 * dependency-light because tools/gen-design-docs.mjs bundles it to build the
 * design-doc tables.
 */

import type { GearBehaviourRegistry, GearBehaviourSpec } from './types';
import { minerBehaviour } from './behaviours/extraction';
import { crankBehaviour, initBattery, initBurner } from './behaviours/power';
import {
  SOLAR_OUTPUT, BURNER_OUTPUT, CRANK_OUTPUT, BATTERY_CAPACITY, MOTOR_DRAW, TIE_INTAKE,
} from '../constants/power.constants';
import { converterBehaviour, oilerBehaviour, initOiler } from './behaviours/refinery';
import {
  ammoGear, CROSSBOW_AMMO, ARTILLERY_AMMO, MINELAYER_AMMO,
} from './behaviours/defense';
import {
  researcherBehaviour, armoredBehaviour, spikedBehaviour,
  healerBehaviour, sentryGearBehaviour,
} from './behaviours/support';

/**
 * A gear whose only job is to turn: it shapes the chain (torque, ratio,
 * inertia) but pays out nothing per rotation. Handled by RotationPhysicsSystem.
 */
const inert = (category: GearBehaviourSpec['category']): GearBehaviourSpec => ({ category });

/** Factories spawn units; UnitSystem owns that, keyed off the same rotation event. */
const factory: GearBehaviourSpec = { category: 'factory' };

export const GEAR_BEHAVIOURS: GearBehaviourRegistry = {
  // ── Chain shaping ──────────────────────────────────────────────────────
  // A motor is the grid's only consumer today: electricity buys rotation speed,
  // which is the trade that replaced size-costs-speed.
  motor: { category: 'power', power: { role: 'consumer', draws: MOTOR_DRAW } },

  // ── Electrical ─────────────────────────────────────────────────────────
  crank: {
    category: 'power',
    power: { role: 'generator', generates: CRANK_OUTPUT },
    onRotation: crankBehaviour,
  },
  solar_panel: { category: 'power', power: { role: 'generator', generates: SOLAR_OUTPUT } },
  burner: {
    category: 'power',
    power: { role: 'generator', generates: BURNER_OUTPUT },
    onPlace: initBurner,
  },
  battery: {
    category: 'power',
    power: { role: 'battery', stores: BATTERY_CAPACITY },
    onPlace: initBattery,
  },
  power_pole: { category: 'power', power: { role: 'pole' } },
  grid_tie: { category: 'power', power: { role: 'tie', buys: TIE_INTAKE } },
  coal_miner: { category: 'extraction', onRotation: minerBehaviour('coal') },
  oiler: { category: 'refinery', onPlace: initOiler, onRotation: oilerBehaviour },
  amplifier: inert('structural'),
  capacitor: inert('structural'),
  overclock: inert('structural'),
  relief_valve: inert('structural'),

  // ── Structure ──────────────────────────────────────────────────────────
  spiked: { category: 'structural', onRotation: spikedBehaviour },
  armored: { category: 'structural', onRotation: armoredBehaviour },

  // ── Extraction ─────────────────────────────────────────────────────────
  iron_miner: { category: 'extraction', onRotation: minerBehaviour('iron') },
  crystal_miner: { category: 'extraction', onRotation: minerBehaviour('crystal') },
  aether_miner: { category: 'extraction', onRotation: minerBehaviour('aether') },

  // ── Refining ───────────────────────────────────────────────────────────
  iron_converter: { category: 'refinery', onRotation: converterBehaviour('iron') },
  crystal_converter: { category: 'refinery', onRotation: converterBehaviour('crystal') },
  aether_converter: { category: 'refinery', onRotation: converterBehaviour('aether') },

  // ── Support ────────────────────────────────────────────────────────────
  researcher: { category: 'support', onRotation: researcherBehaviour },
  healer: { category: 'support', onRotation: healerBehaviour },
  sentry_gear: { category: 'support', onRotation: sentryGearBehaviour },

  // ── Defense ────────────────────────────────────────────────────────────
  crossbow_turret: ammoGear(CROSSBOW_AMMO),
  artillery_turret: ammoGear(ARTILLERY_AMMO),
  minelayer: ammoGear(MINELAYER_AMMO),

  // ── Factories (unit production lives in UnitSystem) ────────────────────
  infantry_spawner: factory,
  artillery_spawner: factory,
  cavalry_spawner: factory,
  slime_spawner: factory,
  crossbow_spawner: factory,
  iron_guard_spawner: factory,
  crystal_sentinel_spawner: factory,
  aether_phantom_spawner: factory,
  sentry_spawner: factory,
  sapper_spawner: factory,
  skirmish_diver_spawner: factory,
  saboteur_spawner: factory,
  raider_spawner: factory,
  field_medic_spawner: factory,
};
