import { World } from '../world/World';
import { EventBus } from './EventBus';
import { ProjectileSystem } from './ProjectileSystem';
import { UnitSystem } from './UnitSystem';
import { UnitState } from '../types/unit.types';
import { distance, leadPosition } from '../utils/MathUtils';
import { turretRange } from '../constants/gear.constants';

/** Crystal shard flight speed, px/s -- must match ProjectileSystem.fireCrystalShard. */
const CRYSTAL_SHARD_SPEED = 350;
/** Artillery shell flight time, seconds -- must match ProjectileSystem.fireArtilleryShell (fixed arc time, not distance-based). */
const ARTILLERY_SHELL_TRAVEL_TIME = 1.5;

interface TurretCooldownState {
  lastFireTime: number;
}

export class TurretSystem {
  private world: World;
  private eventBus: EventBus;
  private projectileSystem: ProjectileSystem;
  private unitSystem: UnitSystem;
  private cooldowns: Map<string, TurretCooldownState> = new Map();

  private readonly handleGearRemoved = ({ gearId }: { gearId: string }): void => {
    this.cooldowns.delete(gearId);
  };

  constructor(world: World, eventBus: EventBus, projectileSystem: ProjectileSystem, unitSystem: UnitSystem) {
    this.world = world;
    this.eventBus = eventBus;
    this.projectileSystem = projectileSystem;
    this.unitSystem = unitSystem;
    this.eventBus.on('gear:removed', this.handleGearRemoved);
  }

  update(_deltaSec: number, now: number): void {
    for (const [, gear] of this.world.getAllGears()) {
      if (gear.type !== 'crossbow_turret' && gear.type !== 'artillery_turret') continue;
      if (!gear.ammo || gear.ammo <= 0) continue;

      const state = this.cooldowns.get(gear.id) ?? { lastFireTime: 0 };
      const cooldownMs = gear.type === 'crossbow_turret' ? 600 : 2500; // crossbow fast, artillery slow

      if (now - state.lastFireTime < cooldownMs) continue;

      // Find nearest enemy unit in range
      const range = turretRange(gear.teeth, gear.type);
      let nearestDist = range;
      let target: UnitState | null = null;

      for (const [, unit] of this.unitSystem.getAllUnits()) {
        if (unit.owner === gear.owner) continue;
        if (unit.reachedBase) continue;
        const d = distance(gear.x, gear.y, unit.x, unit.y);
        if (d < nearestDist) {
          nearestDist = d;
          target = unit;
        }
      }

      if (!target) continue; // no target

      // Lead the shot at where the target will be when it arrives, using
      // its real current velocity, instead of where it was standing at the
      // instant of firing.
      const travelTime = gear.type === 'crossbow_turret'
        ? nearestDist / CRYSTAL_SHARD_SPEED
        : ARTILLERY_SHELL_TRAVEL_TIME;
      const { x: targetX, y: targetY } = leadPosition(target.x, target.y, target.vx, target.vy, travelTime);

      // Fire
      gear.ammo = Math.max(0, gear.ammo - 1);
      this.world.updateGear(gear);
      state.lastFireTime = now;
      this.cooldowns.set(gear.id, state);

      if (gear.type === 'crossbow_turret') {
        const fakeUnit = {
          id: gear.id,
          owner: gear.owner,
          x: gear.x,
          y: gear.y,
          size: Math.max(4, Math.round(gear.teeth * 0.8)),
        } as unknown as UnitState;
        const damage = Math.max(3, gear.teeth * 0.8);
        this.projectileSystem.fireCrystalShard(fakeUnit, targetX, targetY, damage);
      } else {
        const fakeUnit = {
          id: gear.id,
          owner: gear.owner,
          x: gear.x,
          y: gear.y,
          size: Math.max(6, Math.round(gear.teeth * 1.0)),
        } as unknown as UnitState;
        const damage = Math.max(8, gear.teeth * 2.0);
        this.projectileSystem.fireArtilleryShell(fakeUnit, targetX, targetY, damage);
      }

      this.eventBus.emit('projectile:fired', {
        id: gear.id,
        type: gear.type === 'crossbow_turret' ? 'crystal_shard' : 'artillery_shell',
        owner: gear.owner,
        x: gear.x,
        y: gear.y,
      });
    }
  }

  destroy(): void {
    this.eventBus.off('gear:removed', this.handleGearRemoved);
    this.cooldowns.clear();
  }
}
