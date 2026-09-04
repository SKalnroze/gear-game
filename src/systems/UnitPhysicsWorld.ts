import Matter from 'matter-js';
import { UnitState, UnitType } from '../types/unit.types';
import { WORLD_WIDTH, LANE_Y_MIN, LANE_Y_MAX } from '../constants/world.constants';

/**
 * Real rigidbody movement and collision for units, via Matter.js.
 *
 * Each unit's behavior method (UnitSystem.updateInfantry etc.) is unchanged --
 * it still writes a *desired* velocity onto `unit.vx`/`unit.vy` each tick,
 * exactly as it always did. What changed is what happens to that number
 * next: instead of directly overwriting position (`unit.x += vx * dt`) and
 * running a hand-rolled positional-correction pass for overlap, this steers
 * a real Matter body toward that desired velocity with a proportional
 * force and lets Matter's own integrator and collision solver own position,
 * velocity and inter-unit contact. That's what gives units real
 * acceleration (a beat of ramp-up instead of an instant velocity swap --
 * the "no inertia" complaint), knockback that persists and decays over
 * several frames instead of being overwritten the very next tick, and
 * collision resolution that actually holds up in a dense pile instead of
 * a single-pass positional nudge.
 */

/** Collision categories: owner × (normal | aether-phantom). Aether Phantom
 * passes through enemy bodies (any type) but still collides with its own
 * side, matching the pre-migration `resolveUnitCollisions` special case. */
const CATEGORY_PLAYER = 0x0001;
const CATEGORY_AI = 0x0002;
const CATEGORY_PLAYER_PHANTOM = 0x0004;
const CATEGORY_AI_PHANTOM = 0x0008;

function collisionFilter(owner: 'player' | 'ai', unitType: UnitType): Matter.ICollisionFilter {
  const isPhantom = unitType === 'aether_phantom';
  if (owner === 'player') {
    return {
      category: isPhantom ? CATEGORY_PLAYER_PHANTOM : CATEGORY_PLAYER,
      mask: isPhantom ? (CATEGORY_PLAYER | CATEGORY_PLAYER_PHANTOM) : (CATEGORY_PLAYER | CATEGORY_AI | CATEGORY_PLAYER_PHANTOM),
    };
  }
  return {
    category: isPhantom ? CATEGORY_AI_PHANTOM : CATEGORY_AI,
    mask: isPhantom ? (CATEGORY_AI | CATEGORY_AI_PHANTOM) : (CATEGORY_AI | CATEGORY_PLAYER | CATEGORY_AI_PHANTOM),
  };
}

/**
 * Matter.js integrates velocity as "distance per step" via a
 * deltaTime-squared Verlet term, not "distance per second" -- so the
 * steering force's gain only means anything relative to a FIXED reference
 * step size, calibrated empirically the same way the gear physics
 * calibration was (see gear.constants.ts's `gearPhysics`): below ~0.007 the
 * feedback loop is stable and converges within a handful of steps; at 0.007
 * and above it's numerically unstable and diverges within seconds
 * regardless of body mass (the mass term in the force formula cancels it
 * out of the equation, by design -- response time is mass-independent).
 */
const STEER_GAIN = 0.004;
const FIXED_STEP_MS = 1000 / 60;
/** Cap substeps per call so a lag spike (or a large `deltaSec` from a paused-then-resumed clock) can't spiral into a huge synchronous simulation catch-up. */
const MAX_SUBSTEPS = 8;

export class UnitPhysicsWorld {
  private engine: Matter.Engine = Matter.Engine.create({ gravity: { x: 0, y: 0 } });
  private bodies: Map<string, Matter.Body> = new Map();

  addUnit(unit: UnitState): void {
    const body = Matter.Bodies.circle(unit.x, unit.y, unit.size > 0 ? unit.size : 8, {
      mass: unit.mass > 0 ? unit.mass : 1,
      frictionAir: 0.05,
      friction: 0,
      frictionStatic: 0,
      restitution: 0,
      inertia: Infinity, // units don't need to physically tumble/spin from contact torque
      collisionFilter: collisionFilter(unit.owner, unit.type),
    });
    this.bodies.set(unit.id, body);
    Matter.Composite.add(this.engine.world, body);
  }

