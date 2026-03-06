/**
 * Gear ratio math and geometric helpers.
 */

/** Distance between two points */
export function distance(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Whether two circles (gears) are meshing.
 * They mesh if distance between centers ≈ r1 + r2 (within tolerance px).
 */
export function gearsAreMeshing(
  x1: number, y1: number, r1: number,
  x2: number, y2: number, r2: number,
  tolerance: number,
): boolean {
  const d = distance(x1, y1, x2, y2);
  const target = r1 + r2;
  return Math.abs(d - target) <= tolerance;
}

/**
 * Compute angular velocity of driven gear B given driver gear A.
 * omega_B = -(omega_A * teeth_A / teeth_B)
 * Negative sign means direction reversal per mesh.
 */
export function meshOmega(omegaA: number, teethA: number, teethB: number): number {
  return -(omegaA * teethA / teethB);
}

/**
 * Clamp a value between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Linear interpolation.
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Random integer between min (inclusive) and max (inclusive).
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Pick a random element from an array.
 */
export function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Squared distance between two points (no sqrt — use for comparisons).
 */
export function sqrDist(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
}

/**
 * Check if two circles intersect (overlap, not just touch).
 */
export function circlesIntersect(
  x1: number, y1: number, r1: number,
  x2: number, y2: number, r2: number,
): boolean {
  return distance(x1, y1, x2, y2) < r1 + r2;
}
