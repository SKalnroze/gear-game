import { GearState } from '../types/gear.types';
import { UnitState } from '../types/unit.types';
import { World } from '../world/World';
import { EventBus } from './EventBus';
import { gearRadius, spikeDamage, MAX_TEETH, GEAR_MODULE, crackLevelFor } from '../constants/gear.constants';
import { UNIT_DEFINITIONS } from '../constants/unit.constants';
import { ARMORED_DAMAGE_RATE, UNIT_COLLISION_RADIUS, UNIT_GEAR_DAMAGE_RATE } from '../constants/balance.constants';
import { distance } from '../utils/MathUtils';
import { SpatialGrid } from '../utils/SpatialGrid';

/** Cell size = 2× max gear radius so a unit query covers at most 4 cells */
const GRID_CELL_SIZE = MAX_TEETH * GEAR_MODULE * 2;

/**
 * Handles all interactions between gears and units in the shared lane band.
 *
 * Spiked gear: damages units on contact; damage = |omega| * spikeCoeff * delta
 * Armored gear: physically pushes units out (collision resolution)
 * Wrench unit: seeks nearest enemy gear, latches on, adds friction load
 */
export class GearUnitInteractionSystem {
  private world: World;
  private eventBus: EventBus;
  private gearGrid: SpatialGrid<GearState> = new SpatialGrid(GRID_CELL_SIZE);
  private gridDirty: boolean = true;

  private readonly onGridDirty = () => { this.gridDirty = true; };

  constructor(world: World, eventBus: EventBus) {
    this.world = world;
    this.eventBus = eventBus;

    // Rebuild the grid whenever gear positions change. Repositioning was
    // missing, so after a player moved a gear the grid kept its old
    // coordinates and unit interactions used the stale position.
    eventBus.on('gear:placed', this.onGridDirty);
    eventBus.on('gear:removed', this.onGridDirty);
    eventBus.on('gear:repositioned', this.onGridDirty);
  }

  destroy(): void {
    this.eventBus.off('gear:placed', this.onGridDirty);
    this.eventBus.off('gear:removed', this.onGridDirty);
    this.eventBus.off('gear:repositioned', this.onGridDirty);
  }

  private rebuildGrid(allGears: Map<string, GearState>): void {
    this.gearGrid.clear();
    for (const [, gear] of allGears) {
      this.gearGrid.insert(gear.id, gear.x, gear.y, gear);
    }
    this.gridDirty = false;
  }

