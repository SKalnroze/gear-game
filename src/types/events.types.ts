import { GearState, GearType } from './gear.types';
import { UnitState, UnitType } from './unit.types';
import { TechNodeId } from './tech.types';
import { ResourceState } from './economy.types';
import { AbilityId } from './ability.types';

/**
 * Typed event bus contract — ALL cross-system events are declared here.
 */
export interface GameEventMap {
  // Gear events
  'gear:placed': { gear: GearState };
  'gear:removed': { gearId: string };
  'gear:mesh_updated': { gearIds: string[] };
  'gear:burnt_out': { gearId: string };
  'gear:overclock_started': { gearId: string; duration: number };
  'gear:full_rotation': { gearId: string; owner: 'player' | 'ai'; rotationCount: number };
  'gear:unit_attached': { gearId: string; unitId: string; frictionAdded: number };
  'gear:unit_detached': { gearId: string; unitId: string };
  'gear:snap_preview': { x: number; y: number; valid: boolean };
  'gear:repositioned': { gearId: string; oldX: number; oldY: number; newX: number; newY: number };
  'gear:rotation_result': { gearId: string; owner: 'player' | 'ai'; text: string; color: number };
  'gear:jammed': { gearId: string; conflictingGearId: string; torque: number };
  'gear:jam_cleared': { gearId: string };
  'gear:damaged': { gearId: string; damage: number; remainingHp: number; source: 'jam' | 'combat' };
  'gear:destroyed': { gearId: string; owner: 'player' | 'ai'; cause: 'jam' | 'combat' };

  // Power/capacitor events
  'power:capacitor_burst': { gearId: string; owner: 'player' | 'ai'; powerReleased: number };

  // Economy events
  'economy:gold_changed': { owner: 'player' | 'ai'; resources: ResourceState };
  'economy:resources_changed': { owner: 'player' | 'ai'; resources: ResourceState };
  'economy:spend_gold': { owner: 'player' | 'ai'; amount: number };
  'economy:earn_gold': { owner: 'player' | 'ai'; amount: number };
  'economy:insufficient_funds': { owner: 'player' | 'ai'; resource: 'gold' | 'iron' | 'crystal' | 'aether'; needed: number };

  // Unit events
  'unit:spawned': { unit: UnitState };
  'unit:moved': { unitId: string; x: number; y: number };
  'unit:entered_combat': { unitId: string; targetId: string };
  'unit:died': { unitId: string; owner: 'player' | 'ai' };
  'unit:reached_base': { unit: UnitState };
  'unit:damaged': { unitId: string; damage: number; x: number; y: number };

  // Projectile events
  'projectile:fired': { id: string; type: string; owner: 'player' | 'ai'; x: number; y: number };
  'projectile:hit': { id: string; x: number; y: number; aoeRadius: number };

  // Crystal sentinel cold zone events
  'cold_beam:fired': { owner: 'player' | 'ai'; srcX: number; srcY: number; dstX: number; dstY: number };
  'cold_zone:created': { id: string; x: number; y: number; radius: number };
  'cold_zone:expired': { id: string };

  // Combat events
  'combat:damage_dealt': { attackerId: string; defenderId: string; damage: number; multiplier: number };
  'combat:base_damaged': { owner: 'player' | 'ai'; damage: number; remainingHp: number };

  // Tech events
  'tech:research_started': { nodeId: TechNodeId; owner: 'player' | 'ai' };
  'tech:research_complete': { nodeId: TechNodeId; owner: 'player' | 'ai' };
  'tech:node_available': { nodeId: TechNodeId; owner: 'player' | 'ai' };
  'tech:queued': { nodeId: TechNodeId; owner: 'player' | 'ai' };
  'tech:cancelled': { nodeId: TechNodeId; owner: 'player' | 'ai' };

  // Game flow events
  'game:started': {};
  'game:paused': {};
  'game:resumed': {};
  'game:over': { winner: 'player' | 'ai'; reason: string };
  'game:tick': { tickNumber: number; delta: number };

  // UI events
  'ui:gear_palette_select': { gearType: GearType; teeth: number };
  'ui:gear_palette_deselect': {};
  'ui:gear_drag_start': { gearType: GearType; teeth: number };
  'ui:gear_drag_end': {};
  'ui:gear_pickup_start': {};
  'ui:gear_pickup_end': {};
  'ui:teeth_changed': { teeth: number };
  'ui:tech_node_clicked': { nodeId: TechNodeId };
  'ui:tooltip_show': { text: string; x: number; y: number };
  'ui:tooltip_hide': {};
  'ui:remove_mode_toggled': { active: boolean };
  'ui:as_enemy_toggled': { active: boolean };
  'ui:pause_toggled': { paused: boolean };
  'ui:panel_height_changed': { topY: number; totalH: number };

  // AI events
  'ai:decision_made': { decision: import('./ai.types').AIDecision };
  'ai:strategy_changed': { strategy: import('./ai.types').AIStrategyProfile };

  // Ability events
  'ability:unlocked': { id: AbilityId };
  'ability:activated': { id: AbilityId };
  'ability:cooldown_ready': { id: AbilityId };

  // Gear research/healer events
  'gear:research_boost': { owner: 'player' | 'ai'; amount: number };
  'gear:healer_pulse': { gearId: string; x: number; y: number; radius: number; owner: 'player' | 'ai' };

  // Spectate events
  'spectate:switch_view': { owner: 'player' | 'ai' };
}
