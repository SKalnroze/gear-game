import { GearState, GearType, GearTier } from '../types/gear.types';
import { World } from '../world/World';
import { GearMeshGraph } from '../world/GearMeshGraph';
import { EventBus } from './EventBus';
import { GEAR_DEFINITIONS, GEAR_MESH_TOLERANCE, gearRadius, gearMaxHp } from '../constants/gear.constants';
import { GEAR_BEHAVIOURS } from '../gears/registry';
import type { GearBehaviourCtx } from '../gears/types';
import { TIER_TEETH, tierPower } from '../constants/tier.constants';
import { SNAP_THRESHOLD, PLAYER_ZONE_MAX_X, AI_ZONE_MIN_X } from '../constants/world.constants';
import { REPOSITION_COOLDOWN_MS, gearPlacementCost } from '../constants/balance.constants';
import { TechState } from '../types/tech.types';
import { GameClock } from './GameClock';
import { distance } from '../utils/MathUtils';

let _nextGearId = 1;
function nextGearId(): string {
  return `gear_${_nextGearId++}`;
}

export interface SnapResult {
  x: number;
  y: number;
  snapTargetId: string | null; // null = no snap, just cursor pos
  valid: boolean;
}

/**
 * Manages gear placement, removal, and mesh graph wiring.
 * Free placement with magnetic snap — no grid.
 * Teeth-based sizing replaces small/medium/large.
 */
export class GearSystem {
  private world: World;
  private meshGraph: GearMeshGraph;
  private eventBus: EventBus;
  private playerTech: TechState;
  private aiTech: TechState;
  private clock: GameClock;

  constructor(
    world: World,
    meshGraph: GearMeshGraph,
    eventBus: EventBus,
    playerTech: TechState,
    aiTech: TechState,
    clock: GameClock,
  ) {
    this.world = world;
    this.meshGraph = meshGraph;
    this.eventBus = eventBus;
    this.playerTech = playerTech;
    this.aiTech = aiTech;
    this.clock = clock;
  }

  /**
   * Check if a gear type is unlocked for the given owner.
   * This used to return true unconditionally for the AI, letting it place any
   * gear in the game without researching anything while the player was gated.
   */
  isUnlocked(type: GearType, owner: 'player' | 'ai'): boolean {
    const def = GEAR_DEFINITIONS[type];
    if (!def) return false;
    if (!def.unlockNode) return true;
    const tech = owner === 'player' ? this.playerTech : this.aiTech;
    return tech.researched.has(def.unlockNode);
  }

  /**
   * Compute snap candidate and return best match or null.
   * Excludes a gear if excludeId is provided.
   */
  private computeSnapCandidate(dragX: number, dragY: number, teeth: number, excludeId: string | null): { x: number; y: number; targetId: string } | null {
    const myRadius = gearRadius(teeth);
    let bestCandidate: { x: number; y: number; targetId: string } | null = null;
    let bestDist = Infinity;

    for (const [id, existing] of this.world.getAllGears()) {
      if (excludeId !== null && id === excludeId) continue;

      const exRadius = gearRadius(existing.teeth);
      const meshDist = myRadius + exRadius;
      const d = distance(dragX, dragY, existing.x, existing.y);

      if (d < meshDist + SNAP_THRESHOLD) {
        const nx = dragX - existing.x;
        const ny = dragY - existing.y;
        const len = Math.sqrt(nx * nx + ny * ny);
        if (len < 1) continue;

        const snapX = existing.x + (nx / len) * meshDist;
        const snapY = existing.y + (ny / len) * meshDist;
        const distToSnap = distance(dragX, dragY, snapX, snapY);

        if (distToSnap < bestDist) {
          bestDist = distToSnap;
          bestCandidate = { x: snapX, y: snapY, targetId: existing.id };
        }
      }
    }

    return bestCandidate;
  }

  /**
   * Context for a placement-time behaviour hook.
   *
   * onPlace only ever initialises fields on the gear being placed, so the
   * economy and unit ports are stubbed rather than wired: a behaviour that
   * tried to spend gold at placement time would be a design error, and this
   * makes it fail loudly instead of quietly charging the player mid-drag.
   */
  private placementCtx(gear: GearState, owner: 'player' | 'ai'): GearBehaviourCtx {
    const refuse = (): never => {
      throw new Error(`onPlace for '${gear.type}' must not touch the economy`);
    };
    return {
      gear,
      owner,
      tier: gear.tier,
      power: tierPower(gear.tier),
      now: this.clock.now,
      world: this.world,
      economy: {
        earnGold: refuse, spendGold: refuse, canAffordGold: refuse,
        earnResource: refuse, spendResource: refuse, getResources: refuse,
      },
      units: null,
      emit: (event, payload) => this.eventBus.emit(event, payload),
      report: (text, color) =>
        this.eventBus.emit('gear:rotation_result', { gearId: gear.id, owner, text, color }),
    };
  }

  /**
   * Compute the snap position for a gear being dragged at (dragX, dragY).
   * Scans all existing gears for snap candidates within SNAP_THRESHOLD of meshing distance.
   */
  getSnapPosition(dragX: number, dragY: number, teeth: number, owner: 'player' | 'ai'): SnapResult {
    const best = this.computeSnapCandidate(dragX, dragY, teeth, null);
    const finalX = best ? best.x : dragX;
    const finalY = best ? best.y : dragY;
    const valid = this.world.canPlace(finalX, finalY, teeth, owner);

    return {
      x: finalX,
      y: finalY,
      snapTargetId: best?.targetId ?? null,
      valid,
    };
  }