  removeUnit(unitId: string): void {
    const body = this.bodies.get(unitId);
    if (!body) return;
    Matter.Composite.remove(this.engine.world, body);
    this.bodies.delete(unitId);
  }

  hasUnit(unitId: string): boolean {
    return this.bodies.has(unitId);
  }

  /**
   * Nudge a unit's real velocity directly -- explosions, charge impacts,
   * shoves. Persists and decays naturally (via the steering force pulling
   * back toward the behavior's desired velocity over the following frames)
   * instead of being discarded the instant the next tick's behavior update
   * runs. `ix`/`iy` are px/s, matching every other velocity value in the
   * game -- converted to Matter's native per-step units internally.
   */
  applyImpulse(unitId: string, ix: number, iy: number): void {
    const body = this.bodies.get(unitId);
    if (!body) return;
    Matter.Body.setVelocity(body, { x: body.velocity.x + ix / 60, y: body.velocity.y + iy / 60 });
  }

  /**
   * Steer every active unit's body toward its behavior-computed desired
   * velocity, step the engine forward by `deltaSec` (as one or more fixed
   * reference-size substeps -- see STEER_GAIN's comment), then sync the
   * resulting real position and velocity back onto UnitState for everything
   * else (combat range checks, rendering, targeting) to read.
   */
  step(units: Map<string, UnitState>, deltaSec: number): void {
    // Other systems (a spiked/armored gear's push-back, tests injecting a
    // position directly) can write unit.x/unit.y between steps. Adopt any
    // such external move as authoritative before steering, or it would be
    // silently discarded the moment this step re-syncs from the body.
    for (const [id, unit] of units) {
      if (unit.reachedBase) continue;
      const body = this.bodies.get(id);
      if (!body) continue;
      if (unit.x !== body.position.x || unit.y !== body.position.y) {
        Matter.Body.setPosition(body, { x: unit.x, y: unit.y });
      }
    }

    const substeps = Math.min(MAX_SUBSTEPS, Math.max(1, Math.round((deltaSec * 1000) / FIXED_STEP_MS)));
    for (let s = 0; s < substeps; s++) {
      for (const [id, unit] of units) {
        if (unit.reachedBase) continue;
        const body = this.bodies.get(id);
        if (!body) continue;
        // unit.vx/vy (the desired velocity a behavior method wrote this
        // tick) is in px/s throughout the rest of the game; Matter's
        // body.velocity is in its own per-reference-step units (see
        // STEER_GAIN's comment) -- convert before comparing.
        const dvx = unit.vx / 60 - body.velocity.x;
        const dvy = unit.vy / 60 - body.velocity.y;
        Matter.Body.applyForce(body, body.position, {
          x: dvx * STEER_GAIN * body.mass,
          y: dvy * STEER_GAIN * body.mass,
        });
      }
      Matter.Engine.update(this.engine, FIXED_STEP_MS);
    }

    for (const [id, unit] of units) {
      if (unit.reachedBase) continue;
      const body = this.bodies.get(id);
      if (!body) continue;

      const x = Math.max(0, Math.min(WORLD_WIDTH, body.position.x));
      const y = Math.max(LANE_Y_MIN, Math.min(LANE_Y_MAX, body.position.y));
      if (x !== body.position.x || y !== body.position.y) {
        Matter.Body.setPosition(body, { x, y });
      }

      unit.x = body.position.x;
      unit.y = body.position.y;
      // body.velocity is Matter's internal per-substep units, not px/s --
      // scale by the reference step rate so the rest of the game (which
      // treats unit.vx/vy as px/s throughout) reads a consistent number.
      unit.vx = body.velocity.x * 60;
      unit.vy = body.velocity.y * 60;
    }
  }

  destroy(): void {
    Matter.Composite.clear(this.engine.world, false);
    this.bodies.clear();
  }
}
