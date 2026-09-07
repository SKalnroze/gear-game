/**
 * Graph traversal primitives shared by every adjacency structure in the game.
 *
 * Both GearMeshGraph (edges derived from geometry) and PowerGraph (edges
 * authored by the player) are `Map<string, Set<string>>` under the hood and
 * need identical BFS/component semantics. Keeping the traversal here means the
 * two cannot drift apart, and it can be tested without constructing either.
 *
 * Phaser-free and Matter-free by design -- see systems/unit.utils.ts for the
 * same convention.
 */

export type Adjacency = ReadonlyMap<string, ReadonlySet<string>>;

/**
 * All node ids reachable from `startId`, including itself, in BFS order.
 * Returns `[startId]` for an isolated or unknown node.
 */
export function bfsFrom(adjacency: Adjacency, startId: string): string[] {
  const visited = new Set<string>([startId]);
  const queue: string[] = [startId];
  const result: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);
    for (const neighbor of adjacency.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return result;
}

/**
 * Partition `nodeIds` into connected components.
 * Ids absent from the adjacency map are skipped rather than emitted as
 * singletons -- callers pass the full gear id list and expect only nodes the
 * graph actually knows about.
 */
export function findConnectedComponents(
  adjacency: Adjacency,
  nodeIds: Iterable<string>,
): string[][] {
  const visited = new Set<string>();
  const components: string[][] = [];

  for (const id of nodeIds) {
    if (!visited.has(id) && adjacency.has(id)) {
      const component = bfsFrom(adjacency, id);
      for (const nodeId of component) {
        visited.add(nodeId);
      }
      components.push(component);
    }
  }

  return components;
}
