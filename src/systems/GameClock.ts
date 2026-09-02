/**
 * Monotonic in-game time, in milliseconds.
 *
 * Simulation systems used to read `Date.now()` directly, which produced two
 * classes of bug:
 *
 *  - Pausing did not stop the wall clock, so a 60s pause completed every
 *    in-flight research node (and its whole queue) the moment you resumed,
 *    and overclock gears burnt out while the game was stopped.
 *  - `GAME_SETTINGS.gameSpeed` scaled the per-frame delta but not `now`, so at
 *    2x speed gears turned twice as fast while research time, passive income,
 *    AI decision cadence and every cooldown stayed at 1x — silently
 *    rebalancing the economy against the player.
 *
 * This clock advances only while running and is scaled by game speed, so
 * everything derived from it stays consistent with the simulation.
 */
export class GameClock {
  private elapsedMs: number = 0;
  private paused: boolean = false;

  /** Current game time in ms. Starts at 0 when a match begins. */
  get now(): number {
    return this.elapsedMs;
  }

  /** Advance by one frame. `realDeltaMs` is wall-clock; `speed` is the game-speed multiplier. */
  advance(realDeltaMs: number, speed: number = 1): void {
    if (this.paused) return;
    this.elapsedMs += realDeltaMs * speed;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  isPaused(): boolean {
    return this.paused;
  }

  reset(): void {
    this.elapsedMs = 0;
    this.paused = false;
  }
}

/**
 * Sentinel for "this has never happened", so that
 * `clock.now - NEVER >= cooldown` is true at time 0.
 * Game time starts at 0, so a plain 0 default would read as "used just now"
 * and hold everything on cooldown for the first seconds of a match.
 */
export const NEVER = Number.NEGATIVE_INFINITY;
