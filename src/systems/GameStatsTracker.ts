import { EventBus } from './EventBus';
import { EconomySystem } from './EconomySystem';
import { WinConditionSystem } from './WinConditionSystem';
import { TechSystem } from './TechSystem';
import { TECH_NODES } from '../constants/tech.constants';
import { StatSnapshot, TechSnapshot, GameOverData } from '../types/stats.types';

const SNAPSHOT_INTERVAL_SEC = 15;

function categorizeTech(researched: Set<string>): TechSnapshot {
  let gear = 0, military = 0, economy = 0, defense = 0;
  for (const id of researched) {
    const node = TECH_NODES[id];
    if (!node) continue;
    if (node.column === 0) gear++;
    else if (node.column === 1) military++;
    else if (node.column === 2) economy++;
    else defense++;
  }
  return { total: researched.size, gear, military, economy, defense };
}

/**
 * Records periodic snapshots of game state for the post-game stats screen.
 * Tracks both player and AI stats.
 */
export class GameStatsTracker {
  private snapshots: StatSnapshot[] = [];
  private lastSnapshotSec = -SNAPSHOT_INTERVAL_SEC; // force immediate first snapshot
  private readonly gameStartTime: number;

  // Cumulative event-driven counters
  private playerUnitByType: Record<string, number> = {};
  private aiUnitByType: Record<string, number> = {};
  private playerGearsPlaced = 0;
  private aiGearsPlaced = 0;
  private playerGearsLost = 0;
  private aiGearsLost = 0;
  private playerUnitsLost = 0;
  private aiUnitsLost = 0;
  private playerTechResearched = 0;
  private aiTechResearched = 0;

  private readonly onUnitSpawned: (d: { unit: { owner: string; type: string } }) => void;
  private readonly onUnitDied: (d: { owner: string }) => void;
  private readonly onGearPlaced: (d: { gear: { owner: string } }) => void;
  private readonly onGearDestroyed: (d: { owner: string }) => void;
  private readonly onTechComplete: (d: { owner: string }) => void;
  private readonly onBaseDamaged: () => void;

  constructor(
    private readonly eventBus: EventBus,
    private readonly economySystem: EconomySystem,
    private readonly winSystem: WinConditionSystem,
    private readonly techSystem: TechSystem,
    gameStartTime: number,
  ) {
    this.gameStartTime = gameStartTime;

    this.onUnitSpawned = ({ unit }) => {
      const map = unit.owner === 'player' ? this.playerUnitByType : this.aiUnitByType;
      map[unit.type] = (map[unit.type] ?? 0) + 1;
    };
    this.onUnitDied = ({ owner }) => {
      if (owner === 'player') this.playerUnitsLost++;
      else this.aiUnitsLost++;
    };
    this.onGearPlaced = ({ gear }) => {
      if (gear.owner === 'player') this.playerGearsPlaced++;
      else this.aiGearsPlaced++;
    };
    this.onGearDestroyed = ({ owner }) => {
      if (owner === 'player') this.playerGearsLost++;
      else this.aiGearsLost++;
    };
    this.onTechComplete = ({ owner }) => {
      if (owner === 'player') this.playerTechResearched++;
      else this.aiTechResearched++;
    };
    this.onBaseDamaged = () => {
      // Take a snapshot on each base hit for precise HP tracking
      this.takeSnapshot((Date.now() - this.gameStartTime) / 1000);
    };

    eventBus.on('unit:spawned',         this.onUnitSpawned);
    eventBus.on('unit:died',            this.onUnitDied);
    eventBus.on('gear:placed',          this.onGearPlaced);
    eventBus.on('gear:destroyed',       this.onGearDestroyed);
    eventBus.on('tech:research_complete', this.onTechComplete);
    eventBus.on('combat:base_damaged',  this.onBaseDamaged);

    // First snapshot
    this.takeSnapshot(0);
  }

