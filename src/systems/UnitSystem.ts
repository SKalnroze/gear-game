import { UnitState, UnitType, UnitDefinition } from '../types/unit.types';
import { EventBus } from './EventBus';
import { UNIT_DEFINITIONS } from '../constants/unit.constants';
import { UNITS_PER_WAVE, ENGAGE_DISTANCE, ARMORED_DAMAGE_RATE } from '../constants/balance.constants';
import { DEFAULT_TEETH, gearRadius } from '../constants/gear.constants';
import {
  WORLD_WIDTH, LANE_Y_MIN, LANE_Y_MAX,
  PLAYER_ZONE_MAX_X, AI_ZONE_MIN_X,
  PLAYER_BASE_X, AI_BASE_X,
} from '../constants/world.constants';
import { randomInt } from '../utils/MathUtils';
import { World } from '../world/World';
import { EconomySystem } from './EconomySystem';
import { GearType } from '../types/gear.types';
import { ProjectileSystem } from './ProjectileSystem';
import { distance } from '../utils/MathUtils';

let _nextUnitId = 1;
function nextUnitId(): string {
  return `unit_${_nextUnitId++}`;
}

const UNIT_SPACING = 40; // px between units in same wave

/** Charge acceleration for cavalry (px/s²) */
const CAVALRY_CHARGE_ACCEL = 200;
/** Crystal sentinel search range */
const SENTINEL_ATTACK_RANGE = 500;
/** Infantry/Iron Guard melee range — used when target is within contact */
const MELEE_CONTACT_DIST = 2; // extra beyond size+size
/** Cavalry retreat duration (seconds) */
const CAVALRY_RETREAT_DURATION = 3.5;

/**
 * Mass multipliers by unit type
 */
const TYPE_MASS_MULT: Partial<Record<UnitType, number>> = {
  iron_guard: 3,
  cavalry: 0.8,
  aether_phantom: 0.5,
  artillery: 1.5,
  crystal_sentinel: 1.0,
  infantry: 1.0,
};

/**
 * Compute per-unit stats scaled from gear teeth count.
 *
 * Base values in UNIT_DEFINITIONS are calibrated at DEFAULT_TEETH (10).
 * Scaling rules:
 *   size (visual radius)  = teeth × 1.2              — matches gear silhouette
 *   hp                    ∝ teeth^1.5                — bigger = tankier
 *   speed                 ∝ teeth^(-0.5)             — bigger = slower (min 15 px/s)
 *   baseDamage / damage   ∝ teeth^1.2                — bigger hits harder
 *   attackRange           ∝ teeth^0.8  × ENGAGE_BASE — bigger reaches further
 *   mass                  ∝ teeth^2                  — quadratic (area-based)
 *   costAmount            ∝ teeth^1.3                — larger units cost more
 */
function computeScaledStats(def: UnitDefinition, teeth: number, unitType: UnitType): {
  hp: number; speed: number; baseDamage: number; damage: number;
  size: number; attackRange: number; mass: number; costAmount: number;
} {
  const s = teeth / DEFAULT_TEETH;
  const baseMass = Math.max(1, Math.round(10 * s * s));
  const massMult = TYPE_MASS_MULT[unitType] ?? 1.0;
  return {
    hp:          Math.max(1, Math.round(def.hp          * Math.pow(s, 1.5))),
    speed:       Math.max(15, Math.round(def.speed      * Math.pow(s, -0.5))),
    baseDamage:  Math.max(1, Math.round(def.baseDamage  * Math.pow(s, 1.2))),
    damage:      Math.max(1, Math.round(def.damage      * Math.pow(s, 1.2))),
    size:        Math.max(4, Math.round(teeth * 1.2)),
    // Artillery: stop-and-fire range = 5 unit diameters (10 × size)
    // Crystal sentinel: ranged, stops ~3 diameters away (6 × size)
    attackRange: (unitType === 'artillery' || unitType === 'elite_artillery')
      ? Math.max(4, Math.round(teeth * 1.2)) * 10
      : (unitType === 'crystal_sentinel')
        ? Math.max(4, Math.round(teeth * 1.2)) * 6
        : Math.max(ENGAGE_DISTANCE, Math.round(ENGAGE_DISTANCE * Math.pow(s, 0.8))),
    mass:        Math.max(1, Math.round(baseMass * massMult)),
    costAmount:  Math.max(1, Math.round(def.costAmount  * Math.pow(s, 1.3))),
  };
}

