import { describe, it, expect } from 'vitest';
import {
  distance,
  gearsAreMeshing,
  meshOmega,
  clamp,
  lerp,
  randomInt,
  randomChoice,
  sqrDist,
  circlesIntersect,
} from '../../src/utils/MathUtils';

describe('distance', () => {
  it('same point → 0', () => {
    expect(distance(5, 5, 5, 5)).toBe(0);
  });

  it('axis-aligned horizontal', () => {
    expect(distance(0, 0, 3, 0)).toBeCloseTo(3);
  });

  it('axis-aligned vertical', () => {
    expect(distance(0, 0, 0, 4)).toBeCloseTo(4);
  });

  it('3-4-5 triangle', () => {
    expect(distance(0, 0, 3, 4)).toBeCloseTo(5);
  });
});

describe('gearsAreMeshing', () => {
  it('exactly touching (d = r1 + r2) → true', () => {
    // centers at (0,0) and (30,0), radii 15+15=30, tolerance=4
    expect(gearsAreMeshing(0, 0, 15, 30, 0, 15, 4)).toBe(true);
  });

  it('within tolerance → true', () => {
    // d=29, target=30, |diff|=1 ≤ 4
    expect(gearsAreMeshing(0, 0, 15, 29, 0, 15, 4)).toBe(true);
  });

  it('outside tolerance → false', () => {
    // d=36, target=30, |diff|=6 > 4
    expect(gearsAreMeshing(0, 0, 15, 36, 0, 15, 4)).toBe(false);
  });

  it('overlapping (d < r1+r2, outside tolerance) → false', () => {
    // d=20, target=30, |diff|=10 > 4
    expect(gearsAreMeshing(0, 0, 15, 20, 0, 15, 4)).toBe(false);
  });
});

describe('meshOmega', () => {
  it('equal teeth → reversed direction, same speed', () => {
    expect(meshOmega(2, 10, 10)).toBe(-2);
  });

  it('2:1 gear ratio slows driven gear by half', () => {
    expect(meshOmega(4, 20, 10)).toBeCloseTo(-8);
  });

  it('1:2 gear ratio doubles driven gear speed', () => {
    expect(meshOmega(2, 10, 20)).toBeCloseTo(-1);
  });
});

describe('clamp', () => {
  it('value within range → unchanged', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('value below min → min', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('value above max → max', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('value equal to min → min', () => {
    expect(clamp(0, 0, 10)).toBe(0);
  });

  it('value equal to max → max', () => {
    expect(clamp(10, 0, 10)).toBe(10);
  });
});

describe('lerp', () => {
  it('t=0 → a', () => expect(lerp(0, 10, 0)).toBe(0));
  it('t=1 → b', () => expect(lerp(0, 10, 1)).toBe(10));
  it('t=0.5 → midpoint', () => expect(lerp(0, 10, 0.5)).toBe(5));
});

describe('sqrDist', () => {
  it('3-4-5 → 25', () => {
    expect(sqrDist(0, 0, 3, 4)).toBe(25);
  });

  it('same point → 0', () => {
    expect(sqrDist(5, 5, 5, 5)).toBe(0);
  });
});

describe('circlesIntersect', () => {
  it('overlapping circles → true', () => {
    expect(circlesIntersect(0, 0, 5, 8, 0, 5)).toBe(true);
  });

  it('touching (d = r1 + r2) → false (strict less-than)', () => {
    expect(circlesIntersect(0, 0, 5, 10, 0, 5)).toBe(false);
  });

  it('separated circles → false', () => {
    expect(circlesIntersect(0, 0, 5, 20, 0, 5)).toBe(false);
  });
});

describe('randomInt', () => {
  it('always returns integer in [min, max]', () => {
    for (let i = 0; i < 100; i++) {
      const v = randomInt(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});

describe('randomChoice', () => {
  it('always picks from the array', () => {
    const arr = [1, 2, 3];
    for (let i = 0; i < 50; i++) {
      expect(arr).toContain(randomChoice(arr));
    }
  });
});
