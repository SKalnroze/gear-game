/**
 * Runs the electrical grid.
 *
 * Ticks FIRST in the frame, before RotationPhysicsSystem, because motor speed
 * this frame must reflect this frame's generation -- and because the thermal
 * step reads an angular velocity that has to match the power state that
 * produced it. Running power afterwards desynchronises both, which are the two
 * most confusing possible failure modes for a player trying to reason about
 * their machine. The cost is one frame of coal-to-electricity latency, which is
 * invisible at 60Hz.
 *
 * It also ticks before EconomySystem, so electricity sold to the grid tie
 * credits gold in the frame it was generated; otherwise the HUD's trailing rate
 * tooltip shows a sawtooth.
 */

import type { GearState } from '../types/gear.types';
import type { EventBus } from './EventBus';
import type { World } from '../world/World';
import type { PowerGraph } from '../world/PowerGraph';
import type { EconomySystem } from './EconomySystem';
import { GEAR_BEHAVIOURS } from '../gears/registry';
import { tierPower } from '../constants/tier.constants';
import { solveGrid, quantiseSatisfaction, type BatteryState } from '../world/power.utils';
import {
  SOLAR_OUTPUT, BURNER_COAL_PER_SEC, BURNER_SELF_HEAT, CRANK_OUTPUT, CRANK_WINDOW_MS,
  BATTERY_MAX_DISCHARGE, GOLD_PER_ELECTRICITY, OVERLOAD_HEAT_PER_UNIT,
  GRID_EVENT_INTERVAL_MS,
} from '../constants/power.constants';

/** Per-grid readout, for the HUD and for debugging. */
export interface GridState {
  id: string;
  owner: 'player' | 'ai';
  gearIds: string[];
  generation: number;
  demand: number;
  stored: number;
  capacity: number;
  sold: number;
  overflow: number;
  satisfaction: number;
  brownout: boolean;
}

export class PowerSystem {
  private readonly eventBus: EventBus;
  private readonly world: World;
  private readonly powerGraph: PowerGraph;
  private economySystem: EconomySystem | null = null;

  /** Heat produced this tick, by gear id. Drained by the thermal step. */
  private pendingHeat: Map<string, number> = new Map();

  private grids: GridState[] = [];
  private gridsDirty = true;
  private lastEventAt = 0;

  /**
   * Set when a motor's quantised satisfaction actually changed, so
   * RotationPhysicsSystem only rebuilds chains when the answer differs. Without
   * the quantise-and-compare, a continuously drifting satisfaction would force
   * an O(V+E) double BFS every single frame.
   */
  private powerDirty = false;

  constructor(eventBus: EventBus, world: World, powerGraph: PowerGraph) {
    this.eventBus = eventBus;
    this.world = world;
    this.powerGraph = powerGraph;

    this.eventBus.on('gear:placed', this.onGearPlaced);
    this.eventBus.on('gear:removed', this.onGearRemoved);
    this.eventBus.on('gear:destroyed', this.onGearRemoved);
    this.eventBus.on('gear:repositioned', this.onGearRepositioned);
  }

  setEconomySystem(economy: EconomySystem): void {
    this.economySystem = economy;
  }

  // ─── Graph maintenance ─────────────────────────────────────────────────
  //
  // Wires live only in PowerGraph, never on GearState, so none of this needs a
  // single change inside GearSystem -- it already emits everything required.

  private readonly onGearPlaced = ({ gear }: { gear: GearState }) => {
    this.powerGraph.addGear(gear);
    this.gridsDirty = true;
  };

  private readonly onGearRemoved = ({ gearId }: { gearId: string }) => {
    this.powerGraph.removeGear(gearId);
    this.gridsDirty = true;
  };

