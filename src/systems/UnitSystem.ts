import { UnitState, UnitType, UnitDefinition } from '../types/unit.types';
import type { GearState, GearType } from '../types/gear.types';
import { EventBus } from './EventBus';
import { UNIT_DEFINITIONS } from '../constants/unit.constants';
import { gearRadius, crackLevelFor, DEFAULT_TEETH } from '../constants/gear.constants';
import { WORLD_WIDTH, PLAY_Y_MIN, PLAY_Y_MAX, SPAWN_Y_MARGIN } from '../constants/world.constants';
import { randomInt } from '../utils/MathUtils';
import { World } from '../world/World';
import { EconomySystem } from './EconomySystem';
import { ProjectileSystem } from './ProjectileSystem';
import { distance, sqrDist, leadPosition } from '../utils/MathUtils';

/** Artillery shell flight time, seconds -- must match ProjectileSystem.fireArtilleryShell's fixed arc time. */
const ARTILLERY_SHELL_TRAVEL_TIME = 1.5;
import {
  computeScaledStats,
  isInFront,
  marchDirection,
  spawnX,
  hasReachedEnemyBase,
  computeAttackCooldown,
  computeChargeDamage,
} from './unit.utils';
import { computeDamage, getChainUnitType, UNIT_GEAR_DAMAGE_MULT } from '../constants/unit.constants';
import { UnitPhysicsWorld } from './UnitPhysicsWorld';
import { COMBO_CHAIN_MIN_GEARS, CAVALRY_CHARGE_SENSE_RANGE } from '../constants/balance.constants';
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

let _slimePuddleId = 1;
function nextSlimePuddleId(): string {
  return `puddle_${_slimePuddleId++}`;
}

/**
 * A slime's death puddle -- unlike a cold zone (enemy-only), it slows and
 * adds gear friction for BOTH sides, since the slime itself dealt no damage
 * and doesn't take sides on the way out.
 */
interface SlimePuddle {
  id: string;
  x: number;
  y: number;
  radius: number;
  endTime: number; // seconds (game time / 1000)
  slowFactor: number;
  gearFriction: number;
}


/** Charge acceleration for cavalry (px/s²) */
const CAVALRY_CHARGE_ACCEL = 200;
/** Crystal sentinel search range -- was 500 against a 72px firing range at
 * 10 teeth, a huge detect/fire gap that made it trek across most of the
 * gap in the open before it could use its kit ("area control, not the
 * front line"). Tightened to roughly 2x its own firing range instead. */
const SENTINEL_ATTACK_RANGE = 150;
/** Infantry/Iron Guard melee range — used when target is within contact */
const MELEE_CONTACT_DIST = 2; // extra beyond size+size
/** Cavalry retreat duration (seconds) */
const CAVALRY_RETREAT_DURATION = 3.5;
/** Crystal sentinel shield aura: radius around the sentinel and the incoming-damage multiplier it grants allies */
const SHIELD_AURA_RADIUS = 90;
const SHIELD_AURA_FACTOR = 0.8;
/** Refreshed every beam tick (800ms) while the sentinel is active; a bit longer so a brief gap doesn't drop it */
const SHIELD_AURA_TIMER = 1.2;

/** Saboteur: how far ahead it looks for an enemy gear to sabotage, how
 * often it can act, how much friction it adds, and how long that friction
 * lasts before decaying back out. */
const SABOTEUR_SEEK_RANGE = 400;
const SABOTEUR_ACTION_COOLDOWN_MS = 2000;
const SABOTEUR_FRICTION_AMOUNT = 90;
const SABOTEUR_FRICTION_DURATION_MS = 4000;

/** Raider: how far ahead it looks for a miner/converter to disable, how
 * often it can re-trigger, and how long the disable lasts. */
const RAIDER_SEEK_RANGE = 450;
const RAIDER_ACTION_COOLDOWN_MS = 2500;
const RAIDER_DISABLE_MS = 5000;
const RAIDER_TARGET_TYPES: ReadonlySet<GearType> = new Set([
  'iron_miner', 'crystal_miner', 'aether_miner',
  'iron_converter', 'crystal_converter', 'aether_converter',
]);


