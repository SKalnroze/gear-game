/**
 * A continuously-refilling actions-per-minute pool. This is the AI's real
 * difficulty axis: every executed action spends from it, and the pool
 * refills at a fixed rate set by difficulty. A small capacity above 1 lets
 * the AI bank a short burst of actions and spend them in a row -- closer to
 * how a person actually plays (look, then execute several moves) than a
 * strict one-action-per-fixed-interval clock.
 *
 * This replaces two things that used to fake difficulty instead of
 * constraining it: a flat decision interval that was the same for every
 * difficulty, and easy mode's 55%-random-skip, which discarded ticks by
 * coin-flip rather than under any real budget.
 */
export class AIActionBudget {
  private capacity: number;
  private points: number;
  private regenPerMs: number;

  constructor(apm: number, capacity: number) {
    this.capacity = capacity;
    this.regenPerMs = apm / 60000;
    this.points = capacity; // start full -- the AI can act immediately at match start
  }

  /** Advance the clock, refilling toward capacity. */
  regen(deltaMs: number): void {
    if (deltaMs <= 0) return;
    this.points = Math.min(this.capacity, this.points + this.regenPerMs * deltaMs);
  }

  canAfford(cost: number): boolean {
    return this.points >= cost;
  }

  /** Spend points, clamped at 0 (never goes negative even if cost > points). */
  spend(cost: number): void {
    this.points = Math.max(0, this.points - cost);
  }

  get currentPoints(): number {
    return this.points;
  }

  get maxCapacity(): number {
    return this.capacity;
  }

  /** Actions per minute this budget currently refills at. */
  get apm(): number {
    return this.regenPerMs * 60000;
  }

  setApm(apm: number): void {
    this.regenPerMs = apm / 60000;
  }
}
