import { GearState } from '../types/gear.types';
import { UnitState } from '../types/unit.types';
import { gearRadius, GEAR_MESH_TOLERANCE } from '../constants/gear.constants';
import { PLAYER_ZONE_MAX_X, AI_ZONE_MIN_X } from '../constants/world.constants';
import { distance } from '../utils/MathUtils';

/**
 * Pixel-based world model.
 * No grid — just x/y positions. Gear sizing is teeth-based.
 */
export class World {
  private gears: Map<string, GearState> = new Map();
  private units: Map<string, UnitState> = new Map();
  private gearsByOwner: Map<'player' | 'ai', Set<string>> = new Map([
    ['player', new Set()],
    ['ai', new Set()],
  ]);

  /** When true the "player" base is on the right side of the map. */
  private playerOnRight: boolean = false;

  setPlayerOnRight(v: boolean): void { this.playerOnRight = v; }
  isPlayerOnRight(): boolean { return this.playerOnRight; }

  // ── Gear operations ───────────────────────────────────────────────────────

  getGear(gearId: string): GearState | undefined {
    return this.gears.get(gearId);
  }

  getAllGears(): Map<string, GearState> {
    return this.gears;
  }

  getGearsOwnedBy(owner: 'player' | 'ai'): GearState[] {
    const ids = this.gearsByOwner.get(owner);
    if (!ids) return [];
    const result: GearState[] = [];
    for (const id of ids) {
      const g = this.gears.get(id);
      if (g) result.push(g);
    }
    return result;
  }

  /**
   * Validate whether a gear can be placed at (x, y) by owner.
   * Checks: owner zone and no true geometric overlap with existing gears.
   * Allows meshing-distance contact (within GEAR_MESH_TOLERANCE).
   */
  canPlace(x: number, y: number, teeth: number, owner: GearState['owner']): boolean {
    return this.canPlaceExcluding(x, y, teeth, owner, undefined);
  }

  /**
   * Same as canPlace but skips one gear (used for repositioning).
   */
  canPlaceExcluding(x: number, y: number, teeth: number, owner: GearState['owner'], excludeGearId: string | undefined): boolean {
    const myRadius = gearRadius(teeth);

    // Zone check – owner must stay on their side.  When the player is on
    // the right side we simply swap the restrictions.
    if (!this.playerOnRight) {
      if (owner === 'player' && x > PLAYER_ZONE_MAX_X) return false;
      if (owner === 'ai' && x < AI_ZONE_MIN_X) return false;
    } else {
      if (owner === 'player' && x < AI_ZONE_MIN_X) return false;
      if (owner === 'ai' && x > PLAYER_ZONE_MAX_X) return false;
    }

    // Overlap check — reject only true geometric overlap, not meshing contact
    for (const [id, existing] of this.gears) {
      if (id === excludeGearId) continue;
      const exRadius = gearRadius(existing.teeth);
      const d = distance(x, y, existing.x, existing.y);
      if (d < (myRadius + exRadius) - GEAR_MESH_TOLERANCE) {
        return false;
      }
    }

    return true;
  }

  placeGear(gear: GearState): void {
    this.gears.set(gear.id, gear);
    this.gearsByOwner.get(gear.owner)?.add(gear.id);
  }

  removeGear(gearId: string): GearState | undefined {
    const gear = this.gears.get(gearId);
    if (!gear) return undefined;
    this.gears.delete(gearId);
    this.gearsByOwner.get(gear.owner)?.delete(gearId);
    return gear;
  }

  updateGear(gear: GearState): void {
    // A no-op for a gear that's already been removed -- without this guard, a
    // stale GearState reference held by a caller (e.g. a spatial-grid snapshot
    // from earlier in the same frame, after another unit already destroyed
    // this gear) would resurrect it into `gears` with no meshGraph entry, no
    // owner-index entry, and no visual sprite: a permanent, untargetable-but-
    // still-targeted zombie.
    if (!this.gears.has(gear.id)) return;
    this.gears.set(gear.id, gear);
  }

  /**
   * Find the gear nearest to (x, y), excluding a specific gear id.
   */
  getNearestGear(x: number, y: number, excludeId?: string): GearState | undefined {
    let nearest: GearState | undefined;
    let minDist = Infinity;
    for (const [id, gear] of this.gears) {
      if (id === excludeId) continue;
      const dx = gear.x - x;
      const dy = gear.y - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < minDist) {
        minDist = d;
        nearest = gear;
      }
    }
    return nearest;
  }

  /**
   * Query gears within a radius of (x, y).
   */
  getGearsNear(x: number, y: number, radius: number): GearState[] {
    const result: GearState[] = [];
    for (const [, gear] of this.gears) {
      const dx = gear.x - x;
      const dy = gear.y - y;
      if (dx * dx + dy * dy <= radius * radius) {
        result.push(gear);
      }
    }
    return result;
  }

  // ── Unit operations ───────────────────────────────────────────────────────

  getUnit(unitId: string): UnitState | undefined {
    return this.units.get(unitId);
  }

  getAllUnits(): Map<string, UnitState> {
    return this.units;
  }

  placeUnit(unit: UnitState): void {
    this.units.set(unit.id, unit);
  }

  removeUnit(unitId: string): UnitState | undefined {
    const unit = this.units.get(unitId);
    if (!unit) return undefined;
    this.units.delete(unitId);
    return unit;
  }

  updateUnit(unit: UnitState): void {
    this.units.set(unit.id, unit);
  }

  // ── Collision queries ─────────────────────────────────────────────────────

  /**
   * Returns all gears that overlap with a circle at (x, y, r).
   */
  getGearsOverlappingCircle(x: number, y: number, r: number): GearState[] {
    const result: GearState[] = [];
    for (const [, gear] of this.gears) {
      const gearR = gearRadius(gear.teeth);
      if (distance(x, y, gear.x, gear.y) < r + gearR) {
        result.push(gear);
      }
    }
    return result;
  }

  clear(): void {
    this.gears.clear();
    this.units.clear();
    this.gearsByOwner.get('player')?.clear();
    this.gearsByOwner.get('ai')?.clear();
  }
}
