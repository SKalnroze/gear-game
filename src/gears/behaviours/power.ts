/**
 * Electrical gear behaviours.
 *
 * Generation itself is resolved by PowerSystem each tick, not here -- a
 * generator's output depends on the state of the whole grid, which no
 * per-gear hook can see. What lives here is the per-gear bookkeeping:
 * initialising buffers at placement, and the crank's manual spin window.
 */

import { CRANK_WINDOW_MS } from '../../constants/power.constants';
import type { GearBehaviour } from '../types';

/** Batteries start empty. Filling one is the player's first grid decision. */
export const initBattery: GearBehaviour = (ctx) => {
  ctx.gear.charge = 0;
};

export const initBurner: GearBehaviour = (ctx) => {
  ctx.gear.coalBuffer = 0;
};

/**
 * The crank generates while its window is open, so a completed rotation is
 * simply feedback -- the player can see the machine is still coasting.
 *
 * PowerSystem owns the actual output curve; duplicating the decay here would
 * be two sources of truth for one number.
 */
export const crankBehaviour: GearBehaviour = (ctx) => {
  const remaining = (ctx.gear.crankUntil ?? 0) - ctx.now;
  if (remaining <= 0) return;
  ctx.report(`cranking ${(remaining / 1000).toFixed(1)}s`, 0xffaa44);
};

/** Sets the crank spinning. Called from the click handler, not from a rotation. */
export function startCrank(gear: { crankUntil?: number }, now: number): void {
  gear.crankUntil = now + CRANK_WINDOW_MS;
}