  /**
   * Attempt to place a gear at pixel (x, y). Returns GearState if successful, null otherwise.
   */
  tryPlace(
    type: GearType,
    tier: GearTier,
    x: number,
    y: number,
    owner: 'player' | 'ai',
    ignoreTechCheck: boolean = false,
  ): GearState | null {
    const def = GEAR_DEFINITIONS[type];
    if (!def) return null;
    if (!ignoreTechCheck && !this.isUnlocked(type, owner)) return null;

    // Tier is the authored size; teeth are derived from it and kept on state
    // only because geometry (radius, meshing, spatial grid) still reads them.
    const teeth = TIER_TEETH[tier];
    if (!this.world.canPlace(x, y, teeth, owner)) return null;

    const maxHp = gearMaxHp(teeth, type);
    const gear: GearState = {
      id: nextGearId(),
      type,
      tier,
      teeth,
      x,
      y,
      owner,
      angularVelocity: 0,
      currentAngle: 0,
      accumulatedAngle: 0,
      frictionLoad: 0,
      torqueOutput: 0,
      isSpinning: false,
      isBurntOut: false,
      hp: maxHp,
      maxHp,
      isJammed: false,
      crackLevel: 0,
      jamStress: 0,
    };

    // Per-type placement setup (turret/minelayer ammo, buffers) lives with the
    // rest of that gear's behaviour rather than as a special case here -- the
    // old inline check covered the two turrets but not the minelayer, whose
    // maxAmmo was left undefined and silently defaulted to 3 at use.
    GEAR_BEHAVIOURS[type].onPlace?.(this.placementCtx(gear, owner));

    this.world.placeGear(gear);
    this.meshGraph.addGear(gear);
    this.meshGraph.rebuildEdgesFor(gear, this.world.getAllGears());

    this.eventBus.emit('gear:placed', { gear });
    this.eventBus.emit('gear:mesh_updated', {
      gearIds: [gear.id, ...this.meshGraph.getNeighbors(gear.id)],
    });

    return gear;
  }

  removeGear(gearId: string): boolean {
    const gear = this.world.removeGear(gearId);
    if (!gear) return false;

    const neighbors = this.meshGraph.getNeighbors(gearId);
    this.meshGraph.removeGear(gearId);

    this.eventBus.emit('gear:removed', { gearId });
    this.eventBus.emit('gear:mesh_updated', { gearIds: neighbors });

    return true;
  }

  /**
   * Sells a gear: removes it and returns the gold refund (50% of placement cost, rounded up).
   * Returns null if the gear doesn't exist.
   * Caller is responsible for crediting the gold via economySystem.earnGold().
   */
  sellGear(gearId: string): number | null {
    const gear = this.world.getGear(gearId);
    if (!gear) return null;
    const refund = Math.ceil(gearPlacementCost(gear.teeth) * 0.5);
    this.removeGear(gearId);
    return refund;
  }

  markBurntOut(gearId: string, timestamp: number): void {
    const gear = this.world.getGear(gearId);
    if (!gear) return;
    gear.isBurntOut = true;
    gear.burntOutAt = timestamp;
    gear.isSpinning = false;
    gear.angularVelocity = 0;
    this.world.updateGear(gear);
    this.eventBus.emit('gear:burnt_out', { gearId });
  }

  /**
   * Reposition an existing gear to a new location.
   * Validates ownership, cooldown, and placement legality (excluding self).
   */
  repositionGear(gearId: string, newX: number, newY: number, owner: 'player' | 'ai'): boolean {
    const gear = this.world.getGear(gearId);
    if (!gear) return false;
    if (gear.owner !== owner) return false;
    if (this.isOnCooldown(gearId)) return false;
    if (!this.world.canPlaceExcluding(newX, newY, gear.teeth, owner, gearId)) return false;

    const oldX = gear.x;
    const oldY = gear.y;
    gear.x = newX;
    gear.y = newY;
    gear.lastRepositionedAt = this.clock.now;
    this.world.updateGear(gear);

    // Rebuild mesh edges for this gear
    this.meshGraph.removeGear(gearId);
    this.meshGraph.addGear(gear);
    this.meshGraph.rebuildEdgesFor(gear, this.world.getAllGears());

    // Also rebuild edges for neighbors that may have lost/gained connections
    for (const neighborId of this.meshGraph.getNeighbors(gearId)) {
      const neighbor = this.world.getGear(neighborId);
      if (neighbor) {
        this.meshGraph.rebuildEdgesFor(neighbor, this.world.getAllGears());
      }
    }

    this.eventBus.emit('gear:repositioned', { gearId, oldX, oldY, newX, newY });
    this.eventBus.emit('gear:mesh_updated', {
      gearIds: [gearId, ...this.meshGraph.getNeighbors(gearId)],
    });

    return true;
  }

  /** Check if a gear is still on reposition cooldown (pause time is excluded) */
  isOnCooldown(gearId: string): boolean {
    const gear = this.world.getGear(gearId);
    if (!gear || !gear.lastRepositionedAt) return false;
    return this.clock.now - gear.lastRepositionedAt < REPOSITION_COOLDOWN_MS;
  }

  /**
   * Compute snap position excluding a specific gear (for repositioning).
   */
  getSnapPositionExcluding(dragX: number, dragY: number, teeth: number, owner: 'player' | 'ai', excludeGearId: string): SnapResult {
    const best = this.computeSnapCandidate(dragX, dragY, teeth, excludeGearId);
    const finalX = best ? best.x : dragX;
    const finalY = best ? best.y : dragY;
    const valid = this.world.canPlaceExcluding(finalX, finalY, teeth, owner, excludeGearId);

    return {
      x: finalX,
      y: finalY,
      snapTargetId: best?.targetId ?? null,
      valid,
    };
  }

  getWorld(): World {
    return this.world;
  }

  getMeshGraph(): GearMeshGraph {
    return this.meshGraph;
  }
}
