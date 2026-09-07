import { describe, it, expect } from 'vitest';
import {
  stepThermal, diffuseOil, escalatedSeizeStress, thermalEfficiency,
  heatCapacityFor, oilCapacityFor, seizeThreshold,
  type OilNode, type OilEdge,
} from '../../src/systems/thermal.utils';
import {
  HOT_FRACTION, SEIZE_RELEASE_FRACTION, HOT_EFFICIENCY_FLOOR,
} from '../../src/constants/thermal.constants';
import type { GearTier } from '../../src/types/gear.types';

const step = (over: Partial<Parameters<typeof stepThermal>[0]> = {}) =>
  stepThermal({
    heat: 0, oil: 0, tier: 1, omega: 0, dt: 1, externalHeat: 0, wasSeized: false, ...over,
  });

// ─── Heat ────────────────────────────────────────────────────────────────────

describe('heat accumulation', () => {
  it('a stationary gear generates none', () => {
    expect(step({ omega: 0 }).heat).toBe(0);
  });

  it('rises with speed, and faster than linearly', () => {
    const at = (omega: number) => step({ omega }).heat;
    expect(at(4)).toBeGreaterThan(at(2));
    // |omega|^1.5: doubling speed more than doubles the heat, which is what
    // makes "spin everything faster" a decision rather than a free win.
    expect(at(4) / at(2)).toBeGreaterThan(2);
  });

  it('does not care about direction of rotation', () => {
    expect(step({ omega: -3 }).heat).toBeCloseTo(step({ omega: 3 }).heat, 9);
  });

  it('external heat counts the same as friction -- one pipeline for overload', () => {
    expect(step({ externalHeat: 10 }).heat).toBeCloseTo(10, 6);
  });

  it('cools toward ambient when idle, and never below zero', () => {
    let heat = 100;
    for (let i = 0; i < 200; i++) heat = step({ heat, omega: 0 }).heat;
    expect(heat).toBeLessThan(1);
    expect(heat).toBeGreaterThanOrEqual(0);
  });

  it('a bigger gear tolerates more heat before seizing', () => {
    expect(heatCapacityFor(5)).toBeGreaterThan(heatCapacityFor(1));
  });
});

// ─── Bands and hysteresis ────────────────────────────────────────────────────

describe('thermal bands', () => {
  const threshold = seizeThreshold(1, 0);
  // State reflects heat AFTER the step, so a long dt would cool the gear out of
  // the band being tested before it is classified. A short step keeps the
  // assertion about the band, not about the cooling rate.
  const at = (heat: number, wasSeized = false) =>
    step({ heat, omega: 0, dt: 0.01, wasSeized });

  it('is ok, at full efficiency, when cool', () => {
    const r = at(threshold * 0.1);
    expect(r.state).toBe('ok');
    expect(r.efficiency).toBe(1);
  });

  it('runs hot with reduced efficiency approaching the threshold', () => {
    const r = at(threshold * 0.9);
    expect(r.state).toBe('hot');
    expect(r.efficiency).toBeLessThan(1);
    expect(r.efficiency).toBeGreaterThanOrEqual(HOT_EFFICIENCY_FLOOR);
  });

  it('seizes at the threshold, delivering nothing', () => {
    const r = at(threshold * 1.01);
    expect(r.state).toBe('seized');
    expect(r.efficiency).toBe(0);
  });

  it('efficiency falls monotonically across the hot band', () => {
    let prev = Infinity;
    for (let f = HOT_FRACTION; f < 1; f += 0.02) {
      const e = at(threshold * f).efficiency;
      expect(e).toBeLessThanOrEqual(prev + 1e-9);
      prev = e;
    }
  });

  /**
   * The reason SEIZE (1.0) and RELEASE (0.7) are different numbers. Without the
   * gap, a gear parked at its limit would seize and release every frame --
   * flickering visually and stuttering the whole chain it sits on.
   */
  describe('hysteresis', () => {
    it('stays seized while cooling through the band it seized in', () => {
      expect(at(threshold * 1.0, true).state).toBe('seized');
      expect(at(threshold * 0.85, true).state).toBe('seized');
      expect(at(threshold * 0.75, true).state).toBe('seized');
    });

    it('releases only once well clear of the threshold', () => {
      const r = at(threshold * (SEIZE_RELEASE_FRACTION - 0.05), true);
      expect(r.state).toBe('hot');
    });

    it('does not chatter when parked exactly at the limit', () => {
      // Just over the line: cooling within the step would otherwise drop a gear
      // sitting exactly ON the threshold a hair below it.
      let state = at(threshold * 1.02).state;
      expect(state).toBe('seized');
      for (let i = 0; i < 20; i++) {
        state = at(threshold * 0.99, state === 'seized').state;
        expect(state).toBe('seized');
      }
    });
  });

  it('escalates stress the longer a seizure is ignored', () => {
    expect(escalatedSeizeStress(1, 10)).toBeGreaterThan(escalatedSeizeStress(1, 0));
    expect(escalatedSeizeStress(1, 0)).toBeGreaterThan(0);
  });
});