  /**
   * A moved gear can drag a wire past its reach. Rather than silently keeping a
   * cable stretched across the map, the wire is cut and the player is told
   * which one -- the reposition itself is never blocked.
   */
  private readonly onGearRepositioned = ({ gearId }: { gearId: string }) => {
    const touched = [gearId, ...this.powerGraph.getNeighbors(gearId)];
    const broken = this.powerGraph.revalidate(touched, this.world.getAllGears());
    for (const wire of broken) {
      this.eventBus.emit('power:wire_broken', { gearIdA: wire.gearIdA, gearIdB: wire.gearIdB });
    }
    this.gridsDirty = true;
  };

  /** Force a grid rebuild -- called when a wire is added or cut. */
  markGraphDirty(): void {
    this.gridsDirty = true;
  }

  /** True when a motor's power changed enough that chains must be re-solved. */
  consumePowerDirty(): boolean {
    const was = this.powerDirty;
    this.powerDirty = false;
    return was;
  }

  /** Heat owed to a gear this tick (burner self-heat plus its share of overload). */
  takePendingHeat(gearId: string): number {
    return this.pendingHeat.get(gearId) ?? 0;
  }

  getGrids(): GridState[] {
    return this.grids;
  }

  // ─── Tick ──────────────────────────────────────────────────────────────

  update(dt: number, now: number): void {
    if (dt <= 0) return;
    this.pendingHeat.clear();

    const allGears = this.world.getAllGears();
    if (this.gridsDirty) {
      this.grids = this.powerGraph.findGrids(allGears.keys())
        .map((gearIds) => this.blankGrid(gearIds, allGears))
        .filter((g): g is GridState => g !== null);
      this.gridsDirty = false;
    }

    const emitEvents = now - this.lastEventAt >= GRID_EVENT_INTERVAL_MS;
    if (emitEvents) this.lastEventAt = now;

    for (const grid of this.grids) {
      this.solveOne(grid, allGears, dt, now, emitEvents);
    }

    // A motor with no wires at all still has to be told it is unpowered, or it
    // would keep whatever satisfaction it held when its last wire was cut.
    this.zeroUnwiredMotors(allGears);
  }

  private blankGrid(gearIds: string[], allGears: Map<string, GearState>): GridState | null {
    const first = gearIds.map((id) => allGears.get(id)).find((g) => g);
    if (!first) return null;
    return {
      id: gearIds[0], owner: first.owner, gearIds,
      generation: 0, demand: 0, stored: 0, capacity: 0,
      sold: 0, overflow: 0, satisfaction: 1, brownout: false,
    };
  }

