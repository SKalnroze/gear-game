import { UnitState, UnitType, UnitDefinition } from '../types/unit.types';
import type { GearState } from '../types/gear.types';
import { EventBus } from './EventBus';
import { UNIT_DEFINITIONS } from '../constants/unit.constants';
import { gearRadius, crackLevelFor } from '../constants/gear.constants';
import { WORLD_WIDTH, LANE_Y_MIN, LANE_Y_MAX } from '../constants/world.constants';
import { randomInt } from '../utils/MathUtils';
import { World } from '../world/World';
import { EconomySystem } from './EconomySystem';
import { ProjectileSystem } from './ProjectileSystem';
import { distance, sqrDist } from '../utils/MathUtils';
import {
  computeScaledStats,
  isInFront,
  marchDirection,
  spawnX,
  hasReachedEnemyBase,
  gearInLane,
  computeAttackCooldown,
  computeChargeDamage,
} from './unit.utils';
import { computeDamage, getChainUnitType } from '../constants/unit.constants';
import { COMBO_CHAIN_MIN_GEARS } from '../constants/balance.constants';
import type { RotationPhysicsSystem } from './RotationPhysicsSystem';
import type { TechSystem } from './TechSystem';

let _nextUnitId = 1;
function nextUnitId(): string {
  return `unit_${_nextUnitId++}`;
}

let _coldZoneId = 1;
function nextColdZoneId(): string {
  return `cold_${_coldZoneId++}`;
}

/** Accumulated per-side tech multipliers applied to a unit type at spawn. */
interface UnitBonuses {
  hp: number;
  speed: number;
  damage: number;
}

interface ColdZone {
  id: string;
  x: number;
  y: number;
  radius: number;
  endTime: number; // seconds (game time / 1000)
  owner: 'player' | 'ai'; // who created it — freezes ENEMY units/gears
}

const COLD_ZONE_RADIUS = 55;
const COLD_ZONE_DURATION = 5.0; // seconds
const COLD_ZONE_SLOW_FACTOR = 0.45;
const COLD_GEAR_FRICTION = 20;


/** Charge acceleration for cavalry (px/s²) */
const CAVALRY_CHARGE_ACCEL = 200;
/** Crystal sentinel search range */
const SENTINEL_ATTACK_RANGE = 500;
/** Infantry/Iron Guard melee range — used when target is within contact */
const MELEE_CONTACT_DIST = 2; // extra beyond size+size
/** Cavalry retreat duration (seconds) */
const CAVALRY_RETREAT_DURATION = 3.5;
/** Crystal sentinel shield aura: radius around the sentinel and the incoming-damage multiplier it grants allies */
const SHIELD_AURA_RADIUS = 90;
const SHIELD_AURA_FACTOR = 0.8;
/** Refreshed every beam tick (800ms) while the sentinel is active; a bit longer so a brief gap doesn't drop it */
const SHIELD_AURA_TIMER = 1.2;


/** Build initial UnitState fields for new fields. */
function newPhysicsFields(unitType: UnitType): {
  vx: number; vy: number; behaviorState: UnitState['behaviorState'];
  lastAttackTime: number; chargeAccum: number; retreatTimer: number;
  slowTimer: number; slowFactor: number; shieldTimer: number; shieldFactor: number;
} {
  return {
    vx: 0,
    vy: 0,
    behaviorState: unitType === 'cavalry' ? 'charging' : 'marching',
    lastAttackTime: 0,
    chargeAccum: 0,
    retreatTimer: 0,
    slowTimer: 0,
    slowFactor: 1,
    shieldTimer: 0,
    shieldFactor: 1,
  };
}

/**
 * Manages unit spawning, marching, behavior, and removal.
 * Units use continuous x/y in the lane band (no grid / lane index).
 * Units are automatically spawned when gears complete rotations.
 * Gear interactions are handled by GearUnitInteractionSystem.
 */
export class UnitSystem {
  private eventBus: EventBus;
  private units: Map<string, UnitState> = new Map();
  private world: World | null = null;
  private economySystem: EconomySystem | null = null;
  private rotationPhysics: RotationPhysicsSystem | null = null;
  private techSystem: TechSystem | null = null;

  // Cold zone system (crystal sentinel)
  private coldZones: ColdZone[] = [];
  private gearsWithColdFriction: Set<string> = new Set();

  // Tech modifiers, keyed `${owner}:${unitType}`. These used to be keyed by
  // unit type alone, so a tech node one side researched buffed *both* sides'
  // units of that type.
  private unitBonuses: Map<string, UnitBonuses> = new Map();
  private unlockedUnits: Set<UnitType> = new Set(['infantry']);

  private readonly onGearFullRotation = ({ gearId, owner }: { gearId: string; owner: 'player' | 'ai' }) => {
    if (this.world && this.economySystem) {
      this.trySpawnUnitFromGear(gearId, owner);
    }
  };

  private readonly onUnitDied = ({ unitId }: { unitId: string }) => {
    this.units.delete(unitId);
  };

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;

