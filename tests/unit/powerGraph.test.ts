import { describe, it, expect } from 'vitest';
import { PowerGraph } from '../../src/world/PowerGraph';
import { GEAR_BEHAVIOURS } from '../../src/gears/registry';
import { WIRE_BASE_RANGE, POLE_RANGE, MAX_WIRES_PER_GEAR } from '../../src/constants/power.constants';
import { TIER_TEETH } from '../../src/constants/tier.constants';
import type { GearState, GearType } from '../../src/types/gear.types';

const roleOf = (gear: GearState) => GEAR_BEHAVIOURS[gear.type].power?.role;

function gear(id: string, type: GearType, x: number, y = 0, owner: 'player' | 'ai' = 'player'): GearState {
  return {
    id, type, tier: 1, teeth: TIER_TEETH[1], x, y, owner,
    angularVelocity: 0, currentAngle: 0, accumulatedAngle: 0, isSpinning: false,
    isBurntOut: false, isJammed: false, jamStress: 0, frictionLoad: 0,
    torqueOutput: 0, hp: 50, maxHp: 50, crackLevel: 0,
  };
}

function rig(gears: GearState[]) {
  const graph = new PowerGraph(roleOf);
  const all = new Map(gears.map((g) => [g.id, g]));
  gears.forEach((g) => graph.addGear(g));
  return { graph, all };
}

describe('wiring', () => {
  it('wires two electrical gears and reports the edge once', () => {
    const a = gear('a', 'solar_panel', 0);
    const b = gear('b', 'motor', 50);
    const { graph } = rig([a, b]);

    expect(graph.addWire(a, b)).toBe('ok');
    expect(graph.hasWire('a', 'b')).toBe(true);
    expect(graph.hasWire('b', 'a')).toBe(true);
    expect(graph.getAllWires()).toHaveLength(1);
  });

  it('refuses a second identical wire', () => {
    const a = gear('a', 'solar_panel', 0);
    const b = gear('b', 'motor', 50);
    const { graph } = rig([a, b]);
    graph.addWire(a, b);
    expect(graph.addWire(a, b)).toBe('duplicate');
    expect(graph.getAllWires()).toHaveLength(1);
  });

  it('refuses to wire a gear with no electrical role', () => {
    const a = gear('a', 'solar_panel', 0);
    const spike = gear('s', 'spiked', 40);
    const { graph } = rig([a, spike]);
    expect(graph.addWire(a, spike)).toBe('not-electrical');
  });

  it('a non-electrical gear is not even registered as a node', () => {
    const { graph } = rig([gear('s', 'spiked', 0)]);
    expect(graph.findGrids(['s'])).toHaveLength(0);
  });

  it('checkWire previews the same answer without drawing anything', () => {
    const a = gear('a', 'solar_panel', 0);
    const b = gear('b', 'motor', WIRE_BASE_RANGE + 50);
    const { graph } = rig([a, b]);
    expect(graph.checkWire(a, b)).toBe('out-of-range');
    expect(graph.getAllWires()).toHaveLength(0);
  });

  it('a pole spans further than the gears it connects', () => {
    const pole = gear('p', 'power_pole', 0);
    const motor = gear('m', 'motor', POLE_RANGE - 10);
    const { graph } = rig([pole, motor]);
    expect(graph.addWire(pole, motor)).toBe('ok');
  });

  it('enforces the per-gear wire cap', () => {
    const hub = gear('hub', 'motor', 0);
    const others = Array.from({ length: MAX_WIRES_PER_GEAR + 1 },
      (_, i) => gear(`s${i}`, 'power_pole', 20 + i));
    const { graph } = rig([hub, ...others]);

    others.slice(0, MAX_WIRES_PER_GEAR).forEach((o) => expect(graph.addWire(hub, o)).toBe('ok'));
    expect(graph.addWire(hub, others[MAX_WIRES_PER_GEAR])).toBe('wire-limit');
    expect(graph.isAtWireLimit(hub)).toBe(true);
  });

  it('cutting a wire removes it from both ends', () => {
    const a = gear('a', 'solar_panel', 0);
    const b = gear('b', 'motor', 50);
    const { graph } = rig([a, b]);
    graph.addWire(a, b);

    expect(graph.removeWire('a', 'b')).toBe(true);
    expect(graph.hasWire('a', 'b')).toBe(false);
    expect(graph.hasWire('b', 'a')).toBe(false);
    expect(graph.removeWire('a', 'b')).toBe(false);
  });

  it('removing a gear takes all its wires with it', () => {
    const hub = gear('hub', 'power_pole', 0);
    const a = gear('a', 'motor', 40);
    const b = gear('b', 'solar_panel', 80);
    const { graph } = rig([hub, a, b]);
    graph.addWire(hub, a);
    graph.addWire(hub, b);

    graph.removeGear('hub');
    expect(graph.getAllWires()).toHaveLength(0);
    expect(graph.wireCount('a')).toBe(0);
    expect(graph.wireCount('b')).toBe(0);
  });
});