  /**
   * Called every frame. Checks all unit-gear pairs for interactions.
   * Uses a spatial grid to avoid O(units × gears) distance checks.
   */
  update(
    deltaSec: number,
    allUnits: Map<string, UnitState>,
    allGears: Map<string, GearState>,
  ): void {
    if (this.gridDirty) this.rebuildGrid(allGears);

    for (const [, unit] of allUnits) {
      if (unit.reachedBase) continue;

      // Query only gears that could possibly be in contact range
      const unitRadius = unit.size > 0 ? unit.size : UNIT_COLLISION_RADIUS;
      const queryRadius = unitRadius + MAX_TEETH * GEAR_MODULE;
      const candidates = this.gearGrid.query(unit.x, unit.y, queryRadius);

      for (const gear of candidates) {
        const gr = gearRadius(gear.teeth);
        const d = distance(unit.x, unit.y, gear.x, gear.y);
        const contactDist = unitRadius + gr;

        if (d >= contactDist) continue;

        // Unit is overlapping this gear
        switch (gear.type) {
          case 'spiked':
            this.handleSpikedContact(unit, gear, d, contactDist, deltaSec);
            break;

          case 'armored':
            this.handleArmoredContact(unit, gear, d, contactDist, deltaSec);
            break;

          case 'motor':
          case 'amplifier':
          case 'capacitor':
          case 'overclock':
          case 'iron_miner':
          case 'crystal_miner':
          case 'aether_miner':
          case 'researcher':
          case 'iron_converter':
          case 'crystal_converter':
          case 'aether_converter':
          case 'crossbow_turret':
          case 'artillery_turret':
          case 'healer':
          case 'infantry_spawner':
          case 'artillery_spawner':
          case 'cavalry_spawner':
          case 'wrench_spawner':
          case 'iron_guard_spawner':
          case 'crystal_sentinel_spawner':
          case 'aether_phantom_spawner':
          default:
            // Wrench units latch; combat units damage all enemy gear types
            if (unit.type === 'wrench' && unit.owner !== gear.owner && !unit.attachedGearId) {
              this.attachWrench(unit, gear, allUnits, allGears);
            } else if (unit.type !== 'wrench' && unit.owner !== gear.owner) {
              // Combat units attack all enemy gear types at melee range
              this.handleCombatUnitGearContact(unit, gear, d, contactDist, deltaSec);
            }
            break;
        }
      }

      // Detach wrench units whose gear has been removed
      if (unit.attachedGearId && !allGears.has(unit.attachedGearId)) {
        this.detachWrench(unit, null, allUnits, allGears);
      }
    }

    // Armored gear spinning push. This used to scan every armored gear
    // against every unit, ignoring the spatial grid built for the loop above;
    // now it queries the grid per unit like the contact pass does.
    for (const [, unit] of allUnits) {
      if (unit.reachedBase) continue;

      const unitRadius = unit.size > 0 ? unit.size : UNIT_COLLISION_RADIUS;
      const pushQueryRadius = unitRadius + MAX_TEETH * GEAR_MODULE + 10;
      for (const gear of this.gearGrid.query(unit.x, unit.y, pushQueryRadius)) {
        if (gear.type !== 'armored') continue;
        if (gear.isBurntOut) continue;
        if (unit.owner === gear.owner) continue;
        if (Math.abs(gear.angularVelocity) < 0.1) continue;

        const gr = gearRadius(gear.teeth);
        const d = distance(unit.x, unit.y, gear.x, gear.y);
        const pushDist = gr + unitRadius + 10;
        if (d >= pushDist || d < 0.01) continue;

        const nx = (unit.x - gear.x) / d;
        const ny = (unit.y - gear.y) / d;
        const pushStrength = Math.abs(gear.angularVelocity) * 30 * deltaSec;
        unit.x += nx * pushStrength;
        unit.y += ny * pushStrength;
        this.world.updateUnit(unit);
      }
    }
  }

  private handleSpikedContact(
    unit: UnitState,
    gear: GearState,
    d: number,
    contactDist: number,
    deltaSec: number,
  ): void {
    if (gear.isBurntOut) return;
    if (unit.owner === gear.owner) return;

    // Damage scales with rotation speed; gear still deals minimum contact damage when barely spinning
    const spinMult = gear.isSpinning
      ? Math.max(0.5, Math.abs(gear.angularVelocity))
      : 0.15;
    const damage = spikeDamage(gear.teeth) * spinMult * deltaSec;
    unit.hp -= damage;

    if (unit.hp <= 0) {
      unit.hp = 0;
      // The unit:died handlers run synchronously and remove the unit, so this
      // must be the last thing we do with it — writing it back afterwards
      // would put the corpse straight back into the world.
      this.eventBus.emit('unit:died', { unitId: unit.id, owner: unit.owner });
      return;
    }

    // Push unit slightly away from gear to avoid deep penetration
    this.resolveCircleCollision(unit, gear, d, contactDist, 0.3);
    this.world.updateUnit(unit);
  }

  private handleArmoredContact(
    unit: UnitState,
    gear: GearState,
    d: number,
    contactDist: number,
    deltaSec: number,
  ): void {
    if (gear.isBurntOut) return;
    // Armored gears only block enemy units
    if (unit.owner === gear.owner) return;

    // Hard block: push unit fully out of the gear
    this.resolveCircleCollision(unit, gear, d, contactDist, 1.0);

    // Combat units always damage armored gears on contact
    if (unit.type !== 'wrench') {
      // Bug 1.2 fix: rate-based damage (not per-frame), normalised to 1 second
      const damage = unit.baseDamage * ARMORED_DAMAGE_RATE * deltaSec;
      const wasAlive = gear.hp > 0;
      gear.hp = Math.max(0, gear.hp - damage);
      gear.crackLevel = crackLevelFor(gear.hp, gear.maxHp);
      this.world.updateGear(gear);

      this.eventBus.emit('gear:damaged', {
        gearId: gear.id,
        damage,
        remainingHp: gear.hp,
        source: 'combat',
      });

      if (wasAlive && gear.hp <= 0) {
        // Armored gear is destroyed when HP reaches 0
        this.eventBus.emit('gear:destroyed', {
          gearId: gear.id,
          owner: gear.owner,
          cause: 'combat',
        });
      }
    }

    this.world.updateUnit(unit);
  }

