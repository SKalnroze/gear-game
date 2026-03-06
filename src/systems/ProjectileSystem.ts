import { UnitState } from '../types/unit.types';
import { EventBus } from './EventBus';
import { World } from '../world/World';
import { distance } from '../utils/MathUtils';
import { gearRadius } from '../constants/gear.constants';

let _nextProjId = 1;
function nextProjId(): string {
  return `proj_${_nextProjId++}`;
}

export interface ProjectileState {
  id: string;
  owner: 'player' | 'ai';
  ownerUnitId: string;
  type: 'artillery_shell' | 'crystal_shard';
  x: number;
  y: number;
  vx: number;
  vy: number;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  travelTime: number;  // seconds total travel
  elapsed: number;     // seconds elapsed
  damage: number;
  aoeRadius: number;   // 0 for crystal shard, size*1.5 for artillery
  slowFactor: number;  // 0 for artillery, 0.5 for crystal shard
  slowDuration: number;// 0 for artillery, 2.0 for crystal shard
  hitGears: boolean;   // true for artillery AoE
}

/**
 * Manages projectiles (artillery shells and crystal shards).
 * Called from GameScene.update; owned by GameScene for clean separation.
 */
export class ProjectileSystem {
  private projectiles: Map<string, ProjectileState> = new Map();

  addProjectile(proj: Omit<ProjectileState, 'id'>): string {
    const id = nextProjId();
    this.projectiles.set(id, { ...proj, id });
    return id;
  }

  /**
   * Create an artillery shell projectile from a unit toward a target position.
   */
  fireArtilleryShell(
    unit: UnitState,
    targetX: number,
    targetY: number,
    damage: number,
  ): string {
    const travelTime = 1.5; // seconds
    const id = this.addProjectile({
      owner: unit.owner,
      ownerUnitId: unit.id,
      type: 'artillery_shell',
      x: unit.x,
      y: unit.y,
      vx: 0,
      vy: 0,
      startX: unit.x,
      startY: unit.y,
      targetX,
      targetY,
      travelTime,
      elapsed: 0,
      damage,
      aoeRadius: unit.size * 1.5,
      slowFactor: 0,
      slowDuration: 0,
      hitGears: true,
    });
    return id;
  }

  /**
   * Create a crystal shard projectile from a unit toward a target position.
   */
  fireCrystalShard(
    unit: UnitState,
    targetX: number,
    targetY: number,
    damage: number,
  ): string {
    const speed = 350; // px/s
    const dx = targetX - unit.x;
    const dy = targetY - unit.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const vx = dist > 0 ? (dx / dist) * speed : speed;
    const vy = dist > 0 ? (dy / dist) * speed : 0;
    const travelTime = dist > 0 ? dist / speed + 0.3 : 1.0; // a bit of margin

    const id = this.addProjectile({
      owner: unit.owner,
      ownerUnitId: unit.id,
      type: 'crystal_shard',
      x: unit.x,
      y: unit.y,
      vx,
      vy,
      startX: unit.x,
      startY: unit.y,
      targetX,
      targetY,
      travelTime,
      elapsed: 0,
      damage,
      aoeRadius: 0,
      slowFactor: 0.5,
      slowDuration: 2.0,
      hitGears: false,
    });
    return id;
  }

  getProjectiles(): Map<string, ProjectileState> {
    return this.projectiles;
  }

  /**
   * Update all projectiles. Apply damage on hit. Remove expired projectiles.
   */
  update(
    deltaSec: number,
    allUnits: Map<string, UnitState>,
    world: World,
    eventBus: EventBus,
  ): void {
    const toRemove: string[] = [];

    for (const [id, proj] of this.projectiles) {
      proj.elapsed += deltaSec;

      if (proj.type === 'artillery_shell') {
        this.updateArtilleryShell(proj, toRemove, allUnits, world, eventBus);
      } else {
        this.updateCrystalShard(proj, toRemove, allUnits, eventBus);
      }
    }

    for (const id of toRemove) {
      this.projectiles.delete(id);
    }
  }

  private updateArtilleryShell(
    proj: ProjectileState,
    toRemove: string[],
    allUnits: Map<string, UnitState>,
    world: World,
    eventBus: EventBus,
  ): void {
    const t = Math.min(proj.elapsed / proj.travelTime, 1);
    const arcHeight = -80;

    // Lerp x and y with parabolic arc
    proj.x = proj.startX + (proj.targetX - proj.startX) * t;
    proj.y = proj.startY + (proj.targetY - proj.startY) * t + arcHeight * Math.sin(Math.PI * t);

    if (proj.elapsed >= proj.travelTime) {
      // Hit! AoE damage
      this.explodeArtillery(proj, allUnits, world, eventBus);
      eventBus.emit('projectile:hit', { id: proj.id, x: proj.targetX, y: proj.targetY, aoeRadius: proj.aoeRadius });
      toRemove.push(proj.id);
    }
  }