    this.eventBus.on('gear:full_rotation', this.onGearFullRotation);
    this.eventBus.on('unit:died', this.onUnitDied);
  }

  setWorld(world: World): void {
    this.world = world;
  }

  setEconomySystem(economySystem: EconomySystem): void {
    this.economySystem = economySystem;
  }

  setRotationPhysics(rotationPhysics: RotationPhysicsSystem): void {
    this.rotationPhysics = rotationPhysics;
  }

  setTechSystem(techSystem: TechSystem): void {
    this.techSystem = techSystem;
  }

  isUnitTypeUnlocked(type: UnitType): boolean {
    const alwaysUnlocked: UnitType[] = ['infantry', 'mixed'];
    if (alwaysUnlocked.includes(type)) return true;
    return this.unlockedUnits.has(type);
  }

  unlockUnitType(type: UnitType): void {
    this.unlockedUnits.add(type);
  }

  /** Accumulated tech bonuses for one side's units of one type. */
  private bonusesFor(owner: 'player' | 'ai', unitType: UnitType): UnitBonuses {
    const key = `${owner}:${unitType}`;
    let bonuses = this.unitBonuses.get(key);
    if (!bonuses) {
      bonuses = { hp: 0, speed: 0, damage: 0 };
      this.unitBonuses.set(key, bonuses);
    }
    return bonuses;
  }

  applyHpBonus(owner: 'player' | 'ai', unitType: UnitType, pct: number): void {
    this.bonusesFor(owner, unitType).hp += pct;
  }

  applySpeedBonus(owner: 'player' | 'ai', unitType: UnitType, pct: number): void {
    this.bonusesFor(owner, unitType).speed += pct;
  }

  applyDamageBonus(owner: 'player' | 'ai', unitType: UnitType, pct: number): void {
    this.bonusesFor(owner, unitType).damage += pct;
  }

  /** Read-only view of a side's bonuses, for tests and debug overlays. */
  getUnitBonuses(owner: 'player' | 'ai', unitType: UnitType): Readonly<UnitBonuses> {
    return this.unitBonuses.get(`${owner}:${unitType}`) ?? { hp: 0, speed: 0, damage: 0 };
  }

  /**
   * Spawn a single unit from a gear rotation. Stats are scaled by gear teeth.
   * Called by trySpawnUnitFromGear — 1 unit per spin.
   */
  spawnSingleFromGear(owner: 'player' | 'ai', unitType: UnitType, teeth: number): void {
    const def = UNIT_DEFINITIONS[unitType];
    const scaled = computeScaledStats(def, teeth, unitType);

    const { hp: hpBonus, speed: speedBonus, damage: dmgBonus } = this.getUnitBonuses(owner, unitType);
    const frictionVal = def.frictionValue ?? 0;

    const startX = spawnX(owner, this.playerRight);
    const margin = 20;
    const y = randomInt(LANE_Y_MIN + margin, LANE_Y_MAX - margin);

    const hp = Math.round(scaled.hp * (1 + hpBonus));
    const unit: UnitState = {
      id: nextUnitId(),
      type: unitType,
      hp,
      maxHp: hp,
      x: startX,
      y,
      owner,
      speed: scaled.speed * (1 + speedBonus),
      baseDamage: Math.round(scaled.baseDamage * (1 + dmgBonus)),
      inCombat: false,
      reachedBase: false,
      damage: Math.round(scaled.damage * (1 + dmgBonus)),
      frictionValue: frictionVal,
      size: scaled.size,
      attackRange: scaled.attackRange,
      mass: scaled.mass,
      ...newPhysicsFields(unitType),
    };

    this.units.set(unit.id, unit);
    this.eventBus.emit('unit:spawned', { unit: { ...unit } });
  }

  /**
   * Main update — behavior state machines, physics, collision, death.
   */
  update(deltaSec: number, now: number, projectileSystem: ProjectileSystem): void {
    const allUnits = this.units;
    const allGears = this.world ? this.world.getAllGears() : new Map();

    // 1. Update behavior state machines per unit type
    for (const [, unit] of allUnits) {
      if (unit.reachedBase) continue;
      if (unit.attachedGearId) continue; // attached wrench units don't march

      // Apply shield timer (crystal sentinel aura)
      if (unit.shieldTimer > 0) {
        unit.shieldTimer = Math.max(0, unit.shieldTimer - deltaSec);
        if (unit.shieldTimer <= 0) {
          unit.shieldFactor = 1;
        }
      }

      // Apply slow timer
      if (unit.slowTimer > 0) {
        unit.slowTimer = Math.max(0, unit.slowTimer - deltaSec);
        if (unit.slowTimer <= 0) {
          unit.slowFactor = 1;
        }
      }

      switch (unit.type) {
        case 'wrench':
          this.updateWrench(unit, deltaSec);
          break;
        case 'infantry':
          this.updateInfantry(unit, deltaSec, now, allUnits, allGears);
          break;
        case 'cavalry':
        case 'elite_cavalry':
          this.updateCavalry(unit, deltaSec, now, allUnits, allGears);
          break;
        case 'artillery':
        case 'elite_artillery':
          this.updateArtillery(unit, deltaSec, now, projectileSystem, allUnits, allGears);
          break;
        case 'iron_guard':
          this.updateIronGuard(unit, deltaSec, now, allUnits, allGears);
          break;
        case 'aether_phantom':
          this.updateAetherPhantom(unit, deltaSec, now, allUnits);
          break;
        case 'crystal_sentinel':
          this.updateCrystalSentinel(unit, deltaSec, now, projectileSystem, allUnits, allGears);
          break;
        case 'mixed':
        case 'elite_infantry':
          this.updateInfantry(unit, deltaSec, now, allUnits, allGears);
          break;
        default:
          // Default march
          this.marchForward(unit, deltaSec);
          break;
      }
    }

    // 1b. Update cold zones (crystal sentinel icy areas)
    this.updateColdZones(now, allUnits, allGears);

    // 2. Integrate physics (vx/vy -> position)
    for (const [, unit] of allUnits) {
      if (unit.reachedBase) continue;
      if (unit.attachedGearId) continue;

      unit.x += unit.vx * deltaSec;
      unit.y += unit.vy * deltaSec;

      // Clamp to world bounds
      unit.x = Math.max(0, Math.min(WORLD_WIDTH, unit.x));
      unit.y = Math.max(LANE_Y_MIN, Math.min(LANE_Y_MAX, unit.y));
    }

    // 3. Unit-unit collision resolution
    this.resolveUnitCollisions(allUnits);

    // 4. Remove dead units (hp <= 0) with iron guard explosion
    const deadUnits: UnitState[] = [];
    for (const [, unit] of allUnits) {
      if (unit.hp <= 0 && !unit.reachedBase) {
        deadUnits.push(unit);
      }
    }
    for (const unit of deadUnits) {
      if (unit.type === 'iron_guard') {
        this.triggerIronGuardExplosion(unit, allUnits, allGears);
        // Emit visual explosion event so GameScene shows the AoE circle
        const explosionRadius = unit.size * 3;
        this.eventBus.emit('projectile:hit', { id: 'iron_explode', x: unit.x, y: unit.y, aoeRadius: explosionRadius });
      }
      this.eventBus.emit('unit:died', { unitId: unit.id, owner: unit.owner });
    }

    // 5. Emit unit:moved for all living units
    const arrivedUnits: UnitState[] = [];
    for (const [, unit] of allUnits) {
      if (unit.reachedBase) continue;

      this.eventBus.emit('unit:moved', { unitId: unit.id, x: unit.x, y: unit.y });

      if (this.hasReachedEnemyBase(unit)) {
        unit.reachedBase = true;
        arrivedUnits.push(unit);
      }
    }

    // A unit that reaches the enemy base is spent. Drop it from the map here:
    // GameScene already tears down its entity and its World record on this
    // event, but nothing used to remove it from ours, so every unit that ever
    // reached a base stayed in memory and got re-scanned for the whole match.
    for (const unit of arrivedUnits) {
      this.eventBus.emit('unit:reached_base', { unit: { ...unit } });
      this.units.delete(unit.id);
    }
  }

  /** True when a unit has crossed into the base it is attacking. */
  private hasReachedEnemyBase(unit: UnitState): boolean {
    return hasReachedEnemyBase(unit, this.playerRight);
  }

  /** Whether the human side occupies the right half of the map. */
  private get playerRight(): boolean {
    return this.world?.isPlayerOnRight() ?? false;
  }

  // ─── Behavior update methods ────────────────────────────────────────────

  private marchForward(unit: UnitState, deltaSec: number): void {
    const direction = marchDirection(unit.owner, this.playerRight);
    const effectiveSpeed = unit.speed * (unit.slowFactor ?? 1);
    unit.vx = direction * effectiveSpeed;
    unit.vy = 0;
    unit.behaviorState = 'marching';
  }

  private updateWrench(unit: UnitState, deltaSec: number): void {
    if (!unit.inCombat) {
      this.marchForward(unit, deltaSec);
    } else {
      unit.vx = 0;
      unit.vy = 0;
    }
  }

  private updateInfantry(
    unit: UnitState,
    deltaSec: number,
    now: number,
    allUnits: Map<string, UnitState>,
    allGears: ReturnType<World['getAllGears']>,
  ): void {
    const direction = marchDirection(unit.owner, this.playerRight);
    const effectiveSpeed = unit.speed * (unit.slowFactor ?? 1);

    // Find nearest enemy unit or enemy gear within 300px
    // Squared throughout: these are only ever compared, never used as a length.
    let nearestDist2 = 300 * 300;
    let nearestUnitTarget: UnitState | null = null;
    let nearestGearX = 0;
    let nearestGearY = 0;
    let nearestGearDist2 = Infinity;
    let hasGearTarget = false;

    for (const [, other] of allUnits) {
      if (other.owner === unit.owner) continue;
      if (other.reachedBase) continue;
      if (!isInFront(unit, other.x, this.playerRight)) continue; // don't chase targets behind
      const d2 = sqrDist(unit.x, unit.y, other.x, other.y);
      if (d2 < nearestDist2) {
        nearestDist2 = d2;
        nearestUnitTarget = other;
      }
    }

    // Also find nearest reachable enemy gear (must be in lane for melee)
    for (const [, gear] of allGears) {
      if (gear.owner === unit.owner) continue;
      if (gear.hp <= 0 || gear.isBurntOut) continue; // never chase a dead or burnt-out gear
      if (!isInFront(unit, gear.x, this.playerRight)) continue; // don't chase gears behind
      if (!gearInLane(gear.y)) continue; // melee can't reach gears outside lane
      const d2 = sqrDist(unit.x, unit.y, gear.x, gear.y);
      if (d2 < nearestGearDist2) {
        nearestGearDist2 = d2;
        nearestGearX = gear.x;
        nearestGearY = gear.y;
        hasGearTarget = true;
      }
    }

    if (nearestUnitTarget) {
      const dx = nearestUnitTarget.x - unit.x;
      const dy = nearestUnitTarget.y - unit.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const contactDist = unit.size + nearestUnitTarget.size + MELEE_CONTACT_DIST;

      if (d <= contactDist) {
        // Attack
        unit.behaviorState = 'attacking';
        unit.inCombat = true;
        unit.vx = 0;
        unit.vy = 0;

        // Cooldown scales with size: 1000ms for 10-tooth (size=12), scales up for larger
        const infantryAttackCooldown = computeAttackCooldown(unit.size); // 1000ms at 10 teeth
        if (now - unit.lastAttackTime > infantryAttackCooldown) {
          const dmg = computeDamage(unit.type, nearestUnitTarget, unit.baseDamage);
          nearestUnitTarget.hp -= dmg;
          unit.lastAttackTime = now;
          this.eventBus.emit('unit:damaged', {
            unitId: nearestUnitTarget.id,
            damage: dmg,
            x: nearestUnitTarget.x,
            y: nearestUnitTarget.y,
          });
          if (nearestUnitTarget.hp <= 0) {
            nearestUnitTarget.hp = 0;
          }
        }
      } else {
        // March toward target
        unit.behaviorState = 'marching';
        unit.inCombat = false;
        const nx = dx / d;
        const ny = dy / d;
        unit.vx = nx * effectiveSpeed;
        unit.vy = ny * effectiveSpeed;
      }
    } else if (hasGearTarget && nearestGearDist2 < 400 * 400) {
      // March toward nearest reachable enemy gear
      const dx = nearestGearX - unit.x;
      const dy = nearestGearY - unit.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 0.1) {
        unit.behaviorState = 'marching';
        unit.inCombat = false;
        unit.vx = (dx / d) * effectiveSpeed;
        unit.vy = (dy / d) * effectiveSpeed;
      }
    } else {
      // Default march forward
      this.marchForward(unit, deltaSec);
      unit.inCombat = false;
    }
  }

  private updateCavalry(
    unit: UnitState,
    deltaSec: number,
    now: number,
    allUnits: Map<string, UnitState>,
    allGears: ReturnType<World['getAllGears']>,
  ): void {
    const direction = marchDirection(unit.owner, this.playerRight);
    const effectiveSpeedMult = unit.slowFactor ?? 1;

    if (unit.behaviorState === 'retreating') {
      unit.retreatTimer = Math.max(0, unit.retreatTimer - deltaSec);
      unit.vx = -direction * unit.speed * 1.2 * effectiveSpeedMult;
      unit.vy = 0;

      if (unit.retreatTimer <= 0) {
        unit.behaviorState = 'charging';
        unit.chargeAccum = 0;
      }
      return;
    }

    // Only charge toward enemies that are in front
    const hasForwardTarget = Array.from(allUnits.values()).some(
      u => u.owner !== unit.owner && !u.reachedBase && isInFront(unit, u.x, this.playerRight),
    );
    const hasForwardGear = Array.from(allGears.values()).some(
      g => g.owner !== unit.owner && isInFront(unit, g.x, this.playerRight) && gearInLane(g.y),
    );

    // If no forward targets, just march forward (don't charge backward)
    if (!hasForwardTarget && !hasForwardGear) {
      this.marchForward(unit, deltaSec);
      unit.chargeAccum = 0;
      return;
    }

    // Charging — accelerate
    unit.chargeAccum += deltaSec * CAVALRY_CHARGE_ACCEL;
    unit.vx = direction * (unit.speed + unit.chargeAccum) * effectiveSpeedMult;
    unit.vy = 0;
    unit.behaviorState = 'charging';

    // Check for contact with enemy unit
    for (const [, other] of allUnits) {
      if (other.owner === unit.owner) continue;
      if (other.reachedBase) continue;
      const d = distance(unit.x, unit.y, other.x, other.y);
      const contactDist = unit.size + other.size + MELEE_CONTACT_DIST;
      if (d <= contactDist) {
        // Charge hit! Apply momentum impulse to target
        const chargeSpeed = Math.abs(unit.vx);
        const chargeDmg = computeDamage(unit.type, other, computeChargeDamage(unit.baseDamage, unit.chargeAccum));
        other.hp -= chargeDmg;
        this.eventBus.emit('unit:damaged', {
          unitId: other.id,
          damage: chargeDmg,
          x: other.x,
          y: other.y,
        });
        if (other.hp <= 0) other.hp = 0;

        // Physics impulse: transfer momentum based on mass ratio
        const totalMass = unit.mass + other.mass;
        const impulse = unit.mass * chargeSpeed / totalMass;
        other.vx += direction * impulse;

        // Start retreat
        unit.retreatTimer = CAVALRY_RETREAT_DURATION;
        unit.chargeAccum = 0;
        unit.behaviorState = 'retreating';
        return;
      }
    }

    // Check for contact with enemy gear (in lane) — also triggers retreat
    for (const [, gear] of allGears) {
      if (gear.owner === unit.owner) continue;
      if (!gearInLane(gear.y)) continue;
      const d = distance(unit.x, unit.y, gear.x, gear.y);
      const contactDist = unit.size + gearRadius(gear.teeth) + MELEE_CONTACT_DIST;
      if (d <= contactDist) {
        // Hit gear — deal damage and retreat
        const chargeDmg = computeChargeDamage(unit.baseDamage, unit.chargeAccum);
        const wasAlive = gear.hp > 0;
        gear.hp = Math.max(0, gear.hp - chargeDmg);
        gear.crackLevel = crackLevelFor(gear.hp, gear.maxHp);
        if (this.world) this.world.updateGear(gear);
        this.eventBus.emit('gear:damaged', {
          gearId: gear.id,
          damage: chargeDmg,
          remainingHp: gear.hp,
          source: 'combat',
        });
        if (wasAlive && gear.hp <= 0) {
          this.eventBus.emit('gear:destroyed', { gearId: gear.id, owner: gear.owner, cause: 'combat' });
        }
        // Retreat on gear impact
        unit.retreatTimer = CAVALRY_RETREAT_DURATION;
        unit.chargeAccum = 0;
        unit.behaviorState = 'retreating';
        return;
      }
    }
  }

  private updateArtillery(
    unit: UnitState,
    deltaSec: number,
    now: number,
    projectileSystem: ProjectileSystem,
    allUnits: Map<string, UnitState>,
    allGears: ReturnType<World['getAllGears']>,
  ): void {
    const direction = marchDirection(unit.owner, this.playerRight);
    const effectiveSpeed = unit.speed * (unit.slowFactor ?? 1);

    // Detection range = 1.5× attack range (search further than stop range)
    const artilleryDetectRange = unit.attackRange * 1.5;

    // Find nearest enemy unit or gear in front of this unit (ranged — can target outside lane)
    let targetX = -1;
    let targetY = -1;
    let targetDist = Infinity;

    for (const [, other] of allUnits) {
      if (other.owner === unit.owner) continue;
      if (other.reachedBase) continue;
      if (!isInFront(unit, other.x, this.playerRight)) continue; // don't fire backward
      const d = distance(unit.x, unit.y, other.x, other.y);
      if (d < artilleryDetectRange && d < targetDist) {
        targetDist = d;
        targetX = other.x;
        targetY = other.y;
      }
    }

    // If no enemy unit, try enemy gear (ranged can reach outside lane)
    if (targetX < 0) {
      for (const [, gear] of allGears) {
        if (gear.owner === unit.owner) continue;
        if (!isInFront(unit, gear.x, this.playerRight)) continue;
        const d = distance(unit.x, unit.y, gear.x, gear.y);
        if (d < artilleryDetectRange && d < targetDist) {
          targetDist = d;
          targetX = gear.x;
          targetY = gear.y;
        }
      }
    }

    if (targetX >= 0) {
      // Track turret toward target (always, even while marching)
      unit.turretAngle = Math.atan2(targetY - unit.y, targetX - unit.x);

      if (targetDist <= unit.attackRange) {
        // Stop and fire
        unit.vx = 0;
        unit.vy = 0;
        unit.behaviorState = 'firing';
        unit.inCombat = true;

        if (now - unit.lastAttackTime > 2500) {
          projectileSystem.fireArtilleryShell(unit, targetX, targetY, unit.baseDamage * 2);
          this.eventBus.emit('projectile:fired', {
            id: 'shell',
            type: 'artillery_shell',
            owner: unit.owner,
            x: unit.x,
            y: unit.y,
          });
          unit.lastAttackTime = now;
        }
      } else {
        // March toward target
        const dx = targetX - unit.x;
        const dy = targetY - unit.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        unit.vx = (dx / d) * effectiveSpeed;
        unit.vy = (dy / d) * effectiveSpeed;
        unit.behaviorState = 'marching';
        unit.inCombat = false;
      }
    } else {
      // Default march — turret points forward
      unit.turretAngle = marchDirection(unit.owner, this.playerRight) > 0 ? 0 : Math.PI;
      this.marchForward(unit, deltaSec);
      unit.inCombat = false;
    }
  }

  private updateIronGuard(
    unit: UnitState,
    deltaSec: number,
    now: number,
    allUnits: Map<string, UnitState>,
    allGears: ReturnType<World['getAllGears']>,
  ): void {
    // Heavy, slow unit. Frontal attack only. 3× slower than infantry. High push impulse.
    const effectiveSpeed = unit.speed * 0.7 * (unit.slowFactor ?? 1);
    const direction = marchDirection(unit.owner, this.playerRight);
    const playerRight = this.playerRight;

    // Iron Guard: attack cooldown is 3× infantry (3000ms at 10 teeth)
    const ironAttackCooldown = (unit.size / 1.2) * 300;

    let nearestUnitTarget: UnitState | null = null;
    // Squared throughout: these are only ever compared, never used as a length.
    let nearestDist2 = 300 * 300;
    let nearestGearX = 0;
    let nearestGearY = 0;
    let nearestGearDist2 = Infinity;
    let hasGearTarget = false;

    for (const [, other] of allUnits) {
      if (other.owner === unit.owner) continue;
      if (other.reachedBase) continue;
      // Frontal attack only: only engage enemies directly ahead
      if (!isInFront(unit, other.x, playerRight)) continue;
      const d2 = sqrDist(unit.x, unit.y, other.x, other.y);
      if (d2 < nearestDist2) {
        nearestDist2 = d2;
        nearestUnitTarget = other;
      }
    }

    for (const [, gear] of allGears) {
      if (gear.owner === unit.owner) continue;
      if (gear.hp <= 0 || gear.isBurntOut) continue; // never chase a dead or burnt-out gear
      if (!isInFront(unit, gear.x, playerRight)) continue;
      if (!gearInLane(gear.y)) continue;
      const d2 = sqrDist(unit.x, unit.y, gear.x, gear.y);
      if (d2 < nearestGearDist2) {
        nearestGearDist2 = d2;
        nearestGearX = gear.x;
        nearestGearY = gear.y;
        hasGearTarget = true;
      }
    }

    if (nearestUnitTarget) {
      const dx = nearestUnitTarget.x - unit.x;
      const dy = nearestUnitTarget.y - unit.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      const contactDist = unit.size + nearestUnitTarget.size + MELEE_CONTACT_DIST;

      if (d <= contactDist) {
        unit.behaviorState = 'attacking';
        unit.inCombat = true;
        unit.vx = 0;
        unit.vy = 0;

        if (now - unit.lastAttackTime > ironAttackCooldown) {
          const dmg = computeDamage(unit.type, nearestUnitTarget, unit.baseDamage);
          nearestUnitTarget.hp -= dmg;
          unit.lastAttackTime = now;
          this.eventBus.emit('unit:damaged', {
            unitId: nearestUnitTarget.id,
            damage: dmg,
            x: nearestUnitTarget.x,
            y: nearestUnitTarget.y,
          });
          // High impulse: push target back in the attack direction
          const pushImpulse = unit.speed * 4 * direction;
          nearestUnitTarget.vx += pushImpulse;
          // Small perpendicular scatter
          nearestUnitTarget.vy += (Math.random() - 0.5) * unit.speed * 1.5;

          if (nearestUnitTarget.hp <= 0) {
            nearestUnitTarget.hp = 0;
          }
        }
      } else {
        unit.behaviorState = 'marching';
        unit.inCombat = false;
        const nx = dx / d;
        const ny = dy / d;
        unit.vx = nx * effectiveSpeed;
        unit.vy = ny * effectiveSpeed;
      }
    } else if (hasGearTarget && nearestGearDist2 < 400 * 400) {
      const dx = nearestGearX - unit.x;
      const dy = nearestGearY - unit.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 0.1) {
        unit.behaviorState = 'marching';
        unit.inCombat = false;
        unit.vx = (dx / d) * effectiveSpeed;
        unit.vy = (dy / d) * effectiveSpeed;
      }
    } else {
      unit.vx = direction * effectiveSpeed;
      unit.vy = 0;
      unit.behaviorState = 'marching';
      unit.inCombat = false;
    }
  }

  private updateAetherPhantom(
    unit: UnitState,
    deltaSec: number,
    now: number,
    allUnits: Map<string, UnitState>,
  ): void {
    const direction = marchDirection(unit.owner, this.playerRight);
    const effectiveSpeed = unit.speed * (unit.slowFactor ?? 1);

    // Always march forward fast (passes through enemy units)
    unit.vx = direction * effectiveSpeed;
    unit.vy = 0;
    unit.behaviorState = 'marching';
    unit.inCombat = false;

    // While overlapping enemy units: deal damage (phantom phases through but burns on contact)
    // Phantom deals more damage to enemies than it takes — it's a glass-cannon pasthrough unit
    for (const [, other] of allUnits) {
      if (other.owner === unit.owner) continue;
      if (other.reachedBase) continue;
      const d = distance(unit.x, unit.y, other.x, other.y);
      const contactDist = unit.size + other.size;
      if (d < contactDist) {
        // Phantom deals damage proportional to overlap intensity
        const overlapFraction = 1 - d / contactDist;
        const enemyDmg = computeDamage(unit.type, other, unit.baseDamage * 1.8 * deltaSec * overlapFraction);
        const selfDmg   = computeDamage(other.type, unit, unit.baseDamage * 0.8 * deltaSec * overlapFraction);
        other.hp -= enemyDmg;
        unit.hp  -= selfDmg;

        if (enemyDmg > 0.1) {
          this.eventBus.emit('unit:damaged', { unitId: other.id, damage: enemyDmg, x: other.x, y: other.y });
        }
        if (other.hp <= 0) other.hp = 0;
        if (unit.hp <= 0) unit.hp = 0;
      }
    }
  }

  private updateCrystalSentinel(
    unit: UnitState,
    deltaSec: number,
    now: number,
    _projectileSystem: ProjectileSystem,
    allUnits: Map<string, UnitState>,
    allGears: ReturnType<World['getAllGears']>,
  ): void {
    const effectiveSpeed = unit.speed * (unit.slowFactor ?? 1);

    // Find nearest enemy unit or gear in front (ranged — can target outside lane)
    let targetX = -1;
    let targetY = -1;
    let targetDist = Infinity;

    for (const [, other] of allUnits) {
      if (other.owner === unit.owner) continue;
      if (other.reachedBase) continue;
      if (!isInFront(unit, other.x, this.playerRight)) continue;
      const d = distance(unit.x, unit.y, other.x, other.y);
      if (d < SENTINEL_ATTACK_RANGE && d < targetDist) {
        targetDist = d;
        targetX = other.x;
        targetY = other.y;
      }
    }

    if (targetX < 0) {
      for (const [, gear] of allGears) {
        if (gear.owner === unit.owner) continue;
        if (!isInFront(unit, gear.x, this.playerRight)) continue;
        const d = distance(unit.x, unit.y, gear.x, gear.y);
        if (d < SENTINEL_ATTACK_RANGE && d < targetDist) {
          targetDist = d;
          targetX = gear.x;
          targetY = gear.y;
        }
      }
    }

    if (targetX >= 0) {
      if (targetDist <= unit.attackRange) {
        unit.vx = 0;
        unit.vy = 0;
        unit.behaviorState = 'firing';
        unit.inCombat = true;

        // Fires a cold beam every 800ms — lower damage than artillery but leaves a lasting cold zone
        if (now - unit.lastAttackTime > 800) {
          // Direct area damage around target (lower than artillery)
          const rawBeamDmg = unit.baseDamage * 0.6;
          for (const [, other] of allUnits) {
            if (other.owner === unit.owner) continue;
            if (other.reachedBase) continue;
            const d = distance(other.x, other.y, targetX, targetY);
            if (d < COLD_ZONE_RADIUS * 0.8) {
              const beamDmg = computeDamage(unit.type, other, rawBeamDmg);
              other.hp -= beamDmg;
              this.eventBus.emit('unit:damaged', { unitId: other.id, damage: beamDmg, x: other.x, y: other.y });
              if (other.hp <= 0) other.hp = 0;
            }
          }

          // Shield nearby allies against incoming damage while the sentinel is active
          for (const [, ally] of allUnits) {
            if (ally.owner !== unit.owner) continue;
            if (ally.reachedBase) continue;
            const d = distance(ally.x, ally.y, unit.x, unit.y);
            if (d < SHIELD_AURA_RADIUS) {
              ally.shieldTimer = SHIELD_AURA_TIMER;
              ally.shieldFactor = SHIELD_AURA_FACTOR;
            }
          }

          // Create or refresh a cold zone at the target
          this.createColdZone(targetX, targetY, COLD_ZONE_RADIUS, unit.owner, now);

          // Emit cold beam visual event
          this.eventBus.emit('cold_beam:fired', {
            owner: unit.owner,
            srcX: unit.x,
            srcY: unit.y,
            dstX: targetX,
            dstY: targetY,
          });
          unit.lastAttackTime = now;
        }
      } else {
        const dx = targetX - unit.x;
        const dy = targetY - unit.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        unit.vx = (dx / d) * effectiveSpeed;
        unit.vy = (dy / d) * effectiveSpeed;
        unit.behaviorState = 'marching';
        unit.inCombat = false;
      }
    } else {
      this.marchForward(unit, deltaSec);
      unit.inCombat = false;
    }
  }

  // ─── Cold zone helpers ───────────────────────────────────────────────────

  /** Create a cold zone at (x,y). If a zone already significantly overlaps, refresh it instead. */
  private createColdZone(x: number, y: number, radius: number, owner: 'player' | 'ai', now: number): void {
    const nowSec = now * 0.001;
    const existing = this.coldZones.find(z => {
      const d = distance(z.x, z.y, x, y);
      return d < z.radius * 0.6; // significant overlap — don't stack
    });

    if (existing) {
      // Refresh existing zone
      existing.endTime = nowSec + COLD_ZONE_DURATION;
      return;
    }

    const id = nextColdZoneId();
    this.coldZones.push({ id, x, y, radius, endTime: nowSec + COLD_ZONE_DURATION, owner });
    this.eventBus.emit('cold_zone:created', { id, x, y, radius });
  }

  /** Process cold zones: expire old ones, apply slow to units, apply friction to gears. */
  private updateColdZones(
    now: number,
    allUnits: Map<string, UnitState>,
    allGears: ReturnType<World['getAllGears']>,
  ): void {
    const nowSec = now * 0.001;

    // Remove expired zones
    const before = this.coldZones.length;
    this.coldZones = this.coldZones.filter(z => {
      if (z.endTime < nowSec) {
        this.eventBus.emit('cold_zone:expired', { id: z.id });
        return false;
      }
      return true;
    });

    // Apply slow to enemy units in cold zones
    for (const [, unit] of allUnits) {
      if (unit.reachedBase) continue;
      for (const zone of this.coldZones) {
        if (zone.owner === unit.owner) continue; // only affects enemies
        const d = distance(unit.x, unit.y, zone.x, zone.y);
        if (d < zone.radius) {
          unit.slowTimer = 0.25; // keep refreshing as long as in zone
          unit.slowFactor = COLD_ZONE_SLOW_FACTOR;
          break;
        }
      }
    }

    // Apply/remove cold friction on enemy gears in cold zones
    const gearsInZone = new Set<string>();
    for (const [gearId, gear] of allGears) {
      for (const zone of this.coldZones) {
        if (zone.owner === gear.owner) continue;
        const d = distance(gear.x, gear.y, zone.x, zone.y);
        if (d < zone.radius + gearRadius(gear.teeth)) {
          gearsInZone.add(gearId);
          break;
        }
      }
    }

    for (const gearId of gearsInZone) {
      if (!this.gearsWithColdFriction.has(gearId)) {
        const gear = allGears.get(gearId);
        if (gear) {
          gear.frictionLoad = (gear.frictionLoad ?? 0) + COLD_GEAR_FRICTION;
          if (this.world) this.world.updateGear(gear);
          this.gearsWithColdFriction.add(gearId);
        }
      }
    }

    for (const gearId of this.gearsWithColdFriction) {
      if (!gearsInZone.has(gearId)) {
        const gear = allGears.get(gearId);
        if (gear) {
          gear.frictionLoad = Math.max(0, (gear.frictionLoad ?? 0) - COLD_GEAR_FRICTION);
          if (this.world) this.world.updateGear(gear);
        }
        this.gearsWithColdFriction.delete(gearId);
      }
    }
  }

  // ─── Physics helpers ────────────────────────────────────────────────────

  private resolveUnitCollisions(allUnits: Map<string, UnitState>): void {
    const unitArray = Array.from(allUnits.values()).filter(u => !u.reachedBase && !u.attachedGearId);

    for (let i = 0; i < unitArray.length; i++) {
      const a = unitArray[i];
      for (let j = i + 1; j < unitArray.length; j++) {
        const b = unitArray[j];

        // Aether phantom skips collision with enemy units (but collides with friendly)
        if (a.type === 'aether_phantom' && a.owner !== b.owner) continue;
        if (b.type === 'aether_phantom' && b.owner !== a.owner) continue;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const minDist = a.size + b.size;

        if (d < minDist && d > 0.01) {
          const overlap = minDist - d;
          const nx = dx / d;
          const ny = dy / d;
          const totalMass = a.mass + b.mass;

          // Push proportional to inverse mass
          const pushA = overlap * (b.mass / totalMass);
          const pushB = overlap * (a.mass / totalMass);

          a.x -= nx * pushA;
          a.y -= ny * pushA;
          b.x += nx * pushB;
          b.y += ny * pushB;

          // Re-clamp
          a.x = Math.max(0, Math.min(WORLD_WIDTH, a.x));
          a.y = Math.max(LANE_Y_MIN, Math.min(LANE_Y_MAX, a.y));
          b.x = Math.max(0, Math.min(WORLD_WIDTH, b.x));
          b.y = Math.max(LANE_Y_MIN, Math.min(LANE_Y_MAX, b.y));
        }
      }
    }
  }

  private triggerIronGuardExplosion(
    unit: UnitState,
    allUnits: Map<string, UnitState>,
    allGears: ReturnType<World['getAllGears']>,
  ): void {
    const radius = unit.size * 3;
    const damage = unit.baseDamage * 4;

    // Damage all units within radius (both sides)
    for (const [, other] of allUnits) {
      if (other.id === unit.id) continue;
      if (other.reachedBase) continue;
      const d = distance(unit.x, unit.y, other.x, other.y);
      if (d <= radius) {
        const dealt = computeDamage(unit.type, other, damage);
        other.hp -= dealt;
        this.eventBus.emit('unit:damaged', {
          unitId: other.id,
          damage: dealt,
          x: other.x,
          y: other.y,
        });
        if (other.hp <= 0) {
          other.hp = 0;
        }
      }
    }

    // Damage all gears within radius
    for (const [, gear] of allGears) {
      const d = distance(unit.x, unit.y, gear.x, gear.y);
      if (d <= radius) {
        const wasAlive = gear.hp > 0;
        gear.hp = Math.max(0, gear.hp - damage);
        gear.crackLevel = crackLevelFor(gear.hp, gear.maxHp);
        if (this.world) this.world.updateGear(gear);
        this.eventBus.emit('gear:damaged', {
          gearId: gear.id,
          damage,
          remainingHp: gear.hp,
          source: 'combat',
        });
        if (wasAlive && gear.hp <= 0) {
          this.eventBus.emit('gear:destroyed', { gearId: gear.id, owner: gear.owner, cause: 'combat' });
        }
      }
    }
  }

  // ─── Accessor methods ────────────────────────────────────────────────────

  getUnit(unitId: string): UnitState | undefined {
    return this.units.get(unitId);
  }

  getAllUnits(): Map<string, UnitState> {
    return this.units;
  }

  /** Get units in the lane band (all units for compatibility; no discrete lane index) */
  getUnitsInLane(_lane: number, owner?: 'player' | 'ai'): UnitState[] {
    return Array.from(this.units.values()).filter(
      u => !owner || u.owner === owner,
    );
  }

  updateUnit(unit: UnitState): void {
    this.units.set(unit.id, unit);
  }

  removeUnit(unitId: string): void {
    this.units.delete(unitId);
  }

  /** Elite unlock tech per core spawner base type. */
  private static readonly ELITE_TECH: Record<'infantry' | 'artillery' | 'cavalry', string> = {
    infantry: 'elite_infantry_unlock',
    artillery: 'elite_artillery_unlock',
    cavalry: 'elite_cavalry_unlock',
  };

  /**
   * What infantry_spawner/artillery_spawner/cavalry_spawner actually produce
   * this rotation, once chain composition and research are factored in. Any
   * other spawner type (including wrench_spawner) passes its base type
   * straight through -- only the core three have an upgrade path.
   */
  private resolveCoreSpawnerUnitType(
    gear: GearState,
    baseUnitType: UnitType,
    owner: 'player' | 'ai',
  ): UnitType {
    if (baseUnitType !== 'infantry' && baseUnitType !== 'artillery' && baseUnitType !== 'cavalry') {
      return baseUnitType;
    }
    if (!this.rotationPhysics || !this.techSystem) return baseUnitType;

    const chain = this.rotationPhysics.getChainForGear(gear.id);
    const chainSize = chain?.gearIds.length ?? 1;
    const hasConverter = chain?.hasConverter ?? false;

    const eliteResearched = this.techSystem.isResearched(UnitSystem.ELITE_TECH[baseUnitType], owner);
    const mixedUnlocked =
      this.techSystem.isResearched('unlock_infantry', owner) &&
      this.techSystem.isResearched('unlock_artillery_spawner', owner) &&
      this.techSystem.isResearched('unlock_cavalry_spawner', owner);

    return getChainUnitType(baseUnitType, chainSize, eliteResearched, mixedUnlocked, hasConverter, COMBO_CHAIN_MIN_GEARS);
  }

  /**
   * Try to spawn a unit when a spawner gear completes a rotation.
   * Each spawner gear type directly spawns its corresponding unit type.
   */
  private trySpawnUnitFromGear(gearId: string, owner: 'player' | 'ai'): void {
    if (!this.world || !this.economySystem) return;

    const gear = this.world.getGear(gearId);
    if (!gear) return;

    // Map spawner gear types to unit types
    const spawnerMap: { [key: string]: UnitType } = {
      infantry_spawner: 'infantry',
      artillery_spawner: 'artillery',
      cavalry_spawner: 'cavalry',
      wrench_spawner: 'wrench',
      iron_guard_spawner: 'iron_guard',
      crystal_sentinel_spawner: 'crystal_sentinel',
      aether_phantom_spawner: 'aether_phantom',
    };

    const baseUnitType = spawnerMap[gear.type];
    if (!baseUnitType) return; // Not a spawner gear

    // The three core spawners can produce something other than their base
    // type -- an elite upgrade or the generalist "mixed" -- depending on
    // the chain they sit on and what the owner has researched. See
    // getChainUnitType for the exact conditions.
    const unitType = this.resolveCoreSpawnerUnitType(gear, baseUnitType, owner);

    const def = UNIT_DEFINITIONS[unitType];
    if (!def) return;

    // Scale cost by gear size
    const scaled = computeScaledStats(def, gear.teeth, unitType);
    const scaledCost = scaled.costAmount;

    // Short display names per unit type
    const unitLabels: Record<string, string> = {
      infantry: 'Infantry',
      artillery: 'Artillery',
      cavalry: 'Cavalry',
      mixed: 'Mixed',
      elite_infantry: 'Elite Infantry',
      elite_artillery: 'Elite Artillery',
      elite_cavalry: 'Elite Cavalry',
      wrench: 'Wrench',
      iron_guard: 'Iron Guard',
      crystal_sentinel: 'Sentinel',
      aether_phantom: 'Phantom',
    };
    const label = unitLabels[unitType] ?? unitType;

    // Check if owner has sufficient resources — emit failure message
    const resources = this.economySystem.getResources(owner);
    const insufficient =
      (def.costResource === 'gold' && resources.gold < scaledCost) ||
      (def.costResource === 'iron' && resources.iron < scaledCost) ||
      (def.costResource === 'crystal' && resources.crystal < scaledCost) ||
      (def.costResource === 'aether' && resources.aether < scaledCost);

    if (insufficient) {
      this.eventBus.emit('gear:rotation_result', {
        gearId, owner,
        text: `No ${def.costResource}!`,
        color: 0xff2244,
      });
      return;
    }

    // Deduct scaled cost
    if (def.costResource === 'gold') {
      this.economySystem.spendGold(owner, scaledCost);
    } else if (def.costResource === 'iron') {
      this.economySystem.spendResource(owner, 'iron', scaledCost);
    } else if (def.costResource === 'crystal') {
      this.economySystem.spendResource(owner, 'crystal', scaledCost);
    } else if (def.costResource === 'aether') {
      this.economySystem.spendResource(owner, 'aether', scaledCost);
    }

    // Spawn exactly 1 unit scaled to the gear's teeth
    this.spawnSingleFromGear(owner, unitType, gear.teeth);
    this.eventBus.emit('gear:rotation_result', {
      gearId, owner,
      text: `${label}!`,
      color: 0xffffff,
    });
  }

  destroy(): void {
    this.eventBus.off('gear:full_rotation', this.onGearFullRotation);
    this.eventBus.off('unit:died', this.onUnitDied);
    this.coldZones = [];
    this.gearsWithColdFriction.clear();
  }
}
