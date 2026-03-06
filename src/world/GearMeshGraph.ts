import { GearState } from '../types/gear.types';
import { GEAR_MESH_TOLERANCE, gearRadius } from '../constants/gear.constants';
import { gearsAreMeshing } from '../utils/MathUtils';

export interface MeshEdge {
  gearIdA: string;
  gearIdB: string;
}

/**
 * Adjacency graph of meshed gears.
 * An edge exists when two gears are close enough that their teeth interlock.
 * Uses pixel x/y directly — no grid conversion.
 */
export class GearMeshGraph {
  // adjacency list: gearId → set of meshed gearIds
  private adjacency: Map<string, Set<string>> = new Map();

  addGear(gear: GearState): void {
    if (!this.adjacency.has(gear.id)) {
      this.adjacency.set(gear.id, new Set());
    }
  }

  removeGear(gearId: string): void {
    const neighbors = this.adjacency.get(gearId);
    if (neighbors) {
      for (const neighborId of neighbors) {
        this.adjacency.get(neighborId)?.delete(gearId);
      }
    }
    this.adjacency.delete(gearId);
  }

  /**
   * Rebuild all edges for a given gear against all existing gears.
   * Uses gear.x / gear.y and teeth-based radii directly.
   */
  rebuildEdgesFor(gear: GearState, allGears: Map<string, GearState>): MeshEdge[] {
    const newEdges: MeshEdge[] = [];
    const myRadius = gearRadius(gear.teeth);

    // Clear old edges for this gear
    const myNeighbors = this.adjacency.get(gear.id);
    if (myNeighbors) {
      for (const neighborId of myNeighbors) {
        this.adjacency.get(neighborId)?.delete(gear.id);
      }
      myNeighbors.clear();
    } else {
      this.adjacency.set(gear.id, new Set());
    }

    for (const [otherId, other] of allGears) {
      if (otherId === gear.id) continue;
      const otherRadius = gearRadius(other.teeth);

      if (gearsAreMeshing(
        gear.x, gear.y, myRadius,
        other.x, other.y, otherRadius,
        GEAR_MESH_TOLERANCE,
      )) {
        this.adjacency.get(gear.id)!.add(otherId);
        if (!this.adjacency.has(otherId)) {
          this.adjacency.set(otherId, new Set());
        }
        this.adjacency.get(otherId)!.add(gear.id);
        newEdges.push({ gearIdA: gear.id, gearIdB: otherId });
      }
    }

    return newEdges;
  }

  getNeighbors(gearId: string): string[] {
    return Array.from(this.adjacency.get(gearId) ?? []);
  }

  hasEdge(gearIdA: string, gearIdB: string): boolean {
    return this.adjacency.get(gearIdA)?.has(gearIdB) ?? false;
  }

  getAllEdges(): MeshEdge[] {
    const edges: MeshEdge[] = [];
    const visited = new Set<string>();
    for (const [id, neighbors] of this.adjacency) {
      for (const neighborId of neighbors) {
        const key = [id, neighborId].sort().join('-');
        if (!visited.has(key)) {
          visited.add(key);
          edges.push({ gearIdA: id, gearIdB: neighborId });
        }
      }
    }
    return edges;
  }

  /**
   * BFS to find all connected gears from a starting gear.
   */
  bfsFrom(startId: string): string[] {
    const visited = new Set<string>();
    const queue: string[] = [startId];
    visited.add(startId);
    const result: string[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);
      for (const neighbor of this.getNeighbors(current)) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    return result;
  }

  /**
   * Find all connected components.
   */
  findConnectedComponents(gearIds: Iterable<string>): string[][] {
    const visited = new Set<string>();
    const components: string[][] = [];

    for (const id of gearIds) {
      if (!visited.has(id) && this.adjacency.has(id)) {
        const component = this.bfsFrom(id);
        for (const gearId of component) {
          visited.add(gearId);
        }
        components.push(component);
      }
    }

    return components;
  }

  clear(): void {
    this.adjacency.clear();
  }
}