  private solveOne(
    grid: GridState,
    allGears: Map<string, GearState>,
    dt: number,
    now: number,
    emitEvents: boolean,
  ): void {
    let generation = 0;
    let demand = 0;
    let sellCap = 0;
    const batteries: BatteryState[] = [];
    const batteryGears: GearState[] = [];
    const generators: Array<{ gear: GearState; output: number }> = [];
    const consumers: GearState[] = [];

    for (const gearId of grid.gearIds) {
      const gear = allGears.get(gearId);
      if (!gear) continue;
      const power = GEAR_BEHAVIOURS[gear.type].power;
      if (!power) continue;
      const scale = tierPower(gear.tier);

      switch (power.role) {
        case 'generator': {
          const output = this.generatorOutput(gear, power.generates ?? 0, scale, dt, now);
          if (output > 0) {
            generation += output;
            generators.push({ gear, output });
          }
          break;
        }
        case 'battery': {
          gear.charge ??= 0;
          const capacity = (power.stores ?? 0) * scale;
          batteries.push({
            charge: gear.charge,
            capacity,
            maxDischarge: BATTERY_MAX_DISCHARGE * scale,
          });
          batteryGears.push(gear);
          grid.capacity += capacity;
          break;
        }
        case 'consumer':
          demand += (power.draws ?? 0) * scale;
          consumers.push(gear);
          break;
        case 'tie':
          sellCap += (power.buys ?? 0) * scale;
          break;
        case 'pole':
          break;
      }
    }

    const result = solveGrid({ generation, demand, batteries, sellCap, dt });

    // Apply storage movement.
    result.batteryDeltas.forEach((delta, i) => {
      const gear = batteryGears[i];
      gear.charge = Math.max(0, Math.min(batteries[i].capacity, (gear.charge ?? 0) + delta));
    });

    // Publish satisfaction, noting whether any motor's value actually moved.
    for (const gear of consumers) {
      if (gear.powerSatisfaction !== result.satisfaction) {
        gear.powerSatisfaction = result.satisfaction;
        this.powerDirty = true;
      }
    }

    if (result.sold > 0 && this.economySystem) {
      this.economySystem.earnGold(grid.owner, result.sold * GOLD_PER_ELECTRICITY * dt);
    }

    // Surplus with nowhere to go becomes heat in the generators making it,
    // shared in proportion to output. Overload and overheating therefore share
    // one escalation curve and one visual language.
    if (result.overflow > 0 && generation > 0) {
      for (const { gear, output } of generators) {
        const share = (result.overflow * output) / generation;
        this.addHeat(gear.id, share * OVERLOAD_HEAT_PER_UNIT * dt);
      }
      if (emitEvents) {
        this.eventBus.emit('power:overload', {
          owner: grid.owner,
          gridId: grid.id,
          overflow: result.overflow,
          ratio: result.overflow / generation,
        });
      }
    } else if (result.brownout && emitEvents) {
      this.eventBus.emit('power:brownout', {
        owner: grid.owner,
        gridId: grid.id,
        satisfaction: result.satisfaction,
      });
    }

    grid.generation = generation;
    grid.demand = demand;
    grid.stored = batteryGears.reduce((sum, g) => sum + (g.charge ?? 0), 0);
    grid.sold = result.sold;
    grid.overflow = result.overflow;
    grid.satisfaction = result.satisfaction;
    grid.brownout = result.brownout;
  }

  private generatorOutput(
    gear: GearState,
    base: number,
    scale: number,
    dt: number,
    now: number,
  ): number {
    switch (gear.type) {
      case 'solar_panel':
        return SOLAR_OUTPUT * scale;

      case 'burner': {
        // Coal is drawn from the owner's stock as it burns; a burner with no
        // coal simply produces nothing rather than stalling the grid.
        const need = BURNER_COAL_PER_SEC * scale * dt;
        if (!this.economySystem?.spendResource(gear.owner, 'coal', need, false)) return 0;
        this.addHeat(gear.id, BURNER_SELF_HEAT * scale * dt);
        return base * scale;
      }

      case 'crank': {
        // Decays to nothing across its window, so it can light a first burner
        // but can never underwrite an economy.
        const remaining = (gear.crankUntil ?? 0) - now;
        if (remaining <= 0) return 0;
        return CRANK_OUTPUT * scale * (remaining / CRANK_WINDOW_MS);
      }

      default:
        return base * scale;
    }
  }

  private addHeat(gearId: string, amount: number): void {
    if (amount <= 0) return;
    this.pendingHeat.set(gearId, (this.pendingHeat.get(gearId) ?? 0) + amount);
  }

  /** Motors outside any grid run on baseline power. */
  private zeroUnwiredMotors(allGears: Map<string, GearState>): void {
    for (const [, gear] of allGears) {
      if (GEAR_BEHAVIOURS[gear.type].power?.role !== 'consumer') continue;
      if (this.powerGraph.wireCount(gear.id) > 0) continue;
      const zero = quantiseSatisfaction(0);
      if (gear.powerSatisfaction !== zero) {
        gear.powerSatisfaction = zero;
        this.powerDirty = true;
      }
    }
  }

  destroy(): void {
    this.eventBus.off('gear:placed', this.onGearPlaced);
    this.eventBus.off('gear:removed', this.onGearRemoved);
    this.eventBus.off('gear:destroyed', this.onGearRemoved);
    this.eventBus.off('gear:repositioned', this.onGearRepositioned);
    this.pendingHeat.clear();
    this.grids = [];
  }
}
