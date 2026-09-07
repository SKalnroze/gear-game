/**
 * Converters: burn a stockpiled resource for gold, once per rotation.
 *
 * The gold-per-unit rate is what separates the three, so it is the only
 * parameter. A converter that cannot afford its own input simply does nothing
 * that rotation -- deliberately silent, because a starved converter is a normal
 * mid-chain state, not an error worth shouting about every revolution.
 */

import { converterOutput } from '../../constants/gear.constants';
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
