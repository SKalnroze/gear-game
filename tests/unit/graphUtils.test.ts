import { describe, it, expect } from 'vitest';
import { bfsFrom, findConnectedComponents, Adjacency } from '../../src/world/graph.utils';
import { GearMeshGraph } from '../../src/world/GearMeshGraph';
import { GearState } from '../../src/types/gear.types';

/** Build an adjacency map from undirected pairs. */
function adjOf(pairs: [string, string][], isolated: string[] = []): Adjacency {
  const adj = new Map<string, Set<string>>();
  const touch = (id: string) => {
    if (!adj.has(id)) adj.set(id, new Set());
    return adj.get(id)!;
  };
  for (const id of isolated) touch(id);
  for (const [a, b] of pairs) {
    touch(a).add(b);
    touch(b).add(a);
  }
  return adj;
}

describe('bfsFrom', () => {
  it('returns just the start node when isolated', () => {
    expect(bfsFrom(adjOf([], ['a']), 'a')).toEqual(['a']);
  });

  it('returns the start node for an id the graph has never seen', () => {
    expect(bfsFrom(adjOf([['a', 'b']]), 'zz')).toEqual(['zz']);
  });

  it('walks a chain in breadth-first order', () => {
    const adj = adjOf([['a', 'b'], ['b', 'c'], ['c', 'd']]);
    expect(bfsFrom(adj, 'a')).toEqual(['a', 'b', 'c', 'd']);
  });

  it('visits each node once in a cycle', () => {
    const adj = adjOf([['a', 'b'], ['b', 'c'], ['c', 'a']]);
    const result = bfsFrom(adj, 'a');
    expect(result).toHaveLength(3);
    expect(new Set(result)).toEqual(new Set(['a', 'b', 'c']));
  });

  it('does not cross into a disconnected component', () => {
    const adj = adjOf([['a', 'b'], ['x', 'y']]);
    expect(new Set(bfsFrom(adj, 'a'))).toEqual(new Set(['a', 'b']));
  });
});

describe('findConnectedComponents', () => {
  it('partitions a split graph', () => {
    const adj = adjOf([['a', 'b'], ['b', 'c'], ['x', 'y']]);
    const comps = findConnectedComponents(adj, ['a', 'b', 'c', 'x', 'y']);
    expect(comps).toHaveLength(2);
    expect(comps.map((c) => c.length).sort()).toEqual([2, 3]);
  });

  it('emits an isolated but known node as its own component', () => {
    const comps = findConnectedComponents(adjOf([['a', 'b']], ['lonely']), ['a', 'b', 'lonely']);
    expect(comps).toHaveLength(2);
    expect(comps.some((c) => c.length === 1 && c[0] === 'lonely')).toBe(true);
  });

  it('skips ids the graph does not know about rather than emitting singletons', () => {
    const comps = findConnectedComponents(adjOf([['a', 'b']]), ['a', 'b', 'ghost']);
    expect(comps).toHaveLength(1);
    expect(comps[0]).toHaveLength(2);
  });

  it('does not double-count a component reached from either end', () => {
    const adj = adjOf([['a', 'b'], ['b', 'c']]);
    expect(findConnectedComponents(adj, ['c', 'a', 'b'])).toHaveLength(1);
  });
});

/**
 * The whole point of extracting these functions: any future graph (PowerGraph)
 * built on the same adjacency shape must partition identically. If GearMeshGraph
 * ever stops delegating, this fails.
 */
describe('GearMeshGraph agrees with the shared traversal', () => {
  function makeGear(id: string, x: number, y: number): GearState {
    return {
      id, type: 'motor', teeth: 10, x, y, owner: 'player',
      angularVelocity: 0, currentAngle: 0, accumulatedAngle: 0,
      isSpinning: false, isJammed: false, jamStress: 0, frictionLoad: 0,
      torqueOutput: 0, hp: 50, maxHp: 50, crackLevel: 0, isBurntOut: false,
    } as GearState;
  }

  it('produces the same components as findConnectedComponents on its own adjacency', () => {
    const graph = new GearMeshGraph();
    // Two meshing pairs (gears mesh at radius sum = 50px for 10 teeth), far apart.
    const gears = new Map<string, GearState>([
      ['a', makeGear('a', 100, 100)],
      ['b', makeGear('b', 150, 100)],
      ['x', makeGear('x', 900, 900)],
      ['y', makeGear('y', 950, 900)],
    ]);
    for (const g of gears.values()) graph.rebuildEdgesFor(g, gears);

    const comps = graph.findConnectedComponents(gears.keys());
    expect(comps).toHaveLength(2);
    expect(comps.map((c) => c.length)).toEqual([2, 2]);

    // Same result reached through the raw helper over an equivalent adjacency.
    const mirror = adjOf(graph.getAllEdges().map((e) => [e.gearIdA, e.gearIdB] as [string, string]));
    const mirrorComps = findConnectedComponents(mirror, gears.keys());
    expect(mirrorComps.map((c) => c.length).sort()).toEqual(comps.map((c) => c.length).sort());
  });
});
