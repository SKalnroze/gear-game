import { AIDecision, AIDebugState, AIStrategyProfile, AIPersonality, ThreatLevel } from '../types/ai.types';
import { UnitState, UnitType } from '../types/unit.types';
import { GearState, GearType } from '../types/gear.types';
import { EventBus } from '../systems/EventBus';
import { GearSystem } from '../systems/GearSystem';
import { EconomySystem } from '../systems/EconomySystem';
import { WinConditionSystem } from '../systems/WinConditionSystem';
import { World } from '../world/World';
import { GearMeshGraph } from '../world/GearMeshGraph';
import { GameClock, NEVER } from '../systems/GameClock';
import { isOwnerOnRight } from '../systems/unit.utils';
import { AIChainPlanner, AIPlacementContext } from './AIChainPlanner';
import type { AIChainPlan, ChainRole } from './AIChainPlanner';
import { AIResearchPlan } from './AIResearchPlan';
import { AIAbilityContext, AIAbilityHandler, AI_ABILITY_HANDLERS } from './AIAbilityEvaluator';
import { AIActionBudget } from './AIActionBudget';
import { computePosture, roleCapFromPosture, StrategicPosture } from './AIStrategicPlanner';
import { AbilitySystem } from '../systems/AbilitySystem';
import { AI_POLL_INTERVAL, AI_APM, AI_ACTION_BUDGET_CAPACITY, gearPlacementCost } from '../constants/balance.constants';
import { gearRadius } from '../constants/gear.constants';
import { TECH_NODES } from '../constants/tech.constants';
import { randomChoice } from '../utils/MathUtils';
import { byPhase, assessThreatLevel as assessThreatLevelPure } from './ai.utils';
import { RotationPhysicsSystem } from '../systems/RotationPhysicsSystem';
import { TechSystem } from '../systems/TechSystem';
import {
  AI_ZONE_MIN_X, WORLD_WIDTH, WORLD_HEIGHT,
  PLAYER_ZONE_MAX_X, LANE_Y_MIN, LANE_Y_MAX,
} from '../constants/world.constants';

// ThreatLevel is defined in ai.types.ts and re-exported for backwards compatibility
export type { ThreatLevel } from '../types/ai.types';

// byPhase imported from ai.utils

// ─── AIController ─────────────────────────────────────────────────────────────

/**
 * AI decision-making controller.
 *
 * Observes opponent unit composition to counter-pick spawner types.
 * Tracks base HP trends for threat-aware urgency.
 * Prioritises research by ROI (gold_mining_1 → basic_amplifier → counter techs).
 * Places chains front-biased (shorter unit travel to enemy base).
 *
 * Supports owner='ai' (right side) or owner='player' (left side, Spectate mode).
 * In 'practice' mode: does nothing.
 */
export class AIController {
  private eventBus: EventBus;
  private gearSystem: GearSystem;
  private economySystem: EconomySystem;
  private winSystem: WinConditionSystem;
  private rotationPhysics: RotationPhysicsSystem;
  private world: World;
  private meshGraph: GearMeshGraph;
  private techSystem: TechSystem | null = null;

  readonly owner: 'player' | 'ai';
  private strategyProfile: AIStrategyProfile;
  private personality: AIPersonality;
  private tickNumber: number = 0;

  private aiResearched: Set<string> = new Set();
  private aiResearchInProgress: boolean = false;

  // Chain planning
  private chainPlans: AIChainPlan[] = [];
  private researchPlan: AIResearchPlan = { prioritizedQueue: [], currentGoal: '', lastRebuildAt: 0 };
  // Role to assign to the next newly discovered chain plan (set before bootstrapping)
  private pendingNextRole: ChainRole = 'combat';

  // ─── Strategic layer ────────────────────────────────────────────────────────
  // The AI's actions-per-minute pool -- its actual difficulty axis (see
  // docs/design/units.md#the-ai-opponent). Every executed action spends
  // from it; it refills continuously at a difficulty-set rate.
  private actionBudget: AIActionBudget;
  private lastBudgetUpdateAt: number = 0;
  private lastPollAt: number = 0;
  // The strategic posture -- economy/defense/offense weights + chain
  // capacity, recomputed periodically from the match state. Tactical
  // decisions below (chain role, chain count) read this instead of a fixed
  // number baked in at match start.
  private posture: StrategicPosture = { economy: 1 / 3, defense: 1 / 3, offense: 1 / 3, capacity: 2 };
  private lastPostureAt: number = 0;
  private static readonly POSTURE_REBUILD_INTERVAL = 6000;
  /** This side's own AbilitySystem instance -- same class the player's UI activates, not a parallel tracker. */
  private abilitySystem: AbilitySystem | null = null;

  // Opponent observation: rolling 45-second window of enemy unit spawns
  private readonly opponentUnitWindow: Array<{ type: UnitType; at: number }> = [];

  // ─── Debug & ability ───────────────────────────────────────────────────────

  /** When true, logs every decision + reason to the browser console */
  private debugEnabled: boolean = false;

  /** Reason for the most recent decision (for overlay / console) */
  private lastDecisionReason: string = '';
  private lastDecisionType: import('../types/ai.types').AIDecisionType = 'idle';

  /** Last threat level seen — used to log transitions */
  private lastThreatLevel: ThreatLevel | null = null;

  /** Epoch when this controller was created — used for elapsed-time stamps in logs */
  private clock: GameClock;
  private startTime = 0;

  /** Expandable ability handler registry */
  private readonly abilityHandlers: AIAbilityHandler[] = [...AI_ABILITY_HANDLERS];

  // ─── Event handlers ────────────────────────────────────────────────────────

  private readonly onTechResearchComplete = ({ owner, nodeId }: { owner: 'player' | 'ai'; nodeId: string }) => {
    if (owner !== this.owner) return;
    this.aiResearched.add(nodeId);
    this.aiResearchInProgress = false;
    this.researchPlan.lastRebuildAt = 0; // force immediate rebuild
  };

  private readonly onTechResearchStarted = ({ owner }: { owner: 'player' | 'ai' }) => {
    if (owner === this.owner) this.aiResearchInProgress = true;
  };

  private readonly onUnitSpawned = ({ unit }: { unit: UnitState }) => {
    if (unit.owner === this.owner) return; // ignore own units
    this.opponentUnitWindow.push({ type: unit.type, at: this.clock.now });
    // Trim entries older than 45 seconds
    const cutoff = this.clock.now - 45000;
    let trimTo = 0;
    while (trimTo < this.opponentUnitWindow.length && this.opponentUnitWindow[trimTo].at < cutoff) trimTo++;
    if (trimTo > 0) this.opponentUnitWindow.splice(0, trimTo);
  };

  // ─── Constructor ──────────────────────────────────────────────────────────

