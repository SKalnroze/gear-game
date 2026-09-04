import { describe, it, expect, beforeEach } from 'vitest';
import { GearMeshGraph } from '../../src/world/GearMeshGraph';
import type { GearState, GearType } from '../../src/types/gear.types';
import { gearRadius, GEAR_MESH_TOLERANCE } from '../../src/constants/gear.constants';

function makeGear(id: string, x: number, y: number, teeth: number, type: GearType = 'motor'): GearState {
  return {
    id,
    type,
    teeth,
    x,
    y,
    owner: 'player',
    angularVelocity: 0,
    currentAngle: 0,
    accumulatedAngle: 0,
    frictionLoad: 0,
    torqueOutput: 0,
    isSpinning: false,
    isBurntOut: false,
    hp: 100,
    maxHp: 100,
    isJammed: false,
    crackLevel: 0,
    jamStress: 0,
  };
}

/** Build a map and rebuild every gear's edges, mimicking placement order. */
function graphOf(gears: GearState[]): { graph: GearMeshGraph; all: Map<string, GearState> } {
  const all = new Map(gears.map(g => [g.id, g]));
  const graph = new GearMeshGraph();
  for (const g of gears) {
    graph.addGear(g);
    graph.rebuildEdgesFor(g, all);
  }
  return { graph, all };
}

describe('GearMeshGraph', () => {
  describe('meshing geometry', () => {
    it('gears exactly touching at r1 + r2 mesh', () => {
      // 10 teeth → r 25, so centres 50px apart touch exactly.
      const { graph } = graphOf([makeGear('a', 0, 0, 10), makeGear('b', 50, 0, 10)]);
      expect(graph.hasEdge('a', 'b')).toBe(true);
      expect(graph.hasEdge('b', 'a')).toBe(true);
    });

    it('meshes different-sized gears at the sum of their radii', () => {
      // 10 teeth (r 25) + 20 teeth (r 50) → 75px apart.
      const { graph } = graphOf([makeGear('a', 0, 0, 10), makeGear('b', 75, 0, 20)]);
      expect(graph.hasEdge('a', 'b')).toBe(true);
    });

    it('meshes at the edge of tolerance but not beyond', () => {
      const inside = graphOf([
        makeGear('a', 0, 0, 10),
        makeGear('b', 50 + GEAR_MESH_TOLERANCE, 0, 10),
      ]).graph;
      expect(inside.hasEdge('a', 'b')).toBe(true);

      const outside = graphOf([
        makeGear('a', 0, 0, 10),
        makeGear('b', 50 + GEAR_MESH_TOLERANCE + 1, 0, 10),
      ]).graph;
      expect(outside.hasEdge('a', 'b')).toBe(false);
    });

    it('gears too close to mesh (overlapping) are not connected', () => {
      const { graph } = graphOf([makeGear('a', 0, 0, 10), makeGear('b', 20, 0, 10)]);
      expect(graph.hasEdge('a', 'b')).toBe(false);
    });

    it('meshing is distance-based, not axis-aligned', () => {
      // 3-4-5 triangle: (30, 40) is exactly 50 from the origin.
      const { graph } = graphOf([makeGear('a', 0, 0, 10), makeGear('b', 30, 40, 10)]);
      expect(graph.hasEdge('a', 'b')).toBe(true);
    });
  });

  describe('edge maintenance', () => {
    it('rebuildEdgesFor drops edges the gear no longer satisfies', () => {
      const a = makeGear('a', 0, 0, 10);
      const b = makeGear('b', 50, 0, 10);
      const { graph, all } = graphOf([a, b]);
      expect(graph.hasEdge('a', 'b')).toBe(true);

      b.x = 400;
      graph.rebuildEdgesFor(b, all);
      expect(graph.hasEdge('a', 'b')).toBe(false);
      expect(graph.hasEdge('b', 'a')).toBe(false);
    });

    it('removeGear clears the edge from both sides', () => {
      const { graph } = graphOf([makeGear('a', 0, 0, 10), makeGear('b', 50, 0, 10)]);
      graph.removeGear('a');
      expect(graph.getNeighbors('b')).toEqual([]);
      expect(graph.getNeighbors('a')).toEqual([]);
    });

    it('getAllEdges reports each pair once', () => {
      const { graph } = graphOf([
        makeGear('a', 0, 0, 10),
        makeGear('b', 50, 0, 10),
        makeGear('c', 100, 0, 10),
      ]);
      expect(graph.getAllEdges()).toHaveLength(2);
    });

    it('getAllEdges is cached but reflects later mutations', () => {
      const a = makeGear('a', 0, 0, 10);
      const b = makeGear('b', 50, 0, 10);
      const { graph, all } = graphOf([a, b]);

      const first = graph.getAllEdges();
      expect(first).toHaveLength(1);
      // Cached: the same array instance comes back when nothing changed.
      expect(graph.getAllEdges()).toBe(first);

      b.x = 400;
      graph.rebuildEdgesFor(b, all);
      expect(graph.getAllEdges()).toHaveLength(0);

      const c = makeGear('c', 50, 0, 10);
      all.set('c', c);
      graph.addGear(c);
      graph.rebuildEdgesFor(c, all);
      expect(graph.getAllEdges()).toHaveLength(1);

      graph.removeGear('c');
      expect(graph.getAllEdges()).toHaveLength(0);
    });

    it('clear empties the graph', () => {
      const { graph } = graphOf([makeGear('a', 0, 0, 10), makeGear('b', 50, 0, 10)]);
      graph.clear();
      expect(graph.getAllEdges()).toEqual([]);
    });
  });

  describe('connectivity', () => {
    it('bfsFrom reaches the whole connected run', () => {
      const { graph } = graphOf([
        makeGear('a', 0, 0, 10),
        makeGear('b', 50, 0, 10),
        makeGear('c', 100, 0, 10),
      ]);
      expect(graph.bfsFrom('a').sort()).toEqual(['a', 'b', 'c']);
    });

    it('findConnectedComponents separates disjoint clusters', () => {
      const gears = [
        makeGear('a', 0, 0, 10),
        makeGear('b', 50, 0, 10),
        makeGear('far1', 1000, 0, 10),
        makeGear('far2', 1050, 0, 10),
      ];
      const { graph, all } = graphOf(gears);
      const components = graph.findConnectedComponents(all.keys());
      expect(components).toHaveLength(2);
      expect(components.map(c => c.length).sort()).toEqual([2, 2]);
    });

    it('an isolated gear is its own component', () => {
      const gears = [makeGear('lonely', 0, 0, 10)];
      const { graph, all } = graphOf(gears);
      expect(graph.findConnectedComponents(all.keys())).toEqual([['lonely']]);
    });
  });
});
