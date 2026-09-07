/**
 * Miners: one resource per full rotation, scaled by tier.
 *
 * The three were three near-identical if-branches; they are now one factory
 * parameterised by resource, so a fourth (coal) is a single line rather than a
 * fourth copy that can drift.
 */

import { miningOutput } from '../../constants/gear.constants';
import type { GearBehaviour, StockResource } from '../types';

const MINER_COLORS: Record<StockResource, number> = {
  iron: 0xcc9966,
  crystal: 0x66ccff,
  aether: 0xcc66ff,
};

export function minerBehaviour(resource: StockResource): GearBehaviour {
  return (ctx) => {
    const amount = miningOutput(ctx.gear.teeth);
    ctx.economy.earnResource(ctx.owner, resource, amount);
    ctx.report(`+${amount.toFixed(1)} ${resource}`, MINER_COLORS[resource]);
  };
}