  constructor(
    eventBus: EventBus,
    gearSystem: GearSystem,
    economySystem: EconomySystem,
    _unitSystem: unknown,   // kept for call-site compatibility
    winSystem: WinConditionSystem,
    rotationPhysics: RotationPhysicsSystem,
    world: World,
    meshGraph: GearMeshGraph,
    strategyProfile: AIStrategyProfile = 'medium',
    personality: AIPersonality | 'random' = 'random',
    techSystem?: TechSystem,
    owner: 'player' | 'ai' = 'ai',
    clock?: GameClock,
  ) {
    this.eventBus = eventBus;
    this.clock = clock ?? new GameClock();
    this.startTime = this.clock.now;
    this.gearSystem = gearSystem;
    this.economySystem = economySystem;
    this.winSystem = winSystem;
    this.rotationPhysics = rotationPhysics;
    this.world = world;
    this.meshGraph = meshGraph;
    this.strategyProfile = strategyProfile;
    const PERSONALITIES: AIPersonality[] = ['rusher', 'economist', 'turtle', 'balanced'];

    // personality parameter overrides random selection; 'random' defers to the
    // old behaviour.
    if (personality !== 'random') {
      this.personality = personality;
    } else {
      this.personality = strategyProfile === 'easy'
        ? 'balanced'
        : PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)];
    }

    console.log(`[AI:${owner}:${strategyProfile}] personality=${this.personality}`);
    this.techSystem = techSystem ?? null;
    this.owner = owner;

    this.actionBudget = new AIActionBudget(
      AI_APM[strategyProfile === 'practice' ? 'hard' : strategyProfile],
      AI_ACTION_BUDGET_CAPACITY,
    );

    // Auto-enable debug logging in practice mode (no real decisions — safe to be verbose)
    if (strategyProfile === 'practice') this.debugEnabled = true;

    this.eventBus.on('tech:research_complete', this.onTechResearchComplete);
    this.eventBus.on('tech:research_started', this.onTechResearchStarted);
    this.eventBus.on('unit:spawned', this.onUnitSpawned);
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /** Give this controller its own AbilitySystem instance -- same class the player's UI activates. */
  setAbilitySystem(abilitySystem: AbilitySystem): void {
    this.abilitySystem = abilitySystem;
  }

  setStrategy(profile: AIStrategyProfile): void {
    this.strategyProfile = profile;
    this.actionBudget.setApm(AI_APM[profile === 'practice' ? 'hard' : profile]);
    this.researchPlan.lastRebuildAt = 0;
    this.eventBus.emit('ai:strategy_changed', { strategy: profile });
  }

  /** Toggle verbose console logging for this controller */
  setDebugEnabled(v: boolean): void {
    this.debugEnabled = v;
  }

  /**
   * Change the AI personality mid‑game. Use 'random' to re-roll.
   */
  setPersonality(p: AIPersonality | 'random'): void {
    if (p === 'random') {
      // re-roll using the same logic as constructor
      const PERSONALITIES: AIPersonality[] = ['rusher', 'economist', 'turtle', 'balanced'];
      this.personality = this.strategyProfile === 'easy'
        ? 'balanced'
        : PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)];
    } else {
      this.personality = p;
    }
  }

  isDebugEnabled(): boolean {
    return this.debugEnabled;
  }

  /**
   * Register a custom ability handler.
   * The handler will be evaluated every AI decision tick (2 s).
   * New abilities just implement AIAbilityHandler and call this.
   */
  registerAbilityHandler(handler: AIAbilityHandler): void {
    this.abilityHandlers.push(handler);
  }

  /** Full debug snapshot consumed by AIDebugOverlay */
  getDebugState(): AIDebugState {
    const threat = this.assessThreatLevel();
    const abilities = this.abilityHandlers
      .filter(h => h.requiredTech.every(t => this.aiResearched.has(t)))
      .map(h => ({
        id: h.abilityId,
        cooldownRemaining: this.abilitySystem?.getCooldownRemaining(h.abilityId as Parameters<AbilitySystem['getCooldownRemaining']>[0]) ?? 0,
      }));

    // Determine focus chain: earliest non-full phase in priority order
    const focusChainId = [...this.chainPlans].sort(byPhase).find(p => p.phase !== 'full')?.id ?? null;

    return {
      owner: this.owner,
      profile: this.strategyProfile,
      threat,
      gold: this.economySystem.getResources(this.owner).gold,
      researchGoal: this.researchPlan.currentGoal,
      chainCount: this.chainPlans.length,
      chainSummaries: this.chainPlans.map(p => {
        const totalCost = p.gearIds.reduce((sum, id) => {
          const gear = this.world.getGear(id);
          return sum + (gear ? gearPlacementCost(gear.teeth) : 0);
        }, 0);
        return {
          id: p.id,
          phase: p.phase,
          role: p.role,
          origin: { ...p.origin },
          gearCount: p.gearIds.length,
          totalCost: Math.round(totalCost),
          isFocus: p.id === focusChainId,
          stats: {
            motorCount:      p.stats.motorCount,
            amplifierCount:  p.stats.amplifierCount,
            spawnerTypes:    p.stats.spawnerTypes.map(String),
            researcherCount: p.stats.researcherCount,
            capacitorCount:  p.stats.capacitorCount,
            minerCount:      p.stats.minerCount,
            healerCount:     p.stats.healerCount,
            spikedCount:     p.stats.spikedCount,
            armoredCount:    p.stats.armoredCount,
            overclockCount:  p.stats.overclockCount,
            turretCount:     p.stats.turretCount,
          },
        };
      }),
      lastDecisionReason: this.lastDecisionReason,
      lastDecisionType:   this.lastDecisionType,
      abilities,
      personality: this.personality,
    };
  }

  update(now: number): void {
    if (now - this.lastPollAt < AI_POLL_INTERVAL) return;
    const deltaMs = this.lastBudgetUpdateAt > 0 ? now - this.lastBudgetUpdateAt : 0;
    this.lastBudgetUpdateAt = now;
    this.lastPollAt = now;
    this.actionBudget.regen(deltaMs);
    this.tickNumber++;

    this.maybeRebuildPosture(now);

    if (this.strategyProfile === 'practice') {
      // Practice mode: analyse world state for the debug overlay but don't execute.
      if (this.debugEnabled) {
        this.chainPlans = AIChainPlanner.syncPlans(
          this.chainPlans, this.owner, this.world, this.meshGraph, this.rotationPhysics,
        );
        const decision = this.makeDecision();
        this.log(`[PRACTICE/DRY-RUN] would: ${decision.reason ?? decision.type}`);
      }
      return;
    }

    // Every executed action spends from the action budget -- how much the AI
    // can actually get done this poll is bounded by APM, not by whether it
    // "noticed" a good move exists. Idle decisions are free (there was
    // nothing to spend on).
    if (this.actionBudget.canAfford(1)) {
      const decision = this.makeDecision();
      this.eventBus.emit('ai:decision_made', { decision });
      this.executeDecision(decision);
      if (decision.type !== 'idle') this.actionBudget.spend(1);
    }

    this.maybeRebuildResearchPlan();
    if (this.actionBudget.canAfford(1) && this.tryAutoResearch()) this.actionBudget.spend(1);
    if (this.actionBudget.canAfford(1) && this.tryUseAbilities(now)) this.actionBudget.spend(1);
  }

  /** Recompute the strategic posture every POSTURE_REBUILD_INTERVAL from a read of the current match. */
  private maybeRebuildPosture(now: number): void {
    if (this.strategyProfile === 'practice') return;
    if (now - this.lastPostureAt < AIController.POSTURE_REBUILD_INTERVAL) return;
    this.lastPostureAt = now;
    const prevCapacity = this.posture.capacity;
    this.posture = computePosture({
      personality: this.personality,
      threat: this.assessThreatLevel(),
      goldPerSec: this.economySystem.getGoldPerSec(this.owner),
      matchElapsedMs: this.clock.now - this.startTime,
      profile: this.strategyProfile,
    });
    if (this.posture.capacity !== prevCapacity) {
      this.log(`POSTURE: capacity ${prevCapacity} → ${this.posture.capacity}  eco=${(this.posture.economy * 100).toFixed(0)}% def=${(this.posture.defense * 100).toFixed(0)}% off=${(this.posture.offense * 100).toFixed(0)}%`);
    }
  }

  destroy(): void {
    this.eventBus.off('tech:research_complete', this.onTechResearchComplete);
    this.eventBus.off('tech:research_started', this.onTechResearchStarted);
    this.eventBus.off('unit:spawned', this.onUnitSpawned);
  }

  // ─── Opponent observation ─────────────────────────────────────────────────

  private get opponent(): 'player' | 'ai' {
    return this.owner === 'ai' ? 'player' : 'ai';
  }

  /**
   * Returns the most-sent enemy unit type in the last 30 seconds.
   * Falls back to 'infantry' when data is sparse.
   */
  private getDominantOpponentUnit(): string {
    const recent = this.opponentUnitWindow.filter(e => this.clock.now - e.at < 30000);
    if (recent.length < 3) return 'infantry';
    const counts = new Map<string, number>();
    for (const { type } of recent) counts.set(type, (counts.get(type) ?? 0) + 1);
    let dominant = 'infantry', max = 0;
    for (const [t, c] of counts) if (c > max) { dominant = t; max = c; }
    return dominant;
  }

  /**
   * Returns the spawner type that counters the opponent's dominant unit.
   * Counter table (rock-paper-scissors):
   *   infantry → cavalry beats infantry
   *   cavalry  → artillery beats cavalry
   *   artillery → infantry beats artillery (default)
   */
  private getCounterSpawnerType(): GearType {
    const dom = this.getDominantOpponentUnit();
    let chosen: GearType = 'infantry_spawner';
    let reason = 'default';

    if ((dom === 'infantry' || dom === 'elite_infantry') && this.aiResearched.has('unlock_cavalry_spawner')) {
      chosen = 'cavalry_spawner'; reason = `counter ${dom}`;
    } else if ((dom === 'cavalry' || dom === 'elite_cavalry') && this.aiResearched.has('unlock_artillery_spawner')) {
      chosen = 'artillery_spawner'; reason = `counter ${dom}`;
    } else if (this.strategyProfile === 'hard' && this.aiResearched.has('unlock_cavalry_spawner')) {
      chosen = 'cavalry_spawner'; reason = 'hard default';
    }

    if (this.opponentUnitWindow.length >= 3) {
      this.logThrottled(`counter-pick: dominant=${dom} (${this.opponentUnitWindow.length} seen) → ${chosen}  (${reason})`);
    }
    return chosen;
  }

  /** Classify current game state by urgency. Uses percentage so base HP buffs from tech scale correctly. */
  private assessThreatLevel(): ThreatLevel {
    return assessThreatLevelPure(
      this.winSystem.getHp(this.owner),
      this.winSystem.getMaxHp(this.owner),
      this.winSystem.getHp(this.opponent),
      this.winSystem.getMaxHp(this.opponent),
    );
  }

  // ─── Debug helpers ────────────────────────────────────────────────────────

  /** Stamp a decision with a reason, log it, and store for the overlay */
  private withReason(decision: AIDecision, reason: string): AIDecision {
    this.lastDecisionReason = reason;
    this.lastDecisionType   = decision.type;
    // Actual decisions (gear placed / repositioned) always log.
    // Idle/waiting states are throttled — they happen every 2 s and would flood the console.
    if (decision.type !== 'idle') {
      this.log(reason);
    } else {
      this.logThrottled(reason);
    }
    return { ...decision, reason };
  }

  /** Elapsed seconds since this controller was created (for log timestamps) */
  private ts(): string {
    return `T+${((this.clock.now - this.startTime) / 1000).toFixed(1)}s`;
  }

  /** Console log — action events (always shown when debug enabled) */
  private log(msg: string): void {
    if (!this.debugEnabled) return;
    const gold = this.economySystem.getResources(this.owner).gold.toFixed(0);
    const style = this.owner === 'ai' ? 'color:#ff9988;font-weight:bold' : 'color:#88aaff;font-weight:bold';
    console.log(
      `%c[AI:${this.owner}:${this.strategyProfile}|${this.ts()}] ${msg}  |  gold=${gold}g  chains=${this.chainPlans.length}`,
      style,
    );
  }

  /**
   * True when this controller's side holds the right half of the map.
   * Derived from the world, not from the owner label: with the lobby's slot
   * flip an AI can be the 'player' owner and still be on the right, and every
   * zone/front/back computation below depends on the half, not the name.
   */
  /** This controller's own tech state, not always the AI-side one. */
  private ownTech() {
    if (!this.techSystem) return null;
    return this.owner === 'player' ? this.techSystem.getPlayerTech() : this.techSystem.getAITech();
  }

  private get onRight(): boolean {
    return isOwnerOnRight(this.owner, this.world.isPlayerOnRight());
  }

  /** Rate-limited log — status/idle messages shown at most once per 8 s */
  private lastStatusLogAt = 0;
  private logThrottled(msg: string): void {
    if (!this.debugEnabled) return;
    const now = this.clock.now;
    if (now - this.lastStatusLogAt < 8000) return;
    this.lastStatusLogAt = now;
    const gold = this.economySystem.getResources(this.owner).gold.toFixed(0);
    const style = this.owner === 'ai' ? 'color:#886655' : 'color:#556688';
    console.log(
      `%c[AI:${this.owner}|${this.ts()}] ${msg}  |  gold=${gold}g`,
      style,
    );
  }

  // ─── Ability evaluation ───────────────────────────────────────────────────

  /**
   * Evaluate all registered ability handlers and fire any that are ready.
   * Called once per decision tick after the main decision is executed.
   *
   * To add a new AI ability:
   *   1. Implement AIAbilityHandler in AIAbilityEvaluator.ts
   *   2. Push it into AI_ABILITY_HANDLERS (or call registerAbilityHandler())
   */
  /**
   * Evaluate ability handlers and fire the first one ready to go. Gated on
   * this side's own AbilitySystem -- the same unlock/cooldown state a
   * human's ACTIONS-tab click reads, not a parallel tracker. Returns true
   * if an ability actually fired (spends an action-budget point).
   */
  private tryUseAbilities(_now: number): boolean {
    if (!this.abilitySystem) return false;
    const myMaxHp  = this.winSystem.getMaxHp(this.owner);
    const oppMaxHp = this.winSystem.getMaxHp(this.opponent);
    const ctx: AIAbilityContext = {
      threat:         this.assessThreatLevel(),
      gold:           this.economySystem.getResources(this.owner).gold,
      chainsWaiting:  this.chainPlans.filter(p => p.phase !== 'full').length,
      allChainsFull:  this.chainPlans.length > 0 && this.chainPlans.every(p => p.phase === 'full'),
      myHpPct:        myMaxHp  > 0 ? this.winSystem.getHp(this.owner)     / myMaxHp  : 1,
      oppHpPct:       oppMaxHp > 0 ? this.winSystem.getHp(this.opponent)  / oppMaxHp : 1,
      aiResearched:   this.aiResearched,
    };

    for (const handler of this.abilityHandlers) {
      const abilityId = handler.abilityId as import('../types/ability.types').AbilityId;
      if (!this.abilitySystem.canActivate(abilityId)) continue; // unlocked + off cooldown, per the real system

      if (!handler.shouldUse(ctx)) {
        if (this.debugEnabled) this.logThrottled(`ability skip: ${handler.reason(ctx)}`);
        continue;
      }

      if (this.abilitySystem.activate(abilityId)) {
        this.log(`ABILITY FIRED: ${handler.reason(ctx)}`);
        return true;
      }
    }
    return false;
  }

  // ─── Decision making ──────────────────────────────────────────────────────

  private makeDecision(): AIDecision {
    const threat = this.assessThreatLevel();

    // Log threat level transitions
    if (threat !== this.lastThreatLevel) {
      const myHp    = this.winSystem.getHp(this.owner);
      const myMaxHp = this.winSystem.getMaxHp(this.owner);
      const oppHp   = this.winSystem.getHp(this.opponent);
      const oppMaxHp= this.winSystem.getMaxHp(this.opponent);
      const myPct   = myMaxHp  > 0 ? (myHp  / myMaxHp  * 100).toFixed(0) : '?';
      const oppPct  = oppMaxHp > 0 ? (oppHp / oppMaxHp * 100).toFixed(0) : '?';
      this.log(`THREAT: ${this.lastThreatLevel ?? 'init'} → ${threat}  (myHp=${myPct}%  oppHp=${oppPct}%)`);
      this.lastThreatLevel = threat;
    }

    const gold = this.economySystem.getResources(this.owner).gold;

    // Budget gate: reserve gold for the next queued research node before placing gears.
    // If what's left after the reserve can't afford even the cheapest gear, idle this tick
    // so tryAutoResearch() can spend the gold on research instead.
    // Emergency override: when the AI has NO active spawner in any chain, skip the reserve
    // entirely so gold goes straight toward rebuilding unit production capacity.
    // Cap: never reserve more than 40g — prevents expensive late-game nodes from
    // freezing all gear placement while income slowly trickles in.
    if (this.strategyProfile !== 'easy') {
      const hasAnySpawner = this.chainPlans.some(p => p.stats.spawnerTypes.length > 0);
      // Cap reserve at 20g so expensive research nodes (40-45g) don't block gear building
      // for 30-50s. The AI can still accumulate toward research while placing gears.
      const researchReserve = hasAnySpawner ? Math.min(this.getNextResearchCost(), 20) : 0;
      const spendable = gold - researchReserve;
      if (spendable < this.getGearPlacementCost(10) && threat !== 'critical') {
        const reason = researchReserve > 0
          ? `budget: ${gold.toFixed(0)}g held — ${researchReserve}g reserved for "${this.researchPlan.currentGoal}"`
          : `insufficient gold (${gold.toFixed(0)}g) for cheapest gear`;
        return this.withReason({ type: 'idle' }, reason);
      }
    }

    // Capture existing plan IDs + phases before sync so we can detect changes
    const prevPlanIds = new Set(this.chainPlans.map(p => p.id));
    const prevPhases  = new Map(this.chainPlans.map(p => [p.id, p.phase]));

    // Sync chain plans with world reality
    this.chainPlans = AIChainPlanner.syncPlans(
      this.chainPlans, this.owner, this.world, this.meshGraph, this.rotationPhysics,
    );

    // Assign pendingNextRole to any plans that appeared this tick (the motor we just bootstrapped)
    for (const plan of this.chainPlans) {
      if (!prevPlanIds.has(plan.id)) {
        plan.role = this.pendingNextRole;
        this.pendingNextRole = 'combat'; // reset — next bootstrap defaults to combat
        this.log(`CHAIN NEW: [${plan.role}] id=${plan.id.slice(-6)} at (${plan.origin.x.toFixed(0)},${plan.origin.y.toFixed(0)})`);
      }
    }

    // Log chain phase transitions
    for (const plan of this.chainPlans) {
      const prev = prevPhases.get(plan.id);
      if (prev && prev !== plan.phase) {
        this.log(`CHAIN PHASE: [${plan.role}:${plan.id.slice(-6)}] ${prev} → ${plan.phase}  gears=${plan.gearIds.length}`);
      }
    }

    const hasAnySpawner     = this.chainPlans.some(p => p.stats.spawnerTypes.length > 0);
    const preferredSpawnerType = this.getCounterSpawnerType();
    const context: AIPlacementContext = { threatLevel: threat, preferredSpawnerType, hasAnySpawner, spawnReserveMult: this.getPersonalitySpawnMult() };

    // Sort: bootstrap > spawn > amplify > support > expand > full
    // Economy chains are deprioritised vs combat chains at the same phase
    const sorted = [...this.chainPlans].sort(byPhase);

    // A chain is "immature" while it has no spawner yet (bootstrap or spawn phase).
    // We wait for spawner placement before bootstrapping the next chain so gold
    // isn't split across multiple chains that are all starved simultaneously.
    // Only count COMBAT chains — economy/defense chains are permanently in 'spawn'
    // and would otherwise block new chain bootstrapping forever.
    const combatChains = this.chainPlans.filter(p => p.role === 'combat');
    const hasImmatureChain = combatChains.some(p =>
      p.phase === 'bootstrap' || p.phase === 'spawn',
    );

    // Bootstrap a new chain BEFORE doing expand-phase work on existing ones.
    // When every combat chain is in expand/full phase, we have spare capacity — start the
    // next chain now rather than piling more motors into chains that are already running.
    const allChainsMature = combatChains.length > 0
      && combatChains.every(p => p.phase === 'expand' || p.phase === 'full');

    if ((allChainsMature || !hasImmatureChain) && this.chainPlans.length < this.posture.capacity) {
      const nextRole = this.determineNextChainRole();
      const origin = nextRole === 'economy'
        ? this.pickEconomyChainOrigin()
        : nextRole === 'defense'
          ? this.pickDefenseChainOrigin()
          : this.pickNewChainOrigin();

      if (origin) {
        this.pendingNextRole = nextRole; // assign on next syncPlans when the motor is found
        const result = this.bootstrapNewChain(origin);
        if (result) {
          return this.withReason(
            result,
            `bootstrap new ${nextRole} chain at (${origin.x.toFixed(0)},${origin.y.toFixed(0)})`,
          );
        }
        this.pendingNextRole = 'combat'; // bootstrapNewChain failed — reset
      } else {
        this.logThrottled(`want new ${nextRole} chain but no valid origin found`);
      }
    } else if (hasImmatureChain && !allChainsMature) {
      this.logThrottled(`holding new chain bootstrap — immature chain in progress`);
    } else if (this.chainPlans.length >= this.posture.capacity) {
      this.logThrottled(`at chain cap (${this.chainPlans.length}/${this.posture.capacity})`);
    }

    // Develop existing chains (bootstrap/spawn/amplify/support take priority via byPhase sort;
    // expand-phase work runs after any new chain has been started above)
    for (const chain of sorted) {
      if (chain.phase === 'full' || AIChainPlanner.isChainFull(chain, this.owner, this.world)) {
        chain.phase = 'full';
        continue;
      }

      const unlockedTeeth = this.ownTech()?.unlockedTeeth ?? [10];
      const addition = AIChainPlanner.findBestAddition(
        chain, this.strategyProfile, this.owner,
        this.world, this.meshGraph, this.economySystem,
        this.aiResearched, unlockedTeeth, context,
      );
      if (addition) {
        return this.withReason(
          { type: 'place_gear', ...addition },
          `[${chain.role}:${chain.phase}] add ${addition.gearType}(${addition.teeth}t) at (${addition.x.toFixed(0)},${addition.y.toFixed(0)})`,
        );
      }
    }

    // Sell excess motors in defense chains when better defensive gear is available.
    // Medium+hard only -- recognising a gear as obsolete and acting on it is a
    // skill-gated judgment call, same spirit as the placement-quality gating below.
    if (this.strategyProfile !== 'easy' && Math.random() < (this.strategyProfile === 'hard' ? 0.30 : 0.15)) {
      const recycle = this.decideChainRecycle();
      if (recycle.type !== 'idle') return recycle;
    }

    // Reposition isolated gears to connect them to the cluster.
    if (this.strategyProfile !== 'easy' && Math.random() < (this.strategyProfile === 'hard' ? 0.15 : 0.08)) {
      const reposition = this.decideReposition();
      if (reposition.type !== 'idle') {
        return this.withReason(reposition, `reposition isolated gear → connect to cluster`);
      }
    }

    return this.withReason({ type: 'idle' }, `all chains at phase=${sorted.map(c => c.phase).join(',') || 'none'} — waiting`);
  }

  /**
   * Decide what role the next new chain should play.
   *
   * Priority order (after ensuring a combat chain is spawning):
   *   1. economy — income amplification (once tech available, up to cap)
   *   2. defense — in-lane physical barrier (hard always; others with tech or under threat)
   *   3. combat  — default
   */
  private determineNextChainRole(): ChainRole {
    if (this.strategyProfile === 'easy') return 'combat';

    // A combat chain must have its spawner placed (past 'spawn' phase) before we
    // divert gold to economy/defense chains.
    const hasSpawningCombatChain = this.chainPlans.some(
      p => p.role === 'combat' && p.phase !== 'bootstrap' && p.phase !== 'spawn',
    );
    if (!hasSpawningCombatChain) return 'combat';

    // Under critical threat: more unit output is the only useful emergency response.
    // Defense chains without tech are immediately destroyed; economy chains take too long to pay off.
    // Redirect to a second/third combat chain to flood units and relieve pressure.
    const threat = this.assessThreatLevel();
    if (threat === 'critical') {
      const combatCount = this.chainPlans.filter(p => p.role === 'combat').length;
      if (combatCount < this.posture.capacity) return 'combat';
    }

    // Rusher: build 2 combat chains before diversifying
    if (this.personality === 'rusher') {
      const combatCount = this.chainPlans.filter(p => p.role === 'combat').length;
      if (combatCount < 2) return 'combat';
    }

    // Economy chains: only start when iron mining is available so the chain can actually mine.
    // basic_amplifier alone isn't enough — a chain with just motor+amplifier+researcher
    // contributes very little that the combat chains don't already cover.
    const hasEconomyTech = this.aiResearched.has('unlock_iron_mining')
      || this.aiResearched.has('unlock_crystal_mining');
    const economyChainCount = this.chainPlans.filter(p => p.role === 'economy').length;
    const maxEconomyChains = roleCapFromPosture(this.posture, this.posture.economy, 1);
    if (this.personality !== 'turtle' && hasEconomyTech && economyChainCount < maxEconomyChains) return 'economy';

    // Defense chains: only build when we actually have defensive gear tech.
    // A chain with nothing but motors in the lane is not a defense — it's a gold sink;
    // enemy units destroy lone motors in seconds, then the AI re-bootstraps in an endless loop.
    const defenseChainCount = this.chainPlans.filter(p => p.role === 'defense').length;
    const maxDefenseChains = roleCapFromPosture(this.posture, this.posture.defense, 1);
    if (defenseChainCount < maxDefenseChains) {
      const hasDefenseTech = this.aiResearched.has('crossbow_turret_tech')
        || this.aiResearched.has('spiked_gears')
        || this.aiResearched.has('armored_gears');
      // Only build a defense chain if it can have real defensive content.
      // Turtle personality always builds defense regardless (it's their identity).
      if (hasDefenseTech || this.personality === 'turtle') {
        return 'defense';
      }
    }

    // Turtle: economy after defense
    if (this.personality === 'turtle' && hasEconomyTech && economyChainCount < maxEconomyChains) return 'economy';

    return 'combat';
  }

  /**
   * Pick an origin for an economy chain — placed in the back 35% of the zone
   * (safer from enemy units, which always approach from the front).
   */
  private pickEconomyChainOrigin(): { x: number; y: number } | null {
    const MIN_ORIGIN_DIST = 200;

    const zoneMinX = this.onRight ? AI_ZONE_MIN_X + 60 : 60;
    const zoneMaxX = this.onRight ? WORLD_WIDTH - 60 : PLAYER_ZONE_MAX_X - 60;
    const zoneW = zoneMaxX - zoneMinX;

    // Back 35%: for AI (right side) that's the right portion; for player it's the left portion
    const backStart = this.onRight ? zoneMinX + zoneW * 0.65 : zoneMinX;
    const backEnd   = this.onRight ? zoneMaxX                 : zoneMinX + zoneW * 0.35;
    const backW = backEnd - backStart;

    for (let i = 0; i < 12; i++) {
      const x = backStart + Math.random() * backW;
      const y = 80 + Math.random() * (WORLD_HEIGHT - 160);
      if (this.isOriginFarEnough(x, y, MIN_ORIGIN_DIST)) return { x, y };
    }
    return null;
  }

  /**
   * Pick an origin for a defense chain — placed IN the unit lane, front 55% of zone,
   * so gears form a physical barrier that enemy units must fight through.
   */
  private pickDefenseChainOrigin(): { x: number; y: number } | null {
    const MIN_ORIGIN_DIST = 180;
    const laneCenter = (LANE_Y_MIN + LANE_Y_MAX) / 2;
    const laneSpread = (LANE_Y_MAX - LANE_Y_MIN) * 0.75;

    const zoneMinX = this.onRight ? AI_ZONE_MIN_X + 60 : 60;
    const zoneMaxX = this.onRight ? WORLD_WIDTH - 60 : PLAYER_ZONE_MAX_X - 60;
    const zoneW = zoneMaxX - zoneMinX;

    // Front 55% of zone (toward enemy)
    const frontStart = this.onRight ? zoneMinX : zoneMinX + zoneW * 0.45;
    const frontW = zoneW * 0.55;

    for (let i = 0; i < 14; i++) {
      const x = frontStart + Math.random() * frontW;
      const y = laneCenter + (Math.random() - 0.5) * laneSpread;
      if (this.isOriginFarEnough(x, y, MIN_ORIGIN_DIST)) return { x, y };
    }
    return null;
  }

  /** Place the first motor of a brand-new chain near the given origin. */
  private bootstrapNewChain(origin: { x: number; y: number }): AIDecision | null {
    const unlocked = this.ownTech()?.unlockedTeeth ?? [10];
    const profileMax = this.strategyProfile === 'hard' ? 30 : this.strategyProfile === 'medium' ? 15 : 10;
    const teethList = [...unlocked].filter(t => t <= profileMax).sort((a, b) => b - a);
    if (teethList.length === 0) teethList.push(10);

    for (const t of teethList) {
      if (!this.economySystem.canAffordGold(this.owner, this.getGearPlacementCost(t))) continue;
      const pos = this.findPlacementNear(origin.x, origin.y, t);
      if (pos) return { type: 'place_gear', gearType: 'motor', teeth: t, x: pos.x, y: pos.y };
    }
    return null;
  }

  private findPlacementNear(cx: number, cy: number, teeth: number): { x: number; y: number } | null {
    if (this.world.canPlace(cx, cy, teeth, this.owner)) return { x: cx, y: cy };
    const r = gearRadius(teeth);
    for (let a = 0; a < 16; a++) {
      const angle = (a / 16) * Math.PI * 2;
      const x = cx + Math.cos(angle) * r * 2.5;
      const y = cy + Math.sin(angle) * r * 2.5;
      if (this.world.canPlace(x, y, teeth, this.owner)) return { x, y };
    }
    return null;
  }

  /**
   * Pick origin for a new chain.
   *
   * For the AI (right side of map), the "front" is the LEFT edge of the AI zone
   * (closest to the player). Chains placed here minimise unit travel distance.
   *
   * - easy:   random across full zone
   * - medium: front 60% of zone, lane-centred y
   * - hard:   5 slices within front 65%, each chain in its own depth band
   */
  private pickNewChainOrigin(): { x: number; y: number } | null {
    const MIN_ORIGIN_DIST = 250;
    const laneY = (LANE_Y_MIN + LANE_Y_MAX) / 2;

    const zoneMinX = this.onRight ? AI_ZONE_MIN_X + 60 : 60;
    const zoneMaxX = this.onRight ? WORLD_WIDTH - 60 : PLAYER_ZONE_MAX_X - 60;
    const zoneW = zoneMaxX - zoneMinX;

    if (this.strategyProfile === 'easy') {
      for (let i = 0; i < 10; i++) {
        const x = zoneMinX + Math.random() * zoneW;
        const y = 80 + Math.random() * (WORLD_HEIGHT - 160);
        if (this.isOriginFarEnough(x, y, MIN_ORIGIN_DIST)) return { x, y };
      }
    } else if (this.strategyProfile === 'medium') {
      for (let i = 0; i < 14; i++) {
        const xRangeRatio = i < 9 ? 0.6 : 1.0; // first 9 tries favour front
        const x = zoneMinX + Math.random() * zoneW * xRangeRatio;
        // 40% chance to prefer off-lane (above or below), rest near lane
        const y = Math.random() < 0.40
          ? (Math.random() < 0.5
              ? LANE_Y_MIN - 20 - Math.random() * 70   // above lane
              : LANE_Y_MAX + 20 + Math.random() * 70)  // below lane
          : laneY + (Math.random() - 0.5) * 110;
        if (this.isOriginFarEnough(x, y, MIN_ORIGIN_DIST)) return { x, y };
      }
    } else {
      // Hard: evenly spaced within front 65% of zone, strongly prefer off-lane
      const activeBandW = zoneW * 0.65;
      const sliceW = activeBandW / this.posture.capacity;
      const chainIndex = this.chainPlans.length;
      const sliceStart = zoneMinX + chainIndex * sliceW;

      for (let i = 0; i < 12; i++) {
        const x = sliceStart + Math.random() * sliceW;
        // 55% off-lane (above or below), 45% near lane as fallback
        const y = Math.random() < 0.55
          ? (Math.random() < 0.5
              ? LANE_Y_MIN - 30 - Math.random() * 80   // above lane
              : LANE_Y_MAX + 30 + Math.random() * 80)  // below lane
          : laneY + (Math.random() - 0.5) * 140;
        if (this.isOriginFarEnough(x, y, MIN_ORIGIN_DIST)) return { x, y };
      }
      // Fallback
      for (let i = 0; i < 10; i++) {
        const x = zoneMinX + Math.random() * zoneW;
        const y = 80 + Math.random() * (WORLD_HEIGHT - 160);
        if (this.isOriginFarEnough(x, y, MIN_ORIGIN_DIST)) return { x, y };
      }
    }
    return null;
  }

  private isOriginFarEnough(x: number, y: number, minDist: number): boolean {
    for (const plan of this.chainPlans) {
      const dx = x - plan.origin.x;
      const dy = y - plan.origin.y;
      if (Math.sqrt(dx * dx + dy * dy) < minDist) return false;
    }
    return true;
  }

  private getGearPlacementCost(teeth: number): number {
    return gearPlacementCost(teeth);
  }

  private decideReposition(): AIDecision {
    const myGears = this.world.getGearsOwnedBy(this.owner);
    const isolated = myGears.filter(g =>
      this.meshGraph.getNeighbors(g.id).length === 0 && !this.gearSystem.isOnCooldown(g.id),
    );
    if (isolated.length === 0) return { type: 'idle' };

    const connected = myGears.filter(g => this.meshGraph.getNeighbors(g.id).length > 0);
    if (connected.length === 0) return { type: 'idle' };

    const target = randomChoice(isolated);
    const anchor = randomChoice(connected);
    const targetRadius = gearRadius(target.teeth);
    const anchorRadius = gearRadius(anchor.teeth);

    for (let attempt = 0; attempt < 8; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const newX = anchor.x + Math.cos(angle) * (targetRadius + anchorRadius) * 0.95;
      const newY = anchor.y + Math.sin(angle) * (targetRadius + anchorRadius) * 0.95;

      const inZone = this.onRight
        ? (newX >= AI_ZONE_MIN_X + 40 && newX <= WORLD_WIDTH - 40)
        : (newX >= 40 && newX <= PLAYER_ZONE_MAX_X - 40);

      if (inZone && this.world.canPlace(newX, newY, target.teeth, this.owner)) {
        return { type: 'reposition_gear', gearId: target.id, x: newX, y: newY };
      }
    }
    return { type: 'idle' };
  }

  /**
   * Finds the rearmost (furthest from enemy) gear of the given type in a chain.
   * Used by decideChainRecycle to sell the most redundant gear.
   */
  private findRearmostGearOfType(plan: AIChainPlan, type: GearType): GearState | null {
    let rearmost: GearState | null = null;
    let rearX = this.onRight ? -Infinity : Infinity;
    for (const gearId of plan.gearIds) {
      const g = this.world.getGear(gearId);
      if (!g || g.type !== type) continue;
      // AI: rearmost = highest X (furthest from player)
      // Player: rearmost = lowest X (furthest from AI)
      if (this.onRight ? g.x > rearX : g.x < rearX) {
        rearX = g.x;
        rearmost = g;
      }
    }
    return rearmost;
  }

  /**
   * Sell excess/suboptimal gears in defense chains so their refund can fund
   * better defensive gear types. Only runs for hard AI.
   *
   * Triggers when:
   *   - Defense chain has >2 motors AND defensive tech is available (armored/spiked/turret)
   *     but the defensive gear hasn't been placed yet → sell a rearmost motor to free gold.
   */
  private decideChainRecycle(): AIDecision {
    for (const plan of this.chainPlans) {
      if (plan.role !== 'defense') continue;
      const hasDefensiveTech = this.aiResearched.has('armored_gears')
        || this.aiResearched.has('spiked_gears')
        || this.aiResearched.has('crossbow_turret_tech');
      if (!hasDefensiveTech) continue;

      const needsDefensiveGears = plan.stats.armoredCount === 0
        || plan.stats.spikedCount === 0
        || plan.stats.turretCount === 0;
      if (plan.stats.motorCount > 2 && needsDefensiveGears) {
        const motorToSell = this.findRearmostGearOfType(plan, 'motor');
        if (motorToSell) {
          const refund = this.gearSystem.sellGear(motorToSell.id);
          if (refund !== null) {
            this.economySystem.earnGold(this.owner, refund);
            return this.withReason(
              { type: 'idle' },
              `recycled defense motor ${motorToSell.id} for ${refund}g — awaiting defensive gear placement`,
            );
          }
        }
      }
    }
    return { type: 'idle' };
  }

  private getPersonalitySpawnMult(): number {
    switch (this.personality) {
      case 'rusher':    return 0.65;
      case 'economist': return 1.4;
      default:          return 1.0;
    }
  }

  private getPersonalityResearchBonus(nodeId: string): number {
    switch (this.personality) {
      case 'rusher':
        if (nodeId === 'unlock_cavalry_spawner' || nodeId === 'unlock_artillery_spawner') return 40;
        if (nodeId === 'cavalry_charge' || nodeId === 'infantry_speed') return 30;
        return 0;
      case 'economist':
        if (nodeId === 'gold_mining_2' || nodeId === 'gold_mining_3') return 50;
        if (nodeId === 'unlock_iron_mining' || nodeId === 'iron_to_gold') return 40;
        return 0;
      case 'turtle':
        // Turtle needs defensive gear tech EARLY (after basic_amplifier), not late.
        // Without these, defense chains are just useless motor clusters.
        // +600 puts armored/spiked at ~895-900 — above power_efficiency (850), just below basic_amplifier (980).
        if (nodeId === 'armored_gears' || nodeId === 'spiked_gears') return 600;
        if (nodeId === 'crossbow_turret_tech') return 560;   // 290+560=850, same tier as power_efficiency
        if (nodeId === 'base_fortification') return 490;     // 310+490=800
        if (nodeId === 'healer_gear_tech') return 300;       // 285+300=585
        if (nodeId === 'fortress_wall' || nodeId === 'heavy_fortification') return 200;
        return 0;
      default:
        return 0;
    }
  }

  // ─── Research planning ────────────────────────────────────────────────────

  /**
   * Returns the gold cost of the next researchable node in the priority queue.
   * Returns 0 when research is in progress, no tech system, or nothing queued.
   * Used to reserve that gold in the gear-placement budget.
   */
  private getNextResearchCost(): number {
    if (this.aiResearchInProgress || !this.techSystem) return 0;
    for (const nodeId of this.researchPlan.prioritizedQueue) {
      const node = TECH_NODES[nodeId];
      if (!node) continue;
      if (this.aiResearched.has(nodeId)) continue;
      if (!node.prereqs.every(p => this.aiResearched.has(p))) continue;
      return node.goldCost;
    }
    return 0;
  }

  private maybeRebuildResearchPlan(): void {
    const now = this.clock.now;
    // Rebuild more frequently on medium/hard to catch opponent adaptation windows
    const interval = this.strategyProfile === 'easy' ? 10000 : 5000;
    if (this.researchPlan.prioritizedQueue.length > 0 && now - this.researchPlan.lastRebuildAt < interval) return;
    this.rebuildResearchPlan();
  }

  /**
   * Score a tech node by research ROI and strategic fit.
   * Higher = research first.
   *
   * Priority anchors:
   *   gold_mining_1    → +1 g/s for 15g (breaks even in 15s)
   *   basic_amplifier  → ×1.4 chain output
   *   counter spawner  → jumps to 950 when opponent data confirms dominant unit type
   */
  private getResearchScore(nodeId: string): number {
    const node = TECH_NODES[nodeId];
    if (!node) return 0;

    // Priority anchors, highest = research first.
    // Covers all nodes to avoid them falling into the low-signal generic formula.
    const FIXED: Record<string, number> = {
      // ── Economy fundamentals ──────────────────────────────────
      'gold_mining_1':               1000,  // +1 g/s, 15g cost, breaks even in 15s
      'basic_amplifier':              980,  // ×1.4 chain multiplier, universal
      'power_efficiency_1':           850,  // +10% all gears
      'unlock_infantry':              800,  // cheap HP boost unlocks elite path
      'gold_mining_2':                770,  // +2 g/s stacks with gold_mining_1
      'gear_precision_1':             720,  // unlocks 15t gears (bigger motors)
      'unlock_artillery_spawner':     700,  // counter-pick tool
      'unlock_cavalry_spawner':       690,  // counter-pick tool
      'gold_mining_3':                650,  // +3 g/s
      'gear_precision_2':             600,  // 20/25t gears
      'power_efficiency_2':           580,  // +15% stacks
      'unlock_iron_mining':           680,  // gate for iron economy chain — boosted (key income tech)
      'iron_to_gold':                 640,  // iron_converter unlocked; drives economy chains — boosted
      'power_overdrive':              510,  // +25% from all sources
      'gold_empire':                  500,  // +5 g/s
      'gear_precision_3':             490,  // 30/35t gears + super_amplifier prereq
      'basic_capacitor':              460,  // burst mechanic, great with chains
      'super_amplifier':              450,  // 2× amplifier - huge late-game
      'cavalry_charge':               430,  // cavalry speed+dmg
      'elite_infantry_unlock':        420,  // 2× HP/dmg infantry
      'gear_precision_4':             410,  // 40/45t gears
      'unlock_crystal_mining':        400,  // opens crystal→gold chain
      'iron_guard_spawner_unlock':    390,
      'unlock_iron_guard_spawner':    390,
      'power_surge':                  380,  // 30 gold on demand
      'infantry_speed':               370,
      'combo_chain_bonus':            360,  // +25% power for 4+ gear chains
      'crystal_to_gold':              355,
      'extended_overclock':           350,
      'basic_overclock':              340,  // overclock gears (+50% speed adj)
      'elite_cavalry_unlock':         330,
      'elite_artillery_unlock':       325,
      // ── Defense (boosted under threat via adaptive scoring below) ──
      'base_fortification':           310,
      'spiked_gears':                 300,
      'armored_gears':                295,
      'crossbow_turret_tech':         290,
      'healer_gear_tech':             285,
      'fortress_wall':                280,
      'unlock_crystal_sentinel_spawner': 265,
      'unlock_aether_mining':         260,
      'aether_to_gold':               255,
      'unlock_aether_phantom_spawner': 250,
      'artillery_turret_tech':        245,
      'heavy_fortification':          240,
      'overclock_mastery':            235,
      'gear_precision_5':             230,
      'total_war':                    220,
      'counter_intel':                200,
    };

    let score = FIXED[nodeId] ?? 0;

    // Opponent-adaptive boost: counter-spawner tech jumps when we have unit-type data.
    // Scale is personality-dependent — rusher counter-picks aggressively, economist less so
    // (doesn't want a cavalry_spawner to displace iron_mining on the research queue).
    const dominant = this.getDominantOpponentUnit();
    if (this.opponentUnitWindow.length >= 5) {
      const counterBoost = this.personality === 'rusher'    ? 1000
                         : this.personality === 'economist' ? 700   // stays below iron_mining (720+40)
                         : this.personality === 'turtle'    ? 820
                         :                                    950;  // balanced / default
      if (dominant.includes('infantry') && nodeId === 'unlock_cavalry_spawner')   score = Math.max(score, counterBoost);
      if (dominant.includes('cavalry')  && nodeId === 'unlock_artillery_spawner') score = Math.max(score, counterBoost);
    }

    // Natural unit-tech progression: once cavalry spawner is researched, artillery is the
    // next logical upgrade (hard counters cavalry, adds range). Without this, artillery
    // score (700) loses to almost every other node and is never researched.
    if (nodeId === 'unlock_artillery_spawner' && this.aiResearched.has('unlock_cavalry_spawner')) {
      score = Math.max(score, 800);
    }

    // Threat-adaptive boost: under pressure, prioritise defensive tech
    const threat = this.assessThreatLevel();
    if (threat === 'critical' || threat === 'danger') {
      if (nodeId === 'base_fortification')   score = Math.max(score, 720);
      if (nodeId === 'fortress_wall')        score = Math.max(score, 680);
      if (nodeId === 'heavy_fortification')  score = Math.max(score, 650);
      if (nodeId === 'armored_gears')        score = Math.max(score, 620);
      if (nodeId === 'spiked_gears')         score = Math.max(score, 600);
      if (nodeId === 'healer_gear_tech')     score = Math.max(score, 580);
      if (nodeId === 'crossbow_turret_tech') score = Math.max(score, 560);
    }

    // Generic fallback for any future nodes not in the table (avoids silent 0)
    if (score === 0) {
      const colBase: Record<number, number> = { 2: 400, 1: 350, 0: 300, 4: 250, 3: 150 };
      score = (colBase[node.column ?? -1] ?? 200) - node.goldCost * 0.5;
    }

    score += this.getPersonalityResearchBonus(nodeId);

    return score;
  }

  private rebuildResearchPlan(): void {
    const available = Object.keys(TECH_NODES).filter(id => {
      const node = TECH_NODES[id];
      return !this.aiResearched.has(id) && node.prereqs.every(p => this.aiResearched.has(p));
    });

    if (available.length === 0) {
      this.researchPlan = { prioritizedQueue: [], currentGoal: 'nothing to research', lastRebuildAt: this.clock.now };
      return;
    }

    let queue: string[];
    let goal: string;

    if (this.strategyProfile === 'easy') {
      // Easy: prefer cheap economy first, rest is random
      const econNodes = available
        .filter(id => TECH_NODES[id].column === 2)
        .sort((a, b) => TECH_NODES[a].goldCost - TECH_NODES[b].goldCost);
      const rest = available.filter(id => TECH_NODES[id].column !== 2).sort(() => Math.random() - 0.5);
      queue = [...econNodes, ...rest];
      goal = 'economy first';
    } else {
      // Medium/hard: score-based (ROI + opponent adaptation)
      const scored = [...available].sort((a, b) => this.getResearchScore(b) - this.getResearchScore(a));

      if (this.strategyProfile === 'medium') {
        // Medium: skip T3+ until 4+ nodes are researched (foundation first)
        const hasFoundation = this.aiResearched.size >= 4;
        queue = hasFoundation ? scored : scored.filter(id => TECH_NODES[id].tier <= 2);
        if (queue.length === 0) queue = scored;
      } else {
        queue = scored;
      }

      goal = queue.length > 0 ? (TECH_NODES[queue[0]]?.name ?? queue[0]) : 'complete';
    }

    this.researchPlan = { prioritizedQueue: queue, currentGoal: goal, lastRebuildAt: this.clock.now };
  }

  /** Returns true if it actually started a research node this call (spends an action). */
  private tryAutoResearch(): boolean {
    if (!this.techSystem) return false;
    if (this.aiResearchInProgress) return false;

    // Walk the prioritized queue. Rules:
    //   already researched   → continue (stale queue entry, skip)
    //   prereq not yet met   → continue (not available yet, skip)
    //   unaffordable         → STOP and wait (do NOT skip to a cheaper lower-priority node)
    //
    // Stopping at the first unaffordable item means the AI saves up for its actual
    // priority goal rather than spending on a cheap low-value node in the meantime.
    // The budget reserve in makeDecision() ensures gold accumulates here.
    for (const nodeId of this.researchPlan.prioritizedQueue) {
      const node = TECH_NODES[nodeId];
      if (!node) continue;
      if (this.aiResearched.has(nodeId)) continue;
      if (!node.prereqs.every(p => this.aiResearched.has(p))) continue;
      if (!this.economySystem.canAffordGold(this.owner, node.goldCost)) return false; // wait, don't skip
      this.techSystem.startResearch(nodeId as import('../types/tech.types').TechNodeId, this.owner);
      this.log(`RESEARCH: "${node.name ?? nodeId}"  score=${this.getResearchScore(nodeId).toFixed(0)}  cost=${node.goldCost}g`);
      return true;
    }
    return false;
  }

  private executeDecision(decision: AIDecision): void {
    switch (decision.type) {
      case 'place_gear': {
        if (!decision.gearType || !decision.teeth || decision.x === undefined || decision.y === undefined) break;
        const cost = this.getGearPlacementCost(decision.teeth);
        if (this.economySystem.spendGold(this.owner, cost)) {
          const placed = this.gearSystem.tryPlace(
            decision.gearType, decision.teeth, decision.x, decision.y, this.owner,
          );
          // tryPlace can refuse (zone, overlap, tech gate). The gold was
          // already spent, so refund it rather than silently burning it.
          if (!placed) {
            this.economySystem.earnGold(this.owner, cost);
            this.log(`placement refused for ${decision.gearType} @ ${decision.x},${decision.y} — refunded ${cost}g`);
          }
        }
        break;
      }

      case 'reposition_gear': {
        if (!decision.gearId || decision.x === undefined || decision.y === undefined) break;
        this.gearSystem.repositionGear(decision.gearId, decision.x, decision.y, this.owner);
        break;
      }

      case 'idle':
        break;
    }
  }

}
