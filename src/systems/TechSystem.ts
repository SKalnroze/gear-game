import { TechNode, TechNodeId, TechState, TechUnlockEffect } from '../types/tech.types';
import { EventBus } from './EventBus';
import { TECH_NODES } from '../constants/tech.constants';
import { EconomySystem } from './EconomySystem';
import { UnitSystem } from './UnitSystem';
import { RotationPhysicsSystem } from './RotationPhysicsSystem';
import { WinConditionSystem } from './WinConditionSystem';
import { AbilitySystem } from './AbilitySystem';
import { AbilityId } from '../types/ability.types';
import { UnitType } from '../types/unit.types';

/**
 * Manages the research queue, unlock gate checking, and effect application.
 * Supports auto-advancing queue on completion and teeth unlock callbacks.
 */
export class TechSystem {
  private eventBus: EventBus;
  private economySystem: EconomySystem;
  private unitSystem: UnitSystem;
  private rotationPhysics: RotationPhysicsSystem;
  private winSystem: WinConditionSystem;

  private playerTech: TechState;
  private aiTech: TechState;

  private playerPowerBonusPct: number = 0;

  private abilitySystem: AbilitySystem | null = null;

  private readonly onGearResearchBoost = ({ owner, amount }: { owner: 'player' | 'ai'; amount: number }) => {
    const tech = owner === 'player' ? this.playerTech : this.aiTech;
    if (!tech.inProgress || !tech.progressStartedAt) return;
    // Advance research by 'amount' ms by moving progressStartedAt back
    tech.progressStartedAt = Math.max(0, tech.progressStartedAt - amount);
  };

  constructor(
    eventBus: EventBus,
    economySystem: EconomySystem,
    unitSystem: UnitSystem,
    rotationPhysics: RotationPhysicsSystem,
    winSystem: WinConditionSystem,
    playerTech: TechState,
    abilitySystem?: AbilitySystem,
  ) {
    this.eventBus = eventBus;
    this.economySystem = economySystem;
    this.unitSystem = unitSystem;
    this.rotationPhysics = rotationPhysics;
    this.winSystem = winSystem;
    this.playerTech = playerTech;
    this.aiTech = { researched: new Set(), queue: [], unlockedTeeth: [10] };
    this.abilitySystem = abilitySystem ?? null;

    this.eventBus.on('gear:research_boost', this.onGearResearchBoost);
  }

  destroy(): void {
    this.eventBus.off('gear:research_boost', this.onGearResearchBoost);
  }

  canResearch(nodeId: TechNodeId, owner: 'player' | 'ai'): boolean {
    const tech = owner === 'player' ? this.playerTech : this.aiTech;
    const node = TECH_NODES[nodeId];
    if (!node) return false;
    if (tech.researched.has(nodeId)) return false;
    if (tech.inProgress === nodeId) return false;
    // Also check not already in queue
    if (tech.queue.includes(nodeId)) return false;
    return node.prereqs.every(prereq => tech.researched.has(prereq));
  }

  startResearch(nodeId: TechNodeId, owner: 'player' | 'ai'): boolean {
    if (!this.canResearch(nodeId, owner)) return false;

    const node = TECH_NODES[nodeId];
    if (!this.economySystem.canAffordGold(owner, node.goldCost)) return false;

    const tech = owner === 'player' ? this.playerTech : this.aiTech;

    // If something is already in progress, add to queue instead
    if (tech.inProgress) {
      tech.queue.push(nodeId);
      this.economySystem.spendGold(owner, node.goldCost);
      this.eventBus.emit('tech:queued', { nodeId, owner });
      return true;
    }

    this.economySystem.spendGold(owner, node.goldCost);
    tech.inProgress = nodeId;
    tech.progressStartedAt = Date.now();

    this.eventBus.emit('tech:research_started', { nodeId, owner });
    return true;
  }

  cancelResearch(nodeId: TechNodeId, owner: 'player' | 'ai'): boolean {
    const tech = owner === 'player' ? this.playerTech : this.aiTech;
    const node = TECH_NODES[nodeId];
    if (!node) return false;

    if (tech.inProgress === nodeId) {
      tech.inProgress = undefined;
      tech.progressStartedAt = undefined;
      this.economySystem.earnGold(owner, node.goldCost);
      // Auto-advance queue (gold already spent at queue time)
      if (tech.queue.length > 0) {
        const next = tech.queue.shift()!;
        tech.inProgress = next;
        tech.progressStartedAt = Date.now();
        this.eventBus.emit('tech:research_started', { nodeId: next, owner });
      }
      this.eventBus.emit('tech:cancelled', { nodeId, owner });
      return true;
    }

    const queueIdx = tech.queue.indexOf(nodeId);
    if (queueIdx !== -1) {
      tech.queue.splice(queueIdx, 1);
      this.economySystem.earnGold(owner, node.goldCost);
      this.eventBus.emit('tech:cancelled', { nodeId, owner });
      return true;
    }

    return false;
  }