/** Returns true if targetX is in front of the unit (the direction it naturally marches). */
function isInFront(unit: UnitState, targetX: number): boolean {
  return unit.owner === 'player' ? targetX >= unit.x : targetX <= unit.x;
}

/** Returns true if a gear at gearY overlaps the lane band (melee reachability). */
function gearInLane(gearY: number): boolean {
  return gearY >= LANE_Y_MIN && gearY <= LANE_Y_MAX;
}

/** Build initial UnitState fields for new fields. */
function newPhysicsFields(unitType: UnitType): {
  vx: number; vy: number; behaviorState: UnitState['behaviorState'];
  lastAttackTime: number; chargeAccum: number; retreatTimer: number;
  slowTimer: number; slowFactor: number;
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

  // Tech modifiers
  private unitHpBonuses: Map<UnitType, number> = new Map();
  private unitSpeedBonuses: Map<UnitType, number> = new Map();
  private unitDamageBonuses: Map<UnitType, number> = new Map();
  private unlockedUnits: Set<UnitType> = new Set(['infantry']);

  private readonly onUnitWaveTriggered = ({ owner, unitType, lane }: { owner: 'player' | 'ai'; unitType: UnitType; lane: number }) => {
    this.spawnWave(owner, unitType, lane);
  };

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

    this.eventBus.on('unit:wave_triggered', this.onUnitWaveTriggered);
    this.eventBus.on('gear:full_rotation', this.onGearFullRotation);
    this.eventBus.on('unit:died', this.onUnitDied);
  }

  setWorld(world: World): void {
    this.world = world;
  }

  setEconomySystem(economySystem: EconomySystem): void {
    this.economySystem = economySystem;
  }

  isUnitTypeUnlocked(type: UnitType): boolean {
    const alwaysUnlocked: UnitType[] = ['infantry', 'mixed'];
    if (alwaysUnlocked.includes(type)) return true;
    return this.unlockedUnits.has(type);
  }

  unlockUnitType(type: UnitType): void {
    this.unlockedUnits.add(type);
  }

  applyHpBonus(unitType: UnitType, pct: number): void {
    this.unitHpBonuses.set(unitType, (this.unitHpBonuses.get(unitType) ?? 0) + pct);
  }

  applySpeedBonus(unitType: UnitType, pct: number): void {
    this.unitSpeedBonuses.set(unitType, (this.unitSpeedBonuses.get(unitType) ?? 0) + pct);
  }

  applyDamageBonus(unitType: UnitType, pct: number): void {
    this.unitDamageBonuses.set(unitType, (this.unitDamageBonuses.get(unitType) ?? 0) + pct);
  }

  /**
   * Spawn a single unit from a gear rotation. Stats are scaled by gear teeth.
   * Called by trySpawnUnitFromGear — 1 unit per spin.
   */
  spawnSingleFromGear(owner: 'player' | 'ai', unitType: UnitType, teeth: number): void {
    const def = UNIT_DEFINITIONS[unitType];
    const scaled = computeScaledStats(def, teeth, unitType);

    const hpBonus = this.unitHpBonuses.get(unitType) ?? 0;
    const speedBonus = this.unitSpeedBonuses.get(unitType) ?? 0;
    const dmgBonus = this.unitDamageBonuses.get(unitType) ?? 0;
    const frictionVal = def.frictionValue ?? 0;

    const startX = owner === 'player' ? PLAYER_ZONE_MAX_X : AI_ZONE_MIN_X;
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
   * Spawn a wave of units (manual wave button). Uses DEFAULT_TEETH for stat scaling.
   * Player units spawn at the right edge of player zone; AI units at the left edge of AI zone.
   */
  spawnWave(owner: 'player' | 'ai', unitType: UnitType, _lane: number): void {
    const def = UNIT_DEFINITIONS[unitType];
    const scaled = computeScaledStats(def, DEFAULT_TEETH, unitType);
    const direction = owner === 'player' ? 1 : -1;
    const startX = owner === 'player' ? PLAYER_ZONE_MAX_X : AI_ZONE_MIN_X;

    const hpBonus = this.unitHpBonuses.get(unitType) ?? 0;
    const speedBonus = this.unitSpeedBonuses.get(unitType) ?? 0;
    const dmgBonus = this.unitDamageBonuses.get(unitType) ?? 0;
    const frictionVal = def.frictionValue ?? 0;

    for (let i = 0; i < UNITS_PER_WAVE; i++) {
      const margin = 20;
      const y = randomInt(LANE_Y_MIN + margin, LANE_Y_MAX - margin);
      const offsetX = direction * i * UNIT_SPACING * -1;

      const hp = Math.round(scaled.hp * (1 + hpBonus));
      const unit: UnitState = {
        id: nextUnitId(),
        type: unitType,
        hp,
        maxHp: hp,
        x: startX + offsetX,
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
      }
      this.eventBus.emit('unit:died', { unitId: unit.id, owner: unit.owner });
    }

    // 5. Emit unit:moved for all living units
    for (const [, unit] of allUnits) {
      if (!unit.reachedBase) {
        this.eventBus.emit('unit:moved', { unitId: unit.id, x: unit.x, y: unit.y });
      }

      // Check if unit reached the enemy base (guard !reachedBase to prevent repeat fires)
      if (!unit.reachedBase && unit.owner === 'player' && unit.x >= AI_BASE_X) {
        unit.reachedBase = true;
        this.eventBus.emit('unit:reached_base', { unit: { ...unit } });
      } else if (!unit.reachedBase && unit.owner === 'ai' && unit.x <= PLAYER_BASE_X) {
        unit.reachedBase = true;
        this.eventBus.emit('unit:reached_base', { unit: { ...unit } });
      }
    }
  }

  // ─── Behavior update methods ────────────────────────────────────────────

  private marchForward(unit: UnitState, deltaSec: number): void {
    const direction = unit.owner === 'player' ? 1 : -1;
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
    const direction = unit.owner === 'player' ? 1 : -1;
    const effectiveSpeed = unit.speed * (unit.slowFactor ?? 1);

    // Find nearest enemy unit or enemy gear within 300px
    let nearestDist = 300;
    let nearestUnitTarget: UnitState | null = null;
    let nearestGearX = 0;
    let nearestGearY = 0;
    let nearestGearDist = Infinity;
    let hasGearTarget = false;

    for (const [, other] of allUnits) {
      if (other.owner === unit.owner) continue;
      if (other.reachedBase) continue;
      if (!isInFront(unit, other.x)) continue; // don't chase targets behind
      const d = distance(unit.x, unit.y, other.x, other.y);
      if (d < nearestDist) {
        nearestDist = d;
        nearestUnitTarget = other;
      }
    }

    // Also find nearest reachable enemy gear (must be in lane for melee)
    for (const [, gear] of allGears) {
      if (gear.owner === unit.owner) continue;
      if (!isInFront(unit, gear.x)) continue; // don't chase gears behind
      if (!gearInLane(gear.y)) continue; // melee can't reach gears outside lane
      const d = distance(unit.x, unit.y, gear.x, gear.y);
      if (d < nearestGearDist) {
        nearestGearDist = d;
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

        if (now - unit.lastAttackTime > 400) {
          nearestUnitTarget.hp -= unit.baseDamage;
          unit.lastAttackTime = now;
          this.eventBus.emit('unit:damaged', {
            unitId: nearestUnitTarget.id,
            damage: unit.baseDamage,
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
    } else if (hasGearTarget && nearestGearDist < 400) {
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
    const direction = unit.owner === 'player' ? 1 : -1;
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
      u => u.owner !== unit.owner && !u.reachedBase && isInFront(unit, u.x),
    );
    const hasForwardGear = Array.from(allGears.values()).some(
      g => g.owner !== unit.owner && isInFront(unit, g.x) && gearInLane(g.y),
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
        const chargeDmg = unit.baseDamage * (1 + unit.chargeAccum / 100);
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
        const chargeDmg = unit.baseDamage * (1 + unit.chargeAccum / 100);
        gear.hp = Math.max(0, gear.hp - chargeDmg);
        gear.crackLevel = Math.min(4, Math.floor((1 - gear.hp / gear.maxHp) * 5));
        if (this.world) this.world.updateGear(gear);
        this.eventBus.emit('gear:damaged', {
          gearId: gear.id,
          damage: chargeDmg,
          remainingHp: gear.hp,
          source: 'combat',
        });
        if (gear.hp <= 0) {
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
    const direction = unit.owner === 'player' ? 1 : -1;
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
      if (!isInFront(unit, other.x)) continue; // don't fire backward
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
        if (!isInFront(unit, gear.x)) continue;
        const d = distance(unit.x, unit.y, gear.x, gear.y);
        if (d < artilleryDetectRange && d < targetDist) {
          targetDist = d;
          targetX = gear.x;
          targetY = gear.y;
        }
      }
    }

    if (targetX >= 0) {
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
      // Default march
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
    // Same as infantry but slower (speed already low due to type definition)
    const effectiveSpeed = unit.speed * 0.7 * (unit.slowFactor ?? 1); // extra slow
    const direction = unit.owner === 'player' ? 1 : -1;

    let nearestUnitTarget: UnitState | null = null;
    let nearestDist = 300;
    let nearestGearX = 0;
    let nearestGearY = 0;
    let nearestGearDist = Infinity;
    let hasGearTarget = false;

    for (const [, other] of allUnits) {
      if (other.owner === unit.owner) continue;
      if (other.reachedBase) continue;
      if (!isInFront(unit, other.x)) continue; // don't chase targets behind
      const d = distance(unit.x, unit.y, other.x, other.y);
      if (d < nearestDist) {
        nearestDist = d;
        nearestUnitTarget = other;
      }
    }

    for (const [, gear] of allGears) {
      if (gear.owner === unit.owner) continue;
      if (!isInFront(unit, gear.x)) continue; // don't chase gears behind
      if (!gearInLane(gear.y)) continue; // melee can't reach gears outside lane
      const d = distance(unit.x, unit.y, gear.x, gear.y);
      if (d < nearestGearDist) {
        nearestGearDist = d;
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

        if (now - unit.lastAttackTime > 400) {
          nearestUnitTarget.hp -= unit.baseDamage;
          unit.lastAttackTime = now;
          this.eventBus.emit('unit:damaged', {
            unitId: nearestUnitTarget.id,
            damage: unit.baseDamage,
            x: nearestUnitTarget.x,
            y: nearestUnitTarget.y,
          });
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
    } else if (hasGearTarget && nearestGearDist < 400) {
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
    const direction = unit.owner === 'player' ? 1 : -1;
    const effectiveSpeed = unit.speed * (unit.slowFactor ?? 1);

    // Always march forward fast
    unit.vx = direction * effectiveSpeed;
    unit.vy = 0;
    unit.behaviorState = 'marching';
    unit.inCombat = false;

    // While overlapping enemy units: apply mutual damage (baseDamage * 0.3 * deltaSec each)
    for (const [, other] of allUnits) {
      if (other.owner === unit.owner) continue;
      if (other.reachedBase) continue;
      if (!isInFront(unit, other.x)) continue; // only damage enemies in path (in front)
      const d = distance(unit.x, unit.y, other.x, other.y);
      const contactDist = unit.size + other.size;
      if (d < contactDist) {
        const dmg = unit.baseDamage * 0.3 * deltaSec;
        other.hp -= dmg;
        unit.hp -= dmg;

        if (dmg > 0.1) {
          this.eventBus.emit('unit:damaged', { unitId: other.id, damage: dmg, x: other.x, y: other.y });
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
    projectileSystem: ProjectileSystem,
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
      if (!isInFront(unit, other.x)) continue;
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
        if (!isInFront(unit, gear.x)) continue;
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

        if (now - unit.lastAttackTime > 1500) {
          projectileSystem.fireCrystalShard(unit, targetX, targetY, unit.baseDamage);
          this.eventBus.emit('projectile:fired', {
            id: 'shard',
            type: 'crystal_shard',
            owner: unit.owner,
            x: unit.x,
            y: unit.y,
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
        other.hp -= damage;
        this.eventBus.emit('unit:damaged', {
          unitId: other.id,
          damage,
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
        const prev = gear.hp;
        gear.hp = Math.max(0, gear.hp - damage);
        gear.crackLevel = Math.min(4, Math.floor((1 - gear.hp / gear.maxHp) * 5));
        if (this.world) this.world.updateGear(gear);
        this.eventBus.emit('gear:damaged', {
          gearId: gear.id,
          damage,
          remainingHp: gear.hp,
          source: 'combat',
        });
        if (gear.hp <= 0 && prev > 0) {
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
      iron_guard_spawner: 'iron_guard',
      crystal_sentinel_spawner: 'crystal_sentinel',
      aether_phantom_spawner: 'aether_phantom',
    };

    const unitType = spawnerMap[gear.type];
    if (!unitType) return; // Not a spawner gear

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
    this.eventBus.off('unit:wave_triggered', this.onUnitWaveTriggered);
    this.eventBus.off('gear:full_rotation', this.onGearFullRotation);
    this.eventBus.off('unit:died', this.onUnitDied);
  }
}
