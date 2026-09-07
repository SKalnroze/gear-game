/**
 * The gear behaviour contract.
 *
 * What a gear *does* used to live in a 150-line `if (gear.type === ...)` chain
 * inside EconomySystem, with more branches scattered across GearSystem,
 * TurretSystem and MinelayerSystem. Adding a gear type meant finding every one
 * of them, and nothing told you when you had missed one -- the crossbow and
 * sentry spawners shipped declared, tech-gated, documented, and completely
 * inert because a single map entry was never added.
 *
 * A behaviour is now a plain function of a context object. It has no reference
 * to any system class and no Phaser import, so it can be exercised in a unit
 * test against a hand-built fake context -- the same convention as
 * systems/unit.utils.ts.
 *
 * The ports below are deliberately narrow: a behaviour gets exactly the verbs
 * it needs and cannot reach into a system to do something unexpected.
 */

import type { GearState, GearTier, GearType } from '../types/gear.types';
import type { ResourceState } from '../types/economy.types';
import type { UnitState } from '../types/unit.types';
import type { GameEventMap } from '../types/events.types';

export type Owner = 'player' | 'ai';

/** Resources a gear can mine or spend. Gold is handled by its own verbs. */
export type StockResource = 'iron' | 'crystal' | 'aether';

/**
 * Broad role of a gear, used for grouping in the UI and for the structural
 * assertions in tests (e.g. every 'factory' must have both a behaviour and a
 * unit mapping).
 */
export type GearCategory =
  | 'power'        // generators, batteries, poles, cranks
  | 'factory'      // builds units, one per full rotation
  | 'extraction'   // miners
  | 'refinery'     // converters, oilers
  | 'support'      // healer, researcher, sentry
  | 'defense'      // turrets, minelayer
  | 'structural';  // spiked, armored, relief valve, amplifier

export interface EconomyPort {
  earnGold(owner: Owner, amount: number): void;
  spendGold(owner: Owner, amount: number): boolean;
  canAffordGold(owner: Owner, amount: number): boolean;
  earnResource(owner: Owner, type: StockResource, amount: number): void;
  spendResource(owner: Owner, type: StockResource, amount: number): boolean;
  getResources(owner: Owner): ResourceState;
}

export interface WorldPort {
  getAllGears(): Map<string, GearState>;
  updateGear(gear: GearState): void;
}

export interface UnitPort {
  getAllUnits(): Map<string, UnitState>;
}

export type EmitFn = <K extends keyof GameEventMap>(event: K, payload: GameEventMap[K]) => void;

export interface GearBehaviourCtx {
  gear: GearState;
  owner: Owner;
  /** Resolved from gear.tier, so behaviours never re-derive it. */
  tier: GearTier;
  /** tierPower(tier) -- the ×1.5-per-tier strength scalar, pre-computed. */
  power: number;
  now: number;
  world: WorldPort;
  economy: EconomyPort;
  /** Null before UnitSystem is wired in; behaviours must tolerate that. */
  units: UnitPort | null;
  emit: EmitFn;
  /** Shorthand for the floating text a rotation puts over the gear. */
  report(text: string, color: number): void;
}

export type GearBehaviour = (ctx: GearBehaviourCtx) => void;

/**
 * What a gear type does. Every hook is optional; a gear with none is inert
 * scenery (armour, spikes handled elsewhere).
 */
export interface GearBehaviourSpec {
  category: GearCategory;
  /** Runs once when the gear is placed -- initial ammo, buffers, and so on. */
  onPlace?: GearBehaviour;
  /** Runs on every completed rotation. The main production hook. */
  onRotation?: GearBehaviour;
}

export type GearBehaviourRegistry = Record<GearType, GearBehaviourSpec>;
