/**
 * Turrets and the minelayer: a rotation buys one round of ammunition.
 *
 * All three were byte-identical branches apart from cost, noun and colour, and
 * all three also needed their ammo fields seeding at placement -- which lived
 * somewhere else entirely, in GearSystem.tryPlace, and covered only two of the
 * three. Keeping `onPlace` and `onRotation` in one spec is what stops that kind
 * of gap reopening.
 */

import { turretMaxAmmo } from '../../constants/gear.constants';
import type { GearBehaviour, GearBehaviourSpec } from '../types';

export interface AmmoSpec {
  goldCost: number;
  /** Singular noun shown in the floating text, e.g. "shell". */
  noun: string;
  color: number;
  fullColor: number;
}

function buyAmmo(spec: AmmoSpec): GearBehaviour {
  return (ctx) => {
    const { gear } = ctx;
    const maxAmmo = gear.maxAmmo ?? 3;
    const current = gear.ammo ?? 0;

    if (current >= maxAmmo) {
      ctx.report('AMMO FULL', spec.fullColor);
      return;
    }
    if (!ctx.economy.canAffordGold(ctx.owner, spec.goldCost)) return;

    ctx.economy.spendGold(ctx.owner, spec.goldCost);
    gear.ammo = current + 1;
    ctx.world.updateGear(gear);
    ctx.report(`+1 ${spec.noun} (${gear.ammo}/${maxAmmo})`, spec.color);
  };
}

const initAmmo: GearBehaviour = (ctx) => {
  ctx.gear.ammo = 0;
  ctx.gear.maxAmmo = turretMaxAmmo(ctx.gear.teeth);
};

export function ammoGear(spec: AmmoSpec): GearBehaviourSpec {
  return { category: 'defense', onPlace: initAmmo, onRotation: buyAmmo(spec) };
}

export const CROSSBOW_AMMO: AmmoSpec = {
  goldCost: 2, noun: 'ammo', color: 0xffdd00, fullColor: 0xffaa00,
};
export const ARTILLERY_AMMO: AmmoSpec = {
  goldCost: 6, noun: 'shell', color: 0xff6600, fullColor: 0xff8800,
};
export const MINELAYER_AMMO: AmmoSpec = {
  goldCost: 5, noun: 'mine', color: 0xff4488, fullColor: 0xff4488,
};
