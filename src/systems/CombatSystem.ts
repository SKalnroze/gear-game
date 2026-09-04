import { UnitState } from '../types/unit.types';
import { EventBus } from './EventBus';
import { UnitSystem } from './UnitSystem';
import { computeDamage, getCounterMultiplier } from '../constants/unit.constants';
import { COMBAT_TICK_INTERVAL } from '../constants/balance.constants';

/**
 * Detects and resolves combat between opposing units in the same lane.
 */
export class CombatSystem {
  private eventBus: EventBus;
  private unitSystem: UnitSystem;
  private lastCombatTick: number = 0;

  constructor(eventBus: EventBus, unitSystem: UnitSystem) {
    this.eventBus = eventBus;
    this.unitSystem = unitSystem;
  }

  /**
   * Called every frame. Checks for new engagements and ticks ongoing combat.
   */
  update(now: number): void {
    this.detectEngagements();

    if (now - this.lastCombatTick >= COMBAT_TICK_INTERVAL) {
      this.lastCombatTick = now;
      this.resolveCombatTick();
    }
  }

  /**
   * Units whose combat is handled by UnitSystem behavior state machines.
   * CombatSystem only handles infantry and iron_guard melee (they stop to fight).
   */
  private readonly BEHAVIOR_MANAGED_TYPES = new Set([
    'cavalry', 'artillery', 'crystal_sentinel', 'aether_phantom',
    'elite_cavalry', 'elite_artillery',
    'infantry', 'iron_guard', 'mixed', 'elite_infantry',
  ]);

  /**
   * Find pairs of opposing units that are close enough to fight.
   * Uses 2D distance since units now have continuous x/y (no discrete lane).
   * Skips units whose combat is handled by UnitSystem (cavalry, artillery, etc.).
   */
  private detectEngagements(): void {
    const allUnits = this.unitSystem.getAllUnits();

    for (const [, unitA] of allUnits) {
      if (unitA.inCombat || unitA.reachedBase) continue;
      // Skip units managed by UnitSystem behavior
      if (this.BEHAVIOR_MANAGED_TYPES.has(unitA.type)) continue;

      for (const [, unitB] of allUnits) {
        if (unitB.owner === unitA.owner) continue;
        if (unitB.inCombat || unitB.reachedBase) continue;
        if (this.BEHAVIOR_MANAGED_TYPES.has(unitB.type)) continue;

        const dx = Math.abs(unitA.x - unitB.x);
        const dy = Math.abs(unitA.y - unitB.y);
        const engageRange = Math.max(unitA.attackRange ?? 36, unitB.attackRange ?? 36);
        if (dx <= engageRange && dy <= engageRange * 2) {
          // Start combat
          unitA.inCombat = true;
          unitB.inCombat = true;
          unitA.combatTarget = unitB.id;
          unitB.combatTarget = unitA.id;
          this.unitSystem.updateUnit(unitA);
          this.unitSystem.updateUnit(unitB);
          this.eventBus.emit('unit:entered_combat', { unitId: unitA.id, targetId: unitB.id });
          this.eventBus.emit('unit:entered_combat', { unitId: unitB.id, targetId: unitA.id });
        }
      }
    }
  }

  /**
   * Tick all ongoing combat pairs.
   */
  private resolveCombatTick(): void {
    const allUnits = this.unitSystem.getAllUnits();
    const processed = new Set<string>();

    for (const [, unit] of allUnits) {
      if (!unit.inCombat || !unit.combatTarget || processed.has(unit.id)) continue;

      const target = this.unitSystem.getUnit(unit.combatTarget);
      if (!target) {
        // Target is gone; disengage
        unit.inCombat = false;
        unit.combatTarget = undefined;
        this.unitSystem.updateUnit(unit);
        continue;
      }

      processed.add(unit.id);
      processed.add(target.id);

      const multAtoB = getCounterMultiplier(unit.type, target.type);
      const multBtoA = getCounterMultiplier(target.type, unit.type);

      const dmgAtoB = computeDamage(unit.type, target, unit.baseDamage);
      const dmgBtoA = computeDamage(target.type, unit, target.baseDamage);

      target.hp -= dmgAtoB;
      unit.hp -= dmgBtoA;

      this.eventBus.emit('combat:damage_dealt', {
        attackerId: unit.id, defenderId: target.id,
        damage: dmgAtoB, multiplier: multAtoB,
      });
      this.eventBus.emit('combat:damage_dealt', {
        attackerId: target.id, defenderId: unit.id,
        damage: dmgBtoA, multiplier: multBtoA,
      });

      if (unit.hp <= 0) {
        this.eventBus.emit('unit:died', { unitId: unit.id, owner: unit.owner });
      }
      if (target.hp <= 0) {
        this.eventBus.emit('unit:died', { unitId: target.id, owner: target.owner });
      }

      // Clean up combat links if someone died
      if (unit.hp > 0 && target.hp <= 0) {
        unit.inCombat = false;
        unit.combatTarget = undefined;
        this.unitSystem.updateUnit(unit);
      } else if (target.hp > 0 && unit.hp <= 0) {
        target.inCombat = false;
        target.combatTarget = undefined;
        this.unitSystem.updateUnit(target);
      } else {
        this.unitSystem.updateUnit(unit);
        this.unitSystem.updateUnit(target);
      }
    }
  }
}