// ─── Oil ─────────────────────────────────────────────────────────────────────

describe('oil', () => {
  it('raises the seize threshold substantially', () => {
    expect(seizeThreshold(1, 1)).toBeGreaterThan(seizeThreshold(1, 0) * 1.5);
  });

  it('suppresses the heat a spinning gear makes', () => {
    const dry = step({ omega: 5, oil: 0 }).heat;
    const oiled = step({ omega: 5, oil: oilCapacityFor(1) }).heat;
    expect(oiled).toBeLessThan(dry);
  });

  it('bleeds stored heat faster', () => {
    const dry = step({ heat: 50, omega: 0, oil: 0 }).heat;
    const oiled = step({ heat: 50, omega: 0, oil: oilCapacityFor(1) }).heat;
    expect(oiled).toBeLessThan(dry);
  });

  it('lets a gear run at a speed that would seize it dry', () => {
    // 9 rad/s is a fast chain -- amplified or overclocked, not a plain motor.
    const capacity = oilCapacityFor(1);
    const settle = (oil: number) => {
      let heat = 0;
      let state = 'ok';
      for (let i = 0; i < 300; i++) {
        const r = stepThermal({
          heat, oil, tier: 1, omega: 9, dt: 0.1, externalHeat: 0,
          wasSeized: state === 'seized',
        });
        heat = r.heat; state = r.state;
      }
      return state;
    };
    expect(settle(0)).toBe('seized');
    // Topped up every step, as an oiler beside it would.
    expect(settle(capacity)).not.toBe('seized');
  });

  it('burns off as the gear turns, and never goes negative', () => {
    let oil = 5;
    for (let i = 0; i < 500; i++) oil = step({ oil, omega: 8 }).oil;
    expect(oil).toBe(0);
  });

  it('burns faster once the gear is running hot', () => {
    const cool = step({ oil: 10, omega: 5, heat: 0 }).oil;
    const hot = step({ oil: 10, omega: 5, heat: seizeThreshold(1, 0.5) * 0.9 }).oil;
    expect(hot).toBeLessThan(cool);
  });
});

// ─── Diffusion ───────────────────────────────────────────────────────────────

