/**
 * The wire network.
 *
 * Structurally a twin of GearMeshGraph -- same adjacency shape, same memoised
 * edge list, same traversal (both delegate to graph.utils so they cannot drift)
 * -- with one decisive difference: **edges here are authored by the player, not
 * derived from geometry.** There is deliberately no `rebuildEdgesFor`.
 *
 * That difference drives the whole design. Because a wire is a fact the player
 * stated rather than a consequence of where things sit, it has to survive a
 * gear being moved, and it has to be revalidated rather than recomputed when it
 * does. It also means wires must NOT be stored on GearState: a two-ended
 * relation kept on one end desyncs the moment that end is sold, and kept on
 * both ends it can disagree with itself. The graph is the single owner.
 *
 * PowerGraph must never listen to `gear:mesh_updated` -- meshing and wiring are
 * independent, and conflating them was the failure mode this separation exists
 * to avoid.
 */

import type { GearState } from '../types/gear.types';
import { bfsFrom, findConnectedComponents } from './graph.utils';
import { canWire, wireCapacity, type PowerRole, type WireResult } from './power.utils';

export interface Wire {
  gearIdA: string;
  gearIdB: string;
}

/** Looks up a gear's electrical role; gears with no role cannot be wired. */
export type RoleLookup = (gear: GearState) => PowerRole | undefined;

export class PowerGraph {
  private adjacency: Map<string, Set<string>> = new Map();
  private edgeCache: Wire[] | null = null;
  private readonly roleOf: RoleLookup;

  constructor(roleOf: RoleLookup) {
    this.roleOf = roleOf;
  }

  private invalidate(): void {
    this.edgeCache = null;
  }

  private touch(gearId: string): Set<string> {
    let set = this.adjacency.get(gearId);
    if (!set) {
      set = new Set();
      this.adjacency.set(gearId, set);
      this.invalidate();
    }
    return set;
  }

  /** Register a gear as wireable. Idempotent. */
  addGear(gear: GearState): void {
    if (this.roleOf(gear)) this.touch(gear.id);
  }

  /** Whether a wire could be drawn, without drawing it. Drives the UI preview. */
  checkWire(a: GearState, b: GearState): WireResult {
    return canWire(
      { gear: a, role: this.roleOf(a), wireCount: this.wireCount(a.id) },
      { gear: b, role: this.roleOf(b), wireCount: this.wireCount(b.id) },
      this.hasWire(a.id, b.id),
    );
  }

  /** Draw a wire. Returns why it was refused, or 'ok'. */
  addWire(a: GearState, b: GearState): WireResult {
    const result = this.checkWire(a, b);
    if (result !== 'ok') return result;

    this.touch(a.id).add(b.id);
    this.touch(b.id).add(a.id);
    this.invalidate();
    return 'ok';
  }

  removeWire(gearIdA: string, gearIdB: string): boolean {
    const removed = !!this.adjacency.get(gearIdA)?.delete(gearIdB);
    this.adjacency.get(gearIdB)?.delete(gearIdA);
    if (removed) this.invalidate();
    return removed;
  }

  /** Drop a gear and every wire attached to it. */
  removeGear(gearId: string): void {
    const neighbors = this.adjacency.get(gearId);
    if (neighbors) {
      for (const neighborId of neighbors) {
        this.adjacency.get(neighborId)?.delete(gearId);
      }
    }
    this.adjacency.delete(gearId);
    this.invalidate();
  }

  /**
   * Re-check the wires touching `gearIds` and drop any that are no longer
   * legal, returning what was cut so the caller can tell the player.
   *
   * Called after a reposition. A moved gear can pull a wire past its reach, and
   * silently keeping a wire that stretches across the map would be worse than
   * either refusing the move or cutting the cable -- so the cable goes, and the
   * player is told which one.
   */
  revalidate(gearIds: Iterable<string>, allGears: Map<string, GearState>): Wire[] {
    const broken: Wire[] = [];

    for (const gearId of gearIds) {
      const gear = allGears.get(gearId);
      const neighbors = this.adjacency.get(gearId);
      if (!neighbors) continue;

      // A gear that has vanished takes all its wires with it.
      if (!gear) {
        for (const neighborId of [...neighbors]) {
          broken.push({ gearIdA: gearId, gearIdB: neighborId });
        }
        this.removeGear(gearId);
        continue;
      }

      for (const neighborId of [...neighbors]) {
        const neighbor = allGears.get(neighborId);
        // Ask whether this pair could be wired *now*, ignoring the fact that it
        // already is -- otherwise every check returns 'duplicate'.
        const stillLegal = neighbor && canWire(
          { gear, role: this.roleOf(gear), wireCount: 0 },
          { gear: neighbor, role: this.roleOf(neighbor), wireCount: 0 },
          false,
        ) === 'ok';

        if (!stillLegal) {
          this.removeWire(gearId, neighborId);
          broken.push({ gearIdA: gearId, gearIdB: neighborId });
        }
      }
    }

    return broken;
  }

  hasWire(gearIdA: string, gearIdB: string): boolean {
    return this.adjacency.get(gearIdA)?.has(gearIdB) ?? false;
  }

  wireCount(gearId: string): number {
    return this.adjacency.get(gearId)?.size ?? 0;
  }

  /** True when this gear cannot take another wire. Drives the UI's refusal text. */
  isAtWireLimit(gear: GearState): boolean {
    return this.wireCount(gear.id) >= wireCapacity(this.roleOf(gear));
  }

  getNeighbors(gearId: string): string[] {
    return Array.from(this.adjacency.get(gearId) ?? []);
  }

  /** Every wire, listed once. Memoised -- the renderer walks this every frame. */
  getAllWires(): Wire[] {
    if (this.edgeCache) return this.edgeCache;

    const wires: Wire[] = [];
    for (const [id, neighbors] of this.adjacency) {
      for (const neighborId of neighbors) {
        // Emit each undirected pair once, from its lexicographically smaller end.
        if (id < neighborId) wires.push({ gearIdA: id, gearIdB: neighborId });
      }
    }

    this.edgeCache = wires;
    return wires;
  }

  bfsFrom(startId: string): string[] {
    return bfsFrom(this.adjacency, startId);
  }

  /** The independent electrical grids. Each is solved on its own each tick. */
  findGrids(gearIds: Iterable<string>): string[][] {
    return findConnectedComponents(this.adjacency, gearIds);
  }

  clear(): void {
    this.adjacency.clear();
    this.invalidate();
  }
}