  private handleCombatUnitGearContact(
    unit: UnitState,
    gear: GearState,
    d: number,
    contactDist: number,
    deltaSec: number,
  ): void {
    if (gear.isBurntOut) return;

    // Meaningful damage: baseDamage HP/sec
    const damage = unit.baseDamage * UNIT_GEAR_DAMAGE_RATE * deltaSec;
    const wasAlive = gear.hp > 0;
    gear.hp = Math.max(0, gear.hp - damage);
    gear.crackLevel = crackLevelFor(gear.hp, gear.maxHp);
    this.world.updateGear(gear);

    this.eventBus.emit('gear:damaged', {
      gearId: gear.id,
      damage,
      remainingHp: gear.hp,
      source: 'combat',
    });

    if (wasAlive && gear.hp <= 0) {
      this.eventBus.emit('gear:destroyed', {
        gearId: gear.id,
        owner: gear.owner,
        cause: 'combat',
      });
    }

    // Soft push-back: slows unit movement through gear
    this.resolveCircleCollision(unit, gear, d, contactDist, 0.4);
    this.world.updateUnit(unit);
  }

  private attachWrench(
    unit: UnitState,
    gear: GearState,
    _allUnits: Map<string, UnitState>,
    _allGears: Map<string, GearState>,
  ): void {
    const def = UNIT_DEFINITIONS[unit.type];
    const frictionAdded = def.frictionValue ?? unit.frictionValue;

    unit.attachedGearId = gear.id;
    unit.inCombat = true;

    gear.frictionLoad += frictionAdded ?? 0;
    this.world.updateGear(gear);
    this.world.updateUnit(unit);

    this.eventBus.emit('gear:unit_attached', {
      gearId: gear.id,
      unitId: unit.id,
      frictionAdded,
    });
  }

  detachWrench(
    unit: UnitState,
    gear: GearState | null,
    _allUnits: Map<string, UnitState>,
    allGears: Map<string, GearState>,
  ): void {
    const frictionRemoved = unit.frictionValue;

    // Bug 1.1 fix: capture gearId BEFORE clearing the field
    const gearId = unit.attachedGearId;

    if (gear && gear.frictionLoad !== undefined) {
      gear.frictionLoad = Math.max(0, gear.frictionLoad - (frictionRemoved ?? 0));
      this.world.updateGear(gear);
    } else if (gearId) {
      const g = allGears.get(gearId);
      if (g) {
        g.frictionLoad = Math.max(0, g.frictionLoad - (frictionRemoved ?? 0));
        this.world.updateGear(g);
      }
    }

    unit.attachedGearId = undefined;
    unit.inCombat = false;
    this.world.updateUnit(unit);

    // Bug 1.1 fix: use the captured gearId (not the now-cleared field)
    if (gearId) {
      this.eventBus.emit('gear:unit_detached', {
        gearId,
        unitId: unit.id,
      });
    }
  }

  /**
   * Push unit away from a gear so they don't overlap.
   * factor 1.0 = full separation, 0.5 = half separation
   */
  private resolveCircleCollision(
    unit: UnitState,
    gear: GearState,
    d: number,
    contactDist: number,
    factor: number,
  ): void {
    if (d < 0.01) {
      // Edge case: exactly on top — push up
      unit.y -= contactDist * factor;
      return;
    }
    const overlap = contactDist - d;
    const nx = (unit.x - gear.x) / d;
    const ny = (unit.y - gear.y) / d;
    unit.x += nx * overlap * factor;
    unit.y += ny * overlap * factor;
  }
}
