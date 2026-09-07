/**
 * Support and self-maintenance behaviours: researcher, healer, sentry pulse,
 * and the two gears that repair themselves as they turn.
 */

import {
  researcherOutput, healerOutput, healerRadius, gearRadius,
} from '../../constants/gear.constants';
import { distance } from '../../utils/MathUtils';
import type { GearBehaviour } from '../types';

export const researcherBehaviour: GearBehaviour = (ctx) => {
  const amount = researcherOutput(ctx.gear.teeth);
  ctx.emit('gear:research_boost', { owner: ctx.owner, amount });
  ctx.report(`+${(amount / 1000).toFixed(1)}s research`, 0x88ffee);
};

/**
 * Armour repairs itself for gold. It is the only gear that spends to maintain
 * itself, which is what makes a wall of armour an ongoing economic commitment
 * rather than a one-off purchase.
 */
export const armoredBehaviour: GearBehaviour = (ctx) => {
  const { gear } = ctx;
  const healAmount = Math.max(1, gear.teeth * 0.3);
  const goldCost = Math.max(1, Math.round(gear.teeth * 0.1));

  if (!ctx.economy.canAffordGold(ctx.owner, goldCost)) return;

  ctx.economy.spendGold(ctx.owner, goldCost);
  gear.hp = Math.min(gear.maxHp, gear.hp + healAmount);
  ctx.world.updateGear(gear);
  ctx.report(`+${healAmount.toFixed(1)} HP`, 0x44ff88);
};

/** Spikes mend slowly and for free -- they are meant to grind themselves down. */
export const spikedBehaviour: GearBehaviour = (ctx) => {
  const { gear } = ctx;
  const healAmount = Math.max(0.5, gear.teeth * 0.1);
  gear.hp = Math.min(gear.maxHp, gear.hp + healAmount);
  ctx.world.updateGear(gear);
  ctx.report(`+${healAmount.toFixed(1)} HP`, 0x88ff44);
};

export const healerBehaviour: GearBehaviour = (ctx) => {
  const { gear, owner } = ctx;
  const healAmount = healerOutput(gear.teeth);
  const radius = healerRadius(gear.teeth);

  for (const [, other] of ctx.world.getAllGears()) {
    if (other.id === gear.id || other.owner !== owner) continue;
    // Reach is measured to the other gear's rim, not its centre, so a big
    // neighbour is healed at the distance it visually touches the aura.
    if (distance(gear.x, gear.y, other.x, other.y) <= radius + gearRadius(other.teeth)) {
      other.hp = Math.min(other.maxHp, other.hp + healAmount);
      ctx.world.updateGear(other);
    }
  }

  if (ctx.units) {
    for (const [, unit] of ctx.units.getAllUnits()) {
      if (unit.owner !== owner) continue;
      if (distance(gear.x, gear.y, unit.x, unit.y) <= radius) {
        unit.hp = Math.min(unit.maxHp, unit.hp + healAmount);
      }
    }
  }

  ctx.report(`+${healAmount.toFixed(1)} heal`, 0x44ff88);
  ctx.emit('gear:healer_pulse', { gearId: gear.id, x: gear.x, y: gear.y, radius, owner });
};

/**
 * Stationary true-sight pulse -- the same signal the mobile Sentry unit emits,
 * so MinelayerSystem's reveal logic only needs to listen once.
 */
export const sentryGearBehaviour: GearBehaviour = (ctx) => {
  const radius = healerRadius(ctx.gear.teeth);
  ctx.emit('sentry:pulse', { owner: ctx.owner, x: ctx.gear.x, y: ctx.gear.y, radius });
  ctx.report('PULSE', 0x66ffcc);
};