  /** Call every game frame from GameScene.update() */
  tick(now: number): void {
    const gameTimeSec = (now - this.gameStartTime) / 1000;
    if (gameTimeSec - this.lastSnapshotSec >= SNAPSHOT_INTERVAL_SEC) {
      this.takeSnapshot(gameTimeSec);
    }
  }

  /** Force a final snapshot (call at game over before reading data) */
  forceSnapshot(now: number): void {
    this.takeSnapshot((now - this.gameStartTime) / 1000);
  }

  buildGameOverData(winner: 'player' | 'ai', reason: string, difficulty: string): GameOverData {
    const pTot = Object.values(this.playerUnitByType).reduce((s, v) => s + v, 0);
    const aTot = Object.values(this.aiUnitByType).reduce((s, v) => s + v, 0);
    return {
      winner, reason, difficulty,
      snapshots: this.snapshots,
      playerGearsPlaced: this.playerGearsPlaced,
      aiGearsPlaced: this.aiGearsPlaced,
      playerGearsLost: this.playerGearsLost,
      aiGearsLost: this.aiGearsLost,
      // killed = opponent's lost
      playerUnitsKilled: this.aiUnitsLost,
      aiUnitsKilled: this.playerUnitsLost,
      playerUnitsLost: this.playerUnitsLost,
      aiUnitsLost: this.aiUnitsLost,
      playerTechResearched: this.playerTechResearched,
      aiTechResearched: this.aiTechResearched,
      // store totals on last snapshot so GameOverScene can reference them
    } as GameOverData;
    void pTot; void aTot;
  }

  destroy(): void {
    this.eventBus.off('unit:spawned',           this.onUnitSpawned);
    this.eventBus.off('unit:died',              this.onUnitDied);
    this.eventBus.off('gear:placed',            this.onGearPlaced);
    this.eventBus.off('gear:destroyed',         this.onGearDestroyed);
    this.eventBus.off('tech:research_complete', this.onTechComplete);
    this.eventBus.off('combat:base_damaged',    this.onBaseDamaged);
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private takeSnapshot(timeSec: number): void {
    // Deduplicate snapshots at the same time (base_damaged fires quickly)
    const last = this.snapshots[this.snapshots.length - 1];
    if (last && Math.abs(last.time - timeSec) < 1) {
      // Update the last snapshot in-place rather than adding a duplicate
      Object.assign(last, this.buildSnapshotData(timeSec));
      return;
    }
    this.lastSnapshotSec = timeSec;
    this.snapshots.push(this.buildSnapshotData(timeSec));
  }

  private buildSnapshotData(timeSec: number): StatSnapshot {
    const pRes = this.economySystem.getResources('player');
    const aRes = this.economySystem.getResources('ai');
    const pTechState = this.techSystem.getPlayerTech();
    const aTechState = this.techSystem.getAITech();
    const pTotal = Object.values(this.playerUnitByType).reduce((s, v) => s + v, 0);
    const aTotal = Object.values(this.aiUnitByType).reduce((s, v) => s + v, 0);

    return {
      time: Math.round(timeSec),
      playerHp:    this.winSystem.getHp('player'),
      aiHp:        this.winSystem.getHp('ai'),
      playerMaxHp: this.winSystem.getMaxHp('player'),
      aiMaxHp:     this.winSystem.getMaxHp('ai'),
      playerResources: { gold: pRes.gold, iron: pRes.iron, crystal: pRes.crystal, aether: pRes.aether },
      aiResources:     { gold: aRes.gold, iron: aRes.iron, crystal: aRes.crystal, aether: aRes.aether },
      playerTech: categorizeTech(pTechState.researched),
      aiTech:     categorizeTech(aTechState.researched),
      playerUnitTotal: pTotal,
      aiUnitTotal:     aTotal,
      playerUnitByType: { ...this.playerUnitByType },
      aiUnitByType:     { ...this.aiUnitByType },
    };
  }
}