  private explodeArtillery(
    proj: ProjectileState,
    allUnits: Map<string, UnitState>,
    world: World,
    eventBus: EventBus,
  ): void {
    const cx = proj.targetX;
    const cy = proj.targetY;
    const r = proj.aoeRadius;

    // Damage all units within radius
    for (const [, unit] of allUnits) {
      if (unit.owner === proj.owner) continue; // only hit enemies
      if (unit.reachedBase) continue;

      const d = distance(unit.x, unit.y, cx, cy);
      if (d <= r) {
        const dmg = proj.damage * (1 - d / (r * 1.5)); // falloff
        const actualDmg = Math.max(1, dmg);
        unit.hp -= actualDmg;
        eventBus.emit('unit:damaged', { unitId: unit.id, damage: actualDmg, x: unit.x, y: unit.y });
        if (unit.hp <= 0) {
          unit.hp = 0;
          eventBus.emit('unit:died', { unitId: unit.id, owner: unit.owner });
        }
      }
    }

    // Damage all gears within radius
    if (proj.hitGears) {
      for (const [, gear] of world.getAllGears()) {
        if (gear.owner === proj.owner) continue;
        const gr = gearRadius(gear.teeth);
        const d = distance(gear.x, gear.y, cx, cy);
        if (d <= r + gr) {
          const dmg = proj.damage * (1 - d / (r * 1.5));
          const actualDmg = Math.max(1, dmg);
          gear.hp = Math.max(0, gear.hp - actualDmg);
          gear.crackLevel = Math.min(4, Math.floor((1 - gear.hp / gear.maxHp) * 5));
          world.updateGear(gear);
          eventBus.emit('gear:damaged', {
            gearId: gear.id,
            damage: actualDmg,
            remainingHp: gear.hp,
            source: 'combat',
          });
          if (gear.hp <= 0) {
            eventBus.emit('gear:destroyed', { gearId: gear.id, owner: gear.owner, cause: 'combat' });
          }
        }
      }
    }
  }

  private updateCrystalShard(
    proj: ProjectileState,
    toRemove: string[],
    allUnits: Map<string, UnitState>,
    eventBus: EventBus,
  ): void {
    // Straight line movement
    proj.x += proj.vx * (proj.elapsed - (proj.elapsed - 1 / 60)); // approximate — will be recalc below
    // Better: update based on full delta stored externally. We recalculate from elapsed.
    // Actually track position incrementally:
    // We store the last delta externally we can't access here. Use elapsed-based lerp instead.
    const speed = Math.sqrt(proj.vx * proj.vx + proj.vy * proj.vy);
    const traveledDist = speed * proj.elapsed;
    const dx = proj.targetX - proj.startX;
    const dy = proj.targetY - proj.startY;
    const totalDist = Math.sqrt(dx * dx + dy * dy);

    if (totalDist > 0) {
      proj.x = proj.startX + (dx / totalDist) * traveledDist;
      proj.y = proj.startY + (dy / totalDist) * traveledDist;
    }

    // Check if passed target + margin
    const margin = 60;
    if (traveledDist > totalDist + margin || proj.elapsed >= proj.travelTime) {
      toRemove.push(proj.id);
      return;
    }

    // Check collision with first enemy unit in path
    for (const [, unit] of allUnits) {
      if (unit.owner === proj.owner) continue;
      if (unit.reachedBase) continue;

      const d = distance(proj.x, proj.y, unit.x, unit.y);
      if (d < unit.size + 4) {
        // Hit this unit
        unit.hp -= proj.damage;
        unit.slowTimer = proj.slowDuration;
        unit.slowFactor = proj.slowFactor;

        eventBus.emit('unit:damaged', { unitId: unit.id, damage: proj.damage, x: unit.x, y: unit.y });
        if (unit.hp <= 0) {
          unit.hp = 0;
          eventBus.emit('unit:died', { unitId: unit.id, owner: unit.owner });
        }
        eventBus.emit('projectile:hit', { id: proj.id, x: proj.x, y: proj.y, aoeRadius: 0 });
        toRemove.push(proj.id);
        return;
      }
    }
  }

  destroy(): void {
    this.projectiles.clear();
  }
}
