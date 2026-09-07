/**
 * Converters: burn a stockpiled resource for gold, once per rotation.
 *
 * The gold-per-unit rate is what separates the three, so it is the only
 * parameter. A converter that cannot afford its own input simply does nothing
 * that rotation -- deliberately silent, because a starved converter is a normal
 * mid-chain state, not an error worth shouting about every revolution.
 */

import { converterOutput } from '../../constants/gear.constants';
import { oilCapacityFor } from '../../systems/thermal.utils';
import { OILER_CAPACITY_MULT, OIL_PER_ROTATION, COAL_PER_OIL_ROTATION } from '../../constants/thermal.constants';
import type { GearBehaviour } from '../types';

/**
 * Resources a converter can turn into gold. Coal is deliberately excluded: it
 * is feedstock for burners and oilers, and letting it be sold directly would
 * give the coal chain a way to make gold without ever building a grid.
 */
export type ConvertibleResource = 'iron' | 'crystal' | 'aether';

/** Gold produced per unit of input consumed. */
export const CONVERTER_GOLD_RATE: Record<ConvertibleResource, number> = {
  iron: 2,
  crystal: 3,
  aether: 6,
};

export function converterBehaviour(resource: ConvertibleResource): GearBehaviour {
  return (ctx) => {
    const amount = converterOutput(ctx.gear.teeth);
    if (ctx.economy.getResources(ctx.owner)[resource] < amount) return;

    ctx.economy.spendResource(ctx.owner, resource, amount);
    const gold = amount * CONVERTER_GOLD_RATE[resource];
    ctx.economy.earnGold(ctx.owner, gold);
    ctx.report(`+${gold.toFixed(1)}g`, 0xffdd44);
  };
}

/**
 * The oiler: coal in, oil into its own large reservoir.
 *
 * It only ever fills itself. Distribution is diffusion's job -- oil spreads
 * along meshed teeth from wherever it is made, so the oiler's POSITION decides
 * which part of the machine can safely run fast. An oiler that pushed oil
 * everywhere at once would make that placement decision meaningless.
 */
export const oilerBehaviour: GearBehaviour = (ctx) => {
  const { gear } = ctx;
  const capacity = oilCapacityFor(gear.tier) * OILER_CAPACITY_MULT;
  gear.oil ??= 0;
  if (gear.oil >= capacity) {
    ctx.report('OIL FULL', 0xffcc66);
    return;
  }

  const coal = COAL_PER_OIL_ROTATION * ctx.power;
  if (!ctx.economy.spendResource(ctx.owner, 'coal', coal)) return;

  const made = OIL_PER_ROTATION * ctx.power;
  gear.oil = Math.min(capacity, gear.oil + made);
  ctx.world.updateGear(gear);
  ctx.report(`+${made.toFixed(1)} oil`, 0xffcc66);
};

/** Oilers start dry -- the first rotation has to earn the first oil. */
export const initOiler: GearBehaviour = (ctx) => {
  ctx.gear.oil = 0;
};