  update(now: number): void {
    this.checkResearchCompletion('player', now);
    this.checkResearchCompletion('ai', now);
  }

  private checkResearchCompletion(owner: 'player' | 'ai', now: number): void {
    const tech = owner === 'player' ? this.playerTech : this.aiTech;
    if (!tech.inProgress || !tech.progressStartedAt) return;

    const node = TECH_NODES[tech.inProgress];
    if (!node) return;

    if (now - tech.progressStartedAt >= node.researchTime) {
      const nodeId = tech.inProgress;
      tech.researched.add(nodeId);
      tech.inProgress = undefined;
      tech.progressStartedAt = undefined;

      this.applyEffects(node, owner);
      this.eventBus.emit('tech:research_complete', { nodeId, owner });

      // Auto-advance queue
      if (tech.queue.length > 0) {
        const next = tech.queue.shift()!;
        // Start directly (already paid gold at queue time)
        tech.inProgress = next;
        tech.progressStartedAt = Date.now();
        this.eventBus.emit('tech:research_started', { nodeId: next, owner });
      }

      // Notify newly available nodes
      for (const [id] of Object.entries(TECH_NODES)) {
        if (!tech.researched.has(id) && this.canResearch(id, owner)) {
          this.eventBus.emit('tech:node_available', { nodeId: id, owner });
        }
      }
    }
  }

  private applyEffects(node: TechNode, owner: 'player' | 'ai'): void {
    for (const effect of node.effects) {
      this.applyEffect(effect, owner);
    }
  }

  private applyEffect(effect: TechUnlockEffect, owner: 'player' | 'ai'): void {
    switch (effect.kind) {
      case 'unlock_gear':
        break;

      case 'unlock_teeth': {
        const tech = owner === 'player' ? this.playerTech : this.aiTech;
        if (!tech.unlockedTeeth.includes(effect.teeth)) {
          tech.unlockedTeeth.push(effect.teeth);
          tech.unlockedTeeth.sort((a, b) => a - b);
        }
        break;
      }

      case 'unlock_unit':
        // Unlock for both player and AI — each side's spawner gears control actual production
        this.unitSystem.unlockUnitType(effect.unitType as UnitType);
        break;

      case 'power_bonus_pct':
        if (owner === 'player') {
          this.playerPowerBonusPct += effect.value;
          this.rotationPhysics.setPowerBonusPct(this.playerPowerBonusPct);
        }
        break;

      case 'gold_bonus_per_sec':
        this.economySystem.applyGoldBonus(owner, effect.value);
        break;

      case 'unit_hp_pct':
        if (owner === 'player') {
          this.unitSystem.applyHpBonus(effect.unitType as UnitType, effect.value);
        }
        break;

      case 'unit_speed_pct':
        if (owner === 'player') {
          this.unitSystem.applySpeedBonus(effect.unitType as UnitType, effect.value);
        }
        break;

      case 'unit_damage_pct':
        if (owner === 'player') {
          this.unitSystem.applyDamageBonus(effect.unitType as UnitType, effect.value);
        }
        break;

      case 'capacitor_burst_multiplier':
        if (owner === 'player') {
          this.rotationPhysics.setCapacitorBurstMultiplier(2.5 + effect.value);
        }
        break;

      case 'base_hp_bonus':
        this.winSystem.addMaxHp(owner, effect.value);
        break;

      case 'enable_ability':
        if (owner === 'player' && this.abilitySystem) {
          this.abilitySystem.unlock(effect.abilityId as AbilityId);
        }
        break;

      case 'overclock_duration_bonus':
      case 'chain_combo_bonus':
        break;
    }
  }

  getPlayerTech(): TechState {
    return this.playerTech;
  }

  getAITech(): TechState {
    return this.aiTech;
  }

  getResearchProgress(owner: 'player' | 'ai'): { nodeId: TechNodeId; progress: number } | null {
    const tech = owner === 'player' ? this.playerTech : this.aiTech;
    if (!tech.inProgress || !tech.progressStartedAt) return null;
    const node = TECH_NODES[tech.inProgress];
    if (!node) return null;
    const progress = Math.min(1, (Date.now() - tech.progressStartedAt) / node.researchTime);
    return { nodeId: tech.inProgress, progress };
  }
}