/** Build initial UnitState fields for new fields. */
function newPhysicsFields(unitType: UnitType): {
  vx: number; vy: number; knockbackVx: number; knockbackVy: number; behaviorState: UnitState['behaviorState'];
  lastAttackTime: number; chargeAccum: number; retreatTimer: number;
  slowTimer: number; slowFactor: number; shieldTimer: number; shieldFactor: number;
} {
  return {
    vx: 0,
    vy: 0,
    knockbackVx: 0,
    knockbackVy: 0,
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
  private physicsWorld: UnitPhysicsWorld = new UnitPhysicsWorld();
  private world: World | null = null;
  private economySystem: EconomySystem | null = null;
  private rotationPhysics: RotationPhysicsSystem | null = null;
  private techSystem: TechSystem | null = null;

  // Cold zone system (crystal sentinel)
  private coldZones: ColdZone[] = [];
  private gearsWithColdFriction: Set<string> = new Set();
  private slimePuddles: SlimePuddle[] = [];
  private gearsWithPuddleFriction: Set<string> = new Set();

  // Saboteur friction debuffs: additive, so each one must be individually
  // un-applied on expiry rather than reset to a computed total, the same
  // reasoning as the cold-zone/slime-puddle friction above.
  private saboteurDebuffs: { gearId: string; amount: number; expiresAt: number }[] = [];

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
    this.physicsWorld.removeUnit(unitId);
  };

  /**
   * Real radial knockback for every AoE explosion in the game (artillery
   * shells, mines -- ProjectileSystem/MinelayerSystem emit this; Iron
   * Guard's own death blast applies its knockback directly alongside its
   * damage pass instead, since it already walks the same per-unit loop).
   * Damage for these sources is handled by whichever system emitted the
   * event; this only adds the pushback that was previously missing.
   */
  private readonly onAoeExplosion = ({ x, y, radius }: { x: number; y: number; radius: number; owner: 'player' | 'ai' }) => {
    const EXPLOSION_IMPULSE = 350;
    for (const [id, unit] of this.units) {
      if (unit.reachedBase) continue;
      const dx = unit.x - x;
      const dy = unit.y - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > radius || d <= 0.01) continue;
      const kb = EXPLOSION_IMPULSE * (1 - d / radius);
      this.physicsWorld.applyImpulse(id, (dx / d) * kb, (dy / d) * kb);
    }
  };

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;

    this.eventBus.on('gear:full_rotation', this.onGearFullRotation);
    this.eventBus.on('unit:died', this.onUnitDied);
    this.eventBus.on('aoe:explosion', this.onAoeExplosion);
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
    const y = randomInt(PLAY_Y_MIN + SPAWN_Y_MARGIN + margin, PLAY_Y_MAX - SPAWN_Y_MARGIN - margin);

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
    this.physicsWorld.addUnit(unit);
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
      if (unit.attachedGearId) continue; // attached slime units don't march

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
        case 'slime':
          this.updateSlime(unit, deltaSec, allUnits, allGears);
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
        case 'crossbow':
          this.updateCrossbow(unit, deltaSec, now, allUnits, allGears);
          break;
        case 'sentry_unit':
          this.updateSentryUnit(unit, deltaSec, now, allGears);
          break;
        case 'sapper':
        case 'skirmish_diver':
          // Both reuse Infantry's movement/targeting wholesale -- their
          // identity is entirely in their stats and multipliers (see
          // UNIT_GEAR_DAMAGE_MULT and COUNTER_TABLE), not a bespoke behavior.
          this.updateInfantry(unit, deltaSec, now, allUnits, allGears);
          break;
        case 'saboteur':
          this.updateSaboteur(unit, deltaSec, now, allGears);
          break;
        case 'raider':
          this.updateRaider(unit, deltaSec, now, allGears);
          break;
        case 'field_medic':
          this.updateFieldMedic(unit, deltaSec, now, allUnits);
          break;
        default:
          // Default march
          this.marchForward(unit, deltaSec);
          break;
      }
    }

    // 1b. Update cold zones (crystal sentinel icy areas), slime puddles,
    // and expired saboteur friction debuffs.
    this.updateColdZones(now, allUnits, allGears);
    this.updateSlimePuddles(now, allUnits, allGears);
    this.updateSaboteurDebuffs(now);

    // 1c. Apply this frame's pending knockback as a real impulse on the
    // unit's rigidbody -- done after every unit's own behavior update so it
    // can't be clobbered by a not-yet-visited unit overwriting its own
    // vx/vy later in the same Map iteration. Unlike the pre-migration
    // merge-into-vx approach (overwritten the very next tick by the next
    // behavior update), a real impulse persists and decays over several
    // frames as the steering force pulls the unit back toward its intended
    // velocity -- genuine, visible pushback instead of a one-frame nudge.
    for (const [id, unit] of allUnits) {
      if (unit.knockbackVx !== 0 || unit.knockbackVy !== 0) {
        this.physicsWorld.applyImpulse(id, unit.knockbackVx, unit.knockbackVy);
        unit.knockbackVx = 0;
        unit.knockbackVy = 0;
      }
    }

    // 2-3. Real rigidbody step: steer every unit's body toward the velocity
    // its behavior computed this tick, let Matter integrate real
    // acceleration and resolve unit-unit collision natively, then sync the
    // resulting position/velocity back onto UnitState.
    this.physicsWorld.step(allUnits, deltaSec);

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
      } else if (unit.type === 'slime') {
        const def = UNIT_DEFINITIONS.slime;
        // Puddle size and slow strength scale with the size of the slime that
        // died -- a bigger (higher-teeth-spawner) slime leaves a bigger, stickier puddle.
        const sizeRatio = unit.size / (DEFAULT_TEETH * 1.2);
        this.createSlimePuddle(
          unit.x, unit.y,
          (def.puddleRadius ?? 50) * sizeRatio,
          Math.min(0.9, (def.puddleSlowFactor ?? 0.55) * sizeRatio),
          def.frictionValue ?? 20,
          now,
        );
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
      this.physicsWorld.removeUnit(unit.id);
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

  /**
   * Slime never stops to fight and never deals damage -- it exists to pile
   * up. It steers toward the nearest enemy unit/gear the same way infantry
   * does, but -- unlike infantry -- never halts at contact range to attack;
   * it just keeps pushing through, which is what lets a mass of them
   * physically clog the lane.
   */
  private updateSlime(
    unit: UnitState,
    deltaSec: number,
    allUnits: Map<string, UnitState>,
    allGears: ReturnType<World['getAllGears']>,
  ): void {
    const direction = marchDirection(unit.owner, this.playerRight);
    const effectiveSpeed = unit.speed * (unit.slowFactor ?? 1);

    let nearestDist2 = 300 * 300;
    let nearestUnitTarget: UnitState | null = null;
    for (const [, other] of allUnits) {
      if (other.owner === unit.owner) continue;
      if (other.reachedBase) continue;
      if (!isInFront(unit, other.x, this.playerRight)) continue;
      const d2 = sqrDist(unit.x, unit.y, other.x, other.y);
      if (d2 < nearestDist2) {
        nearestDist2 = d2;
        nearestUnitTarget = other;
      }
    }

    let nearestGearX = 0;
    let nearestGearY = 0;
    let nearestGearDist2 = Infinity;
    let hasGearTarget = false;
    if (!nearestUnitTarget) {
      for (const [, gear] of allGears) {
        if (gear.owner === unit.owner) continue;
        if (gear.hp <= 0 || gear.isBurntOut) continue;
        if (!isInFront(unit, gear.x, this.playerRight)) continue;
        const d2 = sqrDist(unit.x, unit.y, gear.x, gear.y);
        if (d2 < nearestGearDist2) {
          nearestGearDist2 = d2;
          nearestGearX = gear.x;
          nearestGearY = gear.y;
          hasGearTarget = true;
        }
      }
    }

    if (nearestUnitTarget) {
      const dx = nearestUnitTarget.x - unit.x;
      const dy = nearestUnitTarget.y - unit.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      unit.vx = (dx / d) * effectiveSpeed;
      unit.vy = (dy / d) * effectiveSpeed;
    } else if (hasGearTarget && nearestGearDist2 < 400 * 400) {
      const dx = nearestGearX - unit.x;
      const dy = nearestGearY - unit.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 0.1) {
        unit.vx = (dx / d) * effectiveSpeed;
        unit.vy = (dy / d) * effectiveSpeed;
      } else {
        unit.vx = direction * effectiveSpeed;
        unit.vy = 0;
      }
    } else {
      unit.vx = direction * effectiveSpeed;
      unit.vy = 0;
    }

    unit.behaviorState = 'marching';
    unit.inCombat = false;
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

    // Only charge toward enemies that are in front AND within sensor range --
    // this used to have no distance cap at all, so a charge accumulated for
    // as long as *anything* enemy-owned existed anywhere ahead in the lane,
    // in practice the whole no-man's-land. See CAVALRY_CHARGE_SENSE_RANGE.
    const senseRange2 = CAVALRY_CHARGE_SENSE_RANGE * CAVALRY_CHARGE_SENSE_RANGE;
    const hasForwardTarget = Array.from(allUnits.values()).some(
      u => u.owner !== unit.owner && !u.reachedBase && isInFront(unit, u.x, this.playerRight)
        && sqrDist(unit.x, unit.y, u.x, u.y) <= senseRange2,
    );
    const hasForwardGear = Array.from(allGears.values()).some(
      g => g.owner !== unit.owner && isInFront(unit, g.x, this.playerRight)
        && sqrDist(unit.x, unit.y, g.x, g.y) <= senseRange2,
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
        other.knockbackVx += direction * impulse;

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
    let targetUnit: UnitState | null = null;

    for (const [, other] of allUnits) {
      if (other.owner === unit.owner) continue;
      if (other.reachedBase) continue;
      if (!isInFront(unit, other.x, this.playerRight)) continue; // don't fire backward
      const d = distance(unit.x, unit.y, other.x, other.y);
      if (d < artilleryDetectRange && d < targetDist) {
        targetDist = d;
        targetX = other.x;
        targetY = other.y;
        targetUnit = other;
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
          // Lead the shot using the target's real current velocity, not
          // just where it happened to be standing when detected.
          const aimAt = targetUnit
            ? leadPosition(targetUnit.x, targetUnit.y, targetUnit.vx, targetUnit.vy, ARTILLERY_SHELL_TRAVEL_TIME)
            : { x: targetX, y: targetY };
          projectileSystem.fireArtilleryShell(unit, aimAt.x, aimAt.y, unit.baseDamage * 2);
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

  /**
   * Crossbow: stops and shoots instead of closing to melee, like Artillery,
   * but a direct hitscan hit (no projectile arc) at a much shorter range and
   * a slower cadence than Infantry's melee cooldown -- same per-hit damage,
   * lower DPS, per the roster design.
   */
  private updateCrossbow(
    unit: UnitState,
    deltaSec: number,
    now: number,
    allUnits: Map<string, UnitState>,
    allGears: ReturnType<World['getAllGears']>,
  ): void {
    const effectiveSpeed = unit.speed * (unit.slowFactor ?? 1);
    const detectRange = unit.attackRange * 1.5;

    let targetX = -1;
    let targetY = -1;
    let targetDist = Infinity;
    let targetUnit: UnitState | null = null;

    for (const [, other] of allUnits) {
      if (other.owner === unit.owner) continue;
      if (other.reachedBase) continue;
      if (!isInFront(unit, other.x, this.playerRight)) continue;
      const d = distance(unit.x, unit.y, other.x, other.y);
      if (d < detectRange && d < targetDist) {
        targetDist = d;
        targetX = other.x;
        targetY = other.y;
        targetUnit = other;
      }
    }

    if (targetX < 0) {
      for (const [, gear] of allGears) {
        if (gear.owner === unit.owner) continue;
        if (gear.hp <= 0 || gear.isBurntOut) continue;
        if (!isInFront(unit, gear.x, this.playerRight)) continue;
        const d = distance(unit.x, unit.y, gear.x, gear.y);
        if (d < detectRange && d < targetDist) {
          targetDist = d;
          targetX = gear.x;
          targetY = gear.y;
          targetUnit = null;
        }
      }
    }

    if (targetX < 0) {
      this.marchForward(unit, deltaSec);
      unit.inCombat = false;
      return;
    }

    if (targetDist <= unit.attackRange) {
      unit.vx = 0;
      unit.vy = 0;
      unit.behaviorState = 'firing';
      unit.inCombat = true;

      // Slower cadence than Infantry's melee cooldown -- same per-hit
      // damage, lower DPS, per the crossbow's design.
      const cooldown = computeAttackCooldown(unit.size) * 1.8;
      if (now - unit.lastAttackTime > cooldown) {
        unit.lastAttackTime = now;
        this.eventBus.emit('crossbow_bolt:fired', {
          owner: unit.owner,
          srcX: unit.x,
          srcY: unit.y,
          dstX: targetX,
          dstY: targetY,
        });

        if (targetUnit) {
          const dmg = computeDamage(unit.type, targetUnit, unit.baseDamage);
          targetUnit.hp -= dmg;
          this.eventBus.emit('unit:damaged', {
            unitId: targetUnit.id,
            damage: dmg,
            x: targetUnit.x,
            y: targetUnit.y,
          });
          if (targetUnit.hp <= 0) targetUnit.hp = 0;
        } else {
          // Target is an enemy gear -- same instant hitscan, no melee
          // contact required (unlike Infantry, which must walk into the
          // gear itself for GearUnitInteractionSystem to apply damage).
          const gearDmgMult = UNIT_GEAR_DAMAGE_MULT[unit.type] ?? 1;
          const dmg = unit.baseDamage * gearDmgMult;
          for (const [, gear] of allGears) {
            if (gear.x !== targetX || gear.y !== targetY) continue;
            if (gear.hp <= 0 || gear.isBurntOut) continue;
            const wasAlive = gear.hp > 0;
            gear.hp = Math.max(0, gear.hp - dmg);
            gear.crackLevel = crackLevelFor(gear.hp, gear.maxHp);
            this.world?.updateGear(gear);
            this.eventBus.emit('gear:damaged', {
              gearId: gear.id,
              damage: dmg,
              remainingHp: gear.hp,
              source: 'combat',
            });
            if (wasAlive && gear.hp <= 0) {
              this.eventBus.emit('gear:destroyed', { gearId: gear.id, owner: gear.owner, cause: 'combat' });
            }
            break;
          }
        }
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
  }

  /**
   * Sentry unit: marches like any other unit (it's not a dedicated fighter),
   * but periodically pulses true-sight in a radius, revealing any hidden
   * enemy mines caught in it early -- the counter to the Minelayer's
   * per-owner mine visibility, "mines are the stealth layer" per design.
   */
  private updateSentryUnit(
    unit: UnitState,
    deltaSec: number,
    now: number,
    allGears: ReturnType<World['getAllGears']>,
  ): void {
    this.marchForward(unit, deltaSec);
    unit.inCombat = false;

    const def = UNIT_DEFINITIONS.sentry_unit;
    const interval = def.sightPulseIntervalMs ?? 2000;
    if (now - unit.lastAttackTime < interval) return;
    unit.lastAttackTime = now;

    void allGears; // reserved for a future direct mine-reveal hook; MinelayerSystem listens to the pulse event itself
    this.eventBus.emit('sentry:pulse', {
      owner: unit.owner,
      x: unit.x,
      y: unit.y,
      radius: def.sightRadius ?? 150,
    });
  }

  /**
   * Saboteur: seeks the nearest enemy gear in the lane and, on contact,
   * fouls its rotation instead of dealing HP damage -- adds a temporary
   * friction spike that throttles the whole chain it sits on the same way
   * a cold zone or slime puddle does (see updateSaboteurDebuffs for the
   * matching removal). Deliberately never fights units of its own accord;
   * CombatSystem's generic engagement path handles it being attacked, the
   * same way it already does for Slime and Sentry Unit.
   */
  private updateSaboteur(
    unit: UnitState,
    deltaSec: number,
    now: number,
    allGears: ReturnType<World['getAllGears']>,
  ): void {
    void deltaSec;
    const effectiveSpeed = unit.speed * (unit.slowFactor ?? 1);
    const direction = marchDirection(unit.owner, this.playerRight);
    unit.inCombat = false;

    let target: GearState | null = null;
    let nearestDist2 = SABOTEUR_SEEK_RANGE * SABOTEUR_SEEK_RANGE;

    for (const [, gear] of allGears) {
      if (gear.owner === unit.owner) continue;
      if (gear.hp <= 0 || gear.isBurntOut) continue;
      if (!isInFront(unit, gear.x, this.playerRight)) continue;
      const d2 = sqrDist(unit.x, unit.y, gear.x, gear.y);
      if (d2 < nearestDist2) {
        nearestDist2 = d2;
        target = gear;
      }
    }

    if (!target) {
      unit.vx = direction * effectiveSpeed;
      unit.vy = 0;
      unit.behaviorState = 'marching';
      return;
    }

    const dx = target.x - unit.x;
    const dy = target.y - unit.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const contactDist = unit.size + gearRadius(target.teeth) + MELEE_CONTACT_DIST;

    if (d <= contactDist) {
      unit.vx = 0;
      unit.vy = 0;
      unit.behaviorState = 'attacking';

      if (now - unit.lastAttackTime > SABOTEUR_ACTION_COOLDOWN_MS) {
        unit.lastAttackTime = now;
        target.frictionLoad = (target.frictionLoad ?? 0) + SABOTEUR_FRICTION_AMOUNT;
        if (this.world) this.world.updateGear(target);
        this.saboteurDebuffs.push({
          gearId: target.id,
          amount: SABOTEUR_FRICTION_AMOUNT,
          expiresAt: now + SABOTEUR_FRICTION_DURATION_MS,
        });
        this.eventBus.emit('gear:rotation_result', {
          gearId: target.id, owner: unit.owner, text: 'JAMMED', color: 0xff4444,
        });
      }
    } else {
      unit.vx = (dx / d) * effectiveSpeed;
      unit.vy = (dy / d) * effectiveSpeed;
      unit.behaviorState = 'marching';
    }
  }

  /** Un-applies expired saboteur friction debuffs -- each one added a fixed
   * amount, so removal must subtract that same amount back out rather than
   * resetting to a freshly-computed total. */
  private updateSaboteurDebuffs(now: number): void {
    if (this.saboteurDebuffs.length === 0 || !this.world) return;
    const remaining: typeof this.saboteurDebuffs = [];
    for (const debuff of this.saboteurDebuffs) {
      if (now < debuff.expiresAt) {
        remaining.push(debuff);
        continue;
      }
      const gear = this.world.getGear(debuff.gearId);
      if (gear) {
        gear.frictionLoad = Math.max(0, (gear.frictionLoad ?? 0) - debuff.amount);
        this.world.updateGear(gear);
      }
    }
    this.saboteurDebuffs = remaining;
  }

  /**
   * Raider: seeks the nearest enemy miner/converter gear *within the lane*
   * and, on contact, disables it instead of dealing HP damage --
   * EconomySystem checks `disabledUntil` and withholds that gear's
   * production on rotation until it expires. Like every marching unit it
   * cannot reach a gear built off-lane -- keeping mining chains off-lane
   * keeps them safe from this entirely, the same trade-off that already
   * protects them from everything else. Never fights units of its own
   * accord, same as Saboteur.
   */
  private updateRaider(
    unit: UnitState,
    deltaSec: number,
    now: number,
    allGears: ReturnType<World['getAllGears']>,
  ): void {
    void deltaSec;
    const effectiveSpeed = unit.speed * (unit.slowFactor ?? 1);
    const direction = marchDirection(unit.owner, this.playerRight);
    unit.inCombat = false;

    let target: GearState | null = null;
    let nearestDist2 = RAIDER_SEEK_RANGE * RAIDER_SEEK_RANGE;

    for (const [, gear] of allGears) {
      if (gear.owner === unit.owner) continue;
      if (gear.hp <= 0 || gear.isBurntOut) continue;
      if (!RAIDER_TARGET_TYPES.has(gear.type)) continue;
      if (!isInFront(unit, gear.x, this.playerRight)) continue;
      const d2 = sqrDist(unit.x, unit.y, gear.x, gear.y);
      if (d2 < nearestDist2) {
        nearestDist2 = d2;
        target = gear;
      }
    }

    if (!target) {
      unit.vx = direction * effectiveSpeed;
      unit.vy = 0;
      unit.behaviorState = 'marching';
      return;
    }

    const dx = target.x - unit.x;
    const dy = target.y - unit.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const contactDist = unit.size + gearRadius(target.teeth) + MELEE_CONTACT_DIST;

    if (d <= contactDist) {
      unit.vx = 0;
      unit.vy = 0;
      unit.behaviorState = 'attacking';

      if (now - unit.lastAttackTime > RAIDER_ACTION_COOLDOWN_MS) {
        unit.lastAttackTime = now;
        target.disabledUntil = now + RAIDER_DISABLE_MS;
        if (this.world) this.world.updateGear(target);
        this.eventBus.emit('gear:rotation_result', {
          gearId: target.id, owner: unit.owner, text: 'RAIDED', color: 0xff8844,
        });
      }
    } else {
      unit.vx = (dx / d) * effectiveSpeed;
      unit.vy = (dy / d) * effectiveSpeed;
      unit.behaviorState = 'marching';
    }
  }

  /**
   * Field Medic: marches with the army and never fights (deals no damage,
   * baseDamage 0) -- every couple of seconds it pulses a heal to nearby
   * allied units, the mobile counterpart to the stationary Healer gear's
   * aura. Never targets gears at all.
   */
  private updateFieldMedic(
    unit: UnitState,
    deltaSec: number,
    now: number,
    allUnits: Map<string, UnitState>,
  ): void {
    this.marchForward(unit, deltaSec);
    unit.inCombat = false;

    const def = UNIT_DEFINITIONS.field_medic;
    const interval = def.healPulseIntervalMs ?? 2000;
    if (now - unit.lastAttackTime < interval) return;
    unit.lastAttackTime = now;

    const radius = def.healRadius ?? 90;
    const healAmt = def.healAmount ?? 6;

    for (const [, ally] of allUnits) {
      if (ally.owner !== unit.owner) continue;
      if (ally.id === unit.id) continue;
      if (ally.reachedBase || ally.hp >= ally.maxHp) continue;
      const d = distance(unit.x, unit.y, ally.x, ally.y);
      if (d > radius) continue;
      const actualHeal = Math.min(ally.maxHp - ally.hp, healAmt);
      ally.hp += actualHeal;
      this.eventBus.emit('unit:healed', { unitId: ally.id, amount: actualHeal, x: ally.x, y: ally.y });
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
          nearestUnitTarget.knockbackVx += pushImpulse;
          // Small perpendicular scatter
          nearestUnitTarget.knockbackVy += (Math.random() - 0.5) * unit.speed * 1.5;

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
        // Phantom deals damage proportional to overlap intensity. Self-damage
        // scales off what it's passing *through* (other.baseDamage), not its
        // own stat -- previously a flat rate off its own baseDamage meant
        // phasing through a 10-HP Slime cost exactly as much as phasing
        // through an 80-HP Iron Guard.
        const overlapFraction = 1 - d / contactDist;
        const enemyDmg = computeDamage(unit.type, other, unit.baseDamage * 1.8 * deltaSec * overlapFraction);
        const selfDmg   = computeDamage(other.type, unit, other.baseDamage * 0.4 * deltaSec * overlapFraction);
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

  // ─── Slime puddle helpers ────────────────────────────────────────────────

  /** Create a slime puddle at (x,y) on death. Overlapping puddles refresh rather than stack. */
  private createSlimePuddle(x: number, y: number, radius: number, slowFactor: number, gearFriction: number, now: number): void {
    const nowSec = now * 0.001;
    const existing = this.slimePuddles.find(p => distance(p.x, p.y, x, y) < p.radius * 0.6);
    const duration = UNIT_DEFINITIONS.slime.puddleDuration ?? 6;

    if (existing) {
      existing.endTime = nowSec + duration;
      return;
    }

    const id = nextSlimePuddleId();
    this.slimePuddles.push({ id, x, y, radius, endTime: nowSec + duration, slowFactor, gearFriction });
    this.eventBus.emit('slime_puddle:created', { id, x, y, radius, duration });
  }

  /**
   * Process slime puddles: expire old ones, slow units and add gear friction
   * for BOTH sides -- unlike a cold zone, a puddle doesn't take sides.
   */
  private updateSlimePuddles(
    now: number,
    allUnits: Map<string, UnitState>,
    allGears: ReturnType<World['getAllGears']>,
  ): void {
    const nowSec = now * 0.001;

    this.slimePuddles = this.slimePuddles.filter(p => {
      if (p.endTime < nowSec) {
        this.eventBus.emit('slime_puddle:expired', { id: p.id });
        return false;
      }
      return true;
    });

    if (this.slimePuddles.length === 0 && this.gearsWithPuddleFriction.size === 0) return;

    for (const [, unit] of allUnits) {
      if (unit.reachedBase) continue;
      for (const puddle of this.slimePuddles) {
        const d = distance(unit.x, unit.y, puddle.x, puddle.y);
        if (d < puddle.radius) {
          unit.slowTimer = 0.25;
          unit.slowFactor = Math.min(unit.slowFactor, puddle.slowFactor);
          break;
        }
      }
    }

    const gearsInPuddle = new Set<string>();
    for (const [gearId, gear] of allGears) {
      for (const puddle of this.slimePuddles) {
        const d = distance(gear.x, gear.y, puddle.x, puddle.y);
        if (d < puddle.radius + gearRadius(gear.teeth)) {
          gearsInPuddle.add(gearId);
          break;
        }
      }
    }

    for (const gearId of gearsInPuddle) {
      if (!this.gearsWithPuddleFriction.has(gearId)) {
        const gear = allGears.get(gearId);
        if (gear) {
          const puddleFriction = UNIT_DEFINITIONS.slime.frictionValue ?? 20;
          gear.frictionLoad = (gear.frictionLoad ?? 0) + puddleFriction;
          if (this.world) this.world.updateGear(gear);
          this.gearsWithPuddleFriction.add(gearId);
        }
      }
    }

    for (const gearId of this.gearsWithPuddleFriction) {
      if (!gearsInPuddle.has(gearId)) {
        const gear = allGears.get(gearId);
        if (gear) {
          const puddleFriction = UNIT_DEFINITIONS.slime.frictionValue ?? 20;
          gear.frictionLoad = Math.max(0, (gear.frictionLoad ?? 0) - puddleFriction);
          if (this.world) this.world.updateGear(gear);
        }
        this.gearsWithPuddleFriction.delete(gearId);
      }
    }
  }

  // ─── Physics helpers ────────────────────────────────────────────────────

  private triggerIronGuardExplosion(
    unit: UnitState,
    allUnits: Map<string, UnitState>,
    allGears: ReturnType<World['getAllGears']>,
  ): void {
    const radius = unit.size * 3;
    const damage = unit.baseDamage * 4;

    // Generic AoE signal -- lets other systems (MinelayerSystem's
    // chain-detonation) react to "something exploded here".
    this.eventBus.emit('aoe:explosion', { x: unit.x, y: unit.y, radius, owner: unit.owner });

    // Damage all units within radius (both sides). Knockback is applied
    // uniformly for every explosion source, including this one, by the
    // onAoeExplosion listener reacting to the 'aoe:explosion' event emitted
    // just above -- previously no explosion applied any pushback at all,
    // however close a survivor stood.
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
    this.physicsWorld.removeUnit(unitId);
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
   * other spawner type (including slime_spawner) passes its base type
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
    // Partial<Record<GearType, ...>> rather than an index signature: a loose
    // `{ [key: string]: UnitType }` accepts keys that are not gear types at
    // all, so renaming or deleting a spawner gear silently leaves a dead entry
    // here and the gear spawns nothing. That exact bug shipped once already --
    // see the crossbow/sentry note below. The typed key makes the compiler
    // catch it.
    const spawnerMap: Partial<Record<GearType, UnitType>> = {
      infantry_spawner: 'infantry',
      artillery_spawner: 'artillery',
      cavalry_spawner: 'cavalry',
      slime_spawner: 'slime',
      iron_guard_spawner: 'iron_guard',
      crystal_sentinel_spawner: 'crystal_sentinel',
      aether_phantom_spawner: 'aether_phantom',
      // These two were declared as gears (GEAR_DEFINITIONS), gated by tech,
      // and documented as spawning their unit -- but never wired into this
      // map, so placing one produced nothing. Fixed alongside adding the
      // five new spawners below, which would have shipped with the exact
      // same gap otherwise.
      crossbow_spawner: 'crossbow',
      sentry_spawner: 'sentry_unit',
      sapper_spawner: 'sapper',
      skirmish_diver_spawner: 'skirmish_diver',
      saboteur_spawner: 'saboteur',
      raider_spawner: 'raider',
      field_medic_spawner: 'field_medic',
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
      slime: 'Slime',
      iron_guard: 'Iron Guard',
      crystal_sentinel: 'Sentinel',
      aether_phantom: 'Phantom',
      crossbow: 'Crossbow',
      sentry_unit: 'Sentry',
      sapper: 'Sapper',
      skirmish_diver: 'Diver',
      saboteur: 'Saboteur',
      raider: 'Raider',
      field_medic: 'Medic',
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
    this.eventBus.off('aoe:explosion', this.onAoeExplosion);
    this.coldZones = [];
    this.gearsWithColdFriction.clear();
    this.slimePuddles = [];
    this.gearsWithPuddleFriction.clear();
    this.physicsWorld.destroy();
  }
}