describe('diffuseOil', () => {
  const node = (oil: number, capacity = 20, omega = 3): OilNode => ({ oil, capacity, omega });

  function apply(nodes: Map<string, OilNode>, edges: OilEdge[], dt = 0.25) {
    const deltas = diffuseOil(edges, nodes, dt);
    const out = new Map(nodes);
    for (const [id, d] of deltas) {
      const n = out.get(id)!;
      out.set(id, { ...n, oil: n.oil + d });
    }
    return out;
  }

  it('moves oil from the wetter gear to the drier one', () => {
    const nodes = new Map([['a', node(20)], ['b', node(0)]]);
    const after = apply(nodes, [{ gearIdA: 'a', gearIdB: 'b' }]);
    expect(after.get('b')!.oil).toBeGreaterThan(0);
    expect(after.get('a')!.oil).toBeLessThan(20);
  });

  /** Oil is only ever moved, never created -- the property the delta-map shape exists to guarantee. */
  it('conserves total oil', () => {
    const nodes = new Map([['a', node(20)], ['b', node(3)], ['c', node(0)]]);
    const edges = [{ gearIdA: 'a', gearIdB: 'b' }, { gearIdA: 'b', gearIdB: 'c' }];
    const before = [...nodes.values()].reduce((s, n) => s + n.oil, 0);
    const after = [...apply(nodes, edges).values()].reduce((s, n) => s + n.oil, 0);
    expect(after).toBeCloseTo(before, 9);
  });

  /** Deltas accumulate separately from the read, so walk order cannot matter. */
  it('gives the same result whatever order the edges are in', () => {
    const nodes = new Map([['a', node(20)], ['b', node(5)], ['c', node(0)], ['d', node(12)]]);
    const edges: OilEdge[] = [
      { gearIdA: 'a', gearIdB: 'b' },
      { gearIdA: 'b', gearIdB: 'c' },
      { gearIdA: 'c', gearIdB: 'd' },
    ];
    const forward = diffuseOil(edges, nodes, 0.25);
    const reversed = diffuseOil([...edges].reverse(), nodes, 0.25);
    for (const id of nodes.keys()) {
      expect(forward.get(id) ?? 0).toBeCloseTo(reversed.get(id) ?? 0, 9);
    }
  });

  it('never pushes a gear negative or past its capacity', () => {
    let nodes = new Map([['a', node(20, 20)], ['b', node(0, 2)]]);
    for (let i = 0; i < 100; i++) nodes = apply(nodes, [{ gearIdA: 'a', gearIdB: 'b' }], 1);
    for (const n of nodes.values()) {
      expect(n.oil).toBeGreaterThanOrEqual(-1e-9);
      expect(n.oil).toBeLessThanOrEqual(n.capacity + 1e-9);
    }
  });

  it('equalises saturation rather than volume, so a big gear does not drain a small one', () => {
    let nodes = new Map([['big', node(60, 60)], ['small', node(0, 5)]]);
    for (let i = 0; i < 400; i++) nodes = apply(nodes, [{ gearIdA: 'big', gearIdB: 'small' }], 0.25);
    const big = nodes.get('big')!;
    const small = nodes.get('small')!;
    expect(small.oil / small.capacity).toBeCloseTo(big.oil / big.capacity, 1);
  });

  it('barely moves between gears that are not turning', () => {
    const spinning = new Map([['a', node(20, 20, 5)], ['b', node(0, 20, 5)]]);
    const still = new Map([['a', node(20, 20, 0)], ['b', node(0, 20, 0)]]);
    const edge = [{ gearIdA: 'a', gearIdB: 'b' }];
    expect(diffuseOil(edge, still, 0.25).get('b')!)
      .toBeLessThan(diffuseOil(edge, spinning, 0.25).get('b')!);
  });

  it('an oiler wets its neighbours within a few ticks', () => {
    let nodes = new Map([['oiler', node(120, 120)], ['m1', node(0)], ['m2', node(0)]]);
    const edges = [{ gearIdA: 'oiler', gearIdB: 'm1' }, { gearIdA: 'm1', gearIdB: 'm2' }];
    for (let i = 0; i < 20; i++) nodes = apply(nodes, edges);
    expect(nodes.get('m1')!.oil).toBeGreaterThan(0);
    // ...and it thins with distance, so where the oiler sits matters.
    expect(nodes.get('m2')!.oil).toBeLessThan(nodes.get('m1')!.oil);
  });
});

// ─── Efficiency helper ───────────────────────────────────────────────────────

describe('thermalEfficiency', () => {
  it('is full for a cold gear and zero for a seized one', () => {
    expect(thermalEfficiency({ tier: 1 as GearTier })).toBe(1);
    expect(thermalEfficiency({ tier: 1 as GearTier, isSeized: true })).toBe(0);
  });

  it('degrades before it stops, so the chain slows as a warning', () => {
    const hot = thermalEfficiency({ tier: 1 as GearTier, heat: seizeThreshold(1, 0) * 0.95 });
    expect(hot).toBeLessThan(1);
    expect(hot).toBeGreaterThan(0);
  });
});