describe('grids', () => {
  it('separates unconnected networks', () => {
    const gears = [
      gear('a', 'solar_panel', 0), gear('b', 'motor', 50),
      gear('x', 'solar_panel', 2000), gear('y', 'motor', 2050),
    ];
    const { graph, all } = rig(gears);
    graph.addWire(gears[0], gears[1]);
    graph.addWire(gears[2], gears[3]);

    const grids = graph.findGrids(all.keys());
    expect(grids).toHaveLength(2);
    expect(grids.every((g) => g.length === 2)).toBe(true);
  });

  it('merges two networks the moment a wire joins them', () => {
    const gears = [
      gear('a', 'solar_panel', 0), gear('b', 'power_pole', 100),
      gear('c', 'power_pole', 200), gear('d', 'motor', 300),
    ];
    const { graph, all } = rig(gears);
    graph.addWire(gears[0], gears[1]);
    graph.addWire(gears[2], gears[3]);
    expect(graph.findGrids(all.keys())).toHaveLength(2);

    // This is why splitting a grid to game the sell cap is self-defeating:
    // reaching the buyer is exactly what merges you into its component.
    graph.addWire(gears[1], gears[2]);
    expect(graph.findGrids(all.keys())).toHaveLength(1);
  });

  it('an unwired electrical gear is its own single-node grid', () => {
    const { graph, all } = rig([gear('lonely', 'battery', 0)]);
    expect(graph.findGrids(all.keys())).toEqual([['lonely']]);
  });
});

describe('revalidate after a reposition', () => {
  /**
   * Wires are authored facts, not consequences of geometry, so moving a gear
   * can leave one stretched past its reach. Rather than silently keeping a
   * cable across the map, it is cut and the caller is told which one -- the
   * move itself is never blocked.
   */
  it('cuts a wire that the move pulled out of range', () => {
    const a = gear('a', 'solar_panel', 0);
    const b = gear('b', 'motor', 50);
    const { graph, all } = rig([a, b]);
    graph.addWire(a, b);

    b.x = WIRE_BASE_RANGE + 200;
    const broken = graph.revalidate(['b', ...graph.getNeighbors('b')], all);

    expect(broken).toHaveLength(1);
    expect(graph.hasWire('a', 'b')).toBe(false);
  });

  it('keeps a wire that is still in range', () => {
    const a = gear('a', 'solar_panel', 0);
    const b = gear('b', 'motor', 50);
    const { graph, all } = rig([a, b]);
    graph.addWire(a, b);

    b.x = WIRE_BASE_RANGE - 10;
    expect(graph.revalidate(['b', ...graph.getNeighbors('b')], all)).toHaveLength(0);
    expect(graph.hasWire('a', 'b')).toBe(true);
  });

  /**
   * Regression guard for the reason wires are not stored on GearState: an
   * existing wire must not be judged 'duplicate' by its own revalidation and
   * cut for it.
   */
  it('does not cut a still-legal wire by mistaking it for a duplicate', () => {
    const a = gear('a', 'solar_panel', 0);
    const b = gear('b', 'motor', 20);
    const { graph, all } = rig([a, b]);
    graph.addWire(a, b);

    for (let i = 0; i < 5; i++) {
      expect(graph.revalidate(all.keys(), all)).toHaveLength(0);
    }
    expect(graph.hasWire('a', 'b')).toBe(true);
  });

  it('drops every wire of a gear that no longer exists', () => {
    const a = gear('a', 'solar_panel', 0);
    const b = gear('b', 'motor', 50);
    const { graph, all } = rig([a, b]);
    graph.addWire(a, b);

    all.delete('b');
    const broken = graph.revalidate(['b'], all);
    expect(broken).toHaveLength(1);
    expect(graph.wireCount('a')).toBe(0);
  });

  it('cuts a wire whose far end changed owner', () => {
    const a = gear('a', 'solar_panel', 0);
    const b = gear('b', 'motor', 50);
    const { graph, all } = rig([a, b]);
    graph.addWire(a, b);

    b.owner = 'ai';
    expect(graph.revalidate(['b'], all)).toHaveLength(1);
    expect(graph.hasWire('a', 'b')).toBe(false);
  });
});

describe('edge cache', () => {
  it('reflects mutations rather than serving a stale list', () => {
    const a = gear('a', 'solar_panel', 0);
    const b = gear('b', 'motor', 50);
    const { graph } = rig([a, b]);

    expect(graph.getAllWires()).toHaveLength(0);
    graph.addWire(a, b);
    expect(graph.getAllWires()).toHaveLength(1);
    graph.removeWire('a', 'b');
    expect(graph.getAllWires()).toHaveLength(0);
  });
});
