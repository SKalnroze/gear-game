import { GearType } from '../types/gear.types';
import { AIStrategyProfile } from '../types/ai.types';
import { World } from '../world/World';
import { GearMeshGraph } from '../world/GearMeshGraph';
import { EconomySystem } from '../systems/EconomySystem';
import { RotationPhysicsSystem } from '../systems/RotationPhysicsSystem';
import { gearRadius, motorOutput, GEAR_MESH_TOLERANCE } from '../constants/gear.constants';
import { AMPLIFIER_CHAIN_MULTIPLIER, gearPlacementCost as placementCost } from '../constants/balance.constants';
import { UNIT_DEFINITIONS } from '../constants/unit.constants';
import { UnitType } from '../types/unit.types';
import { LANE_Y_MIN, LANE_Y_MAX } from '../constants/world.constants';

const LANE_CENTER_Y = (LANE_Y_MIN + LANE_Y_MAX) / 2;

// ─── Types ────────────────────────────────────────────────────────────────────

export type ChainPhase =
  | 'bootstrap'   // no motor yet
  | 'spawn'       // has motor, no spawner (also used for economy chains throughout)
  | 'amplify'     // has motor+spawner, no amplifier (catch-up)
  | 'support'     // has motor+spawner+amp — add researcher/capacitor
  | 'expand'      // mature — add motors, counter-spawners
  | 'full';       // no valid adjacent slot exists

/**
 * Role determines what this chain is trying to accomplish.
 *   combat  — motor + amplifier + spawner → produce units
 *   economy — motor + amplifier + researcher + miners → generate resources / accelerate research
 *   defense — motor + turret + armored/spiked gears → physical in-lane barrier
 */
export type ChainRole = 'combat' | 'economy' | 'defense';

export interface ChainStats {
  motorCount: number;
  amplifierCount: number;
  capacitorCount: number;
  researcherCount: number;
  minerCount: number;      // iron / crystal / aether miners
  converterCount: number;  // iron / crystal / aether converters
  healerCount: number;
  spikedCount: number;
  armoredCount: number;
  overclockCount: number;
  turretCount: number;     // crossbow_turret + artillery_turret combined
  minelayerCount: number;
  spawnerTypes: GearType[];
  estimatedOutput: number;
}

export interface AIChainPlan {
  id: string;
  origin: { x: number; y: number };
  gearIds: string[];
  stats: ChainStats;
  phase: ChainPhase;
  role: ChainRole;
  createdAt: number;
}

export interface AIPlacementContext {
  threatLevel: 'critical' | 'danger' | 'normal' | 'winning';
  preferredSpawnerType: GearType;
  /**
   * True when at least one chain has an active spawner.
   * False = ALL spawners are gone (destroyed or not yet placed).
   * When false, spawn phase skips the amplifier preamble and rushes a spawner
   * directly so unit production resumes as fast as possible.
   */
  hasAnySpawner: boolean;
  /** Personality multiplier on spawn-reserve gold threshold. Default 1.0. */
  spawnReserveMult?: number;
}

// ─── Gear-type sets ───────────────────────────────────────────────────────────

const SPAWNER_TYPES: GearType[] = [
  'infantry_spawner', 'cavalry_spawner', 'artillery_spawner', 'slime_spawner', 'crossbow_spawner',
  'iron_guard_spawner', 'crystal_sentinel_spawner', 'aether_phantom_spawner', 'sentry_spawner',
];
const MINER_TYPES: GearType[] = ['iron_miner', 'crystal_miner', 'aether_miner'];
const CONVERTER_TYPES: GearType[] = ['iron_converter', 'crystal_converter', 'aether_converter'];

function isSpawner(type: GearType): boolean  { return SPAWNER_TYPES.includes(type); }
function isMiner(type: GearType): boolean    { return MINER_TYPES.includes(type); }
function isConverter(type: GearType): boolean { return CONVERTER_TYPES.includes(type); }

function requiredTechForSpawner(spawnerType: GearType): string {
  switch (spawnerType) {
    case 'cavalry_spawner':          return 'unlock_cavalry_spawner';
    case 'artillery_spawner':        return 'unlock_artillery_spawner';
    case 'slime_spawner':           return 'unlock_slime_spawner';
    case 'crossbow_spawner':        return 'unlock_crossbow_spawner';
    case 'iron_guard_spawner':       return 'unlock_iron_guard_spawner';
    case 'crystal_sentinel_spawner': return 'unlock_crystal_sentinel_spawner';
    case 'aether_phantom_spawner':   return 'unlock_aether_phantom_spawner';
    default:                         return '';
  }
}

function resolveSpawner(preferred: GearType, aiResearched: Set<string>): GearType {
  const tech = requiredTechForSpawner(preferred);
  return (!tech || aiResearched.has(tech)) ? preferred : 'infantry_spawner';
}


let _idCounter = 0;
function nextId(): string { return `chain-${Date.now()}-${_idCounter++}`; }

// ─── AIChainPlanner ───────────────────────────────────────────────────────────

/**
 * Pure/static helpers for role-based chain planning.
 *
 * Combat chains:  motor → amplifier → spawner → researcher → capacitor → more motors
 * Economy chains: motor → amplifier → researcher → miner → converter → more miners
 *
 * Spawner placement scores a directional bonus toward the enemy base so that
 * spawned units travel the shortest path to the player.
 */
export class AIChainPlanner {

  static syncPlans(
    plans: AIChainPlan[],
    owner: 'player' | 'ai',
    world: World,
    meshGraph: GearMeshGraph,
    _rotationPhysics: RotationPhysicsSystem,
  ): AIChainPlan[] {
    const ownerGears = world.getGearsOwnedBy(owner);
    const ownerGearIdSet = new Set(ownerGears.map(g => g.id));

    let surviving = plans.filter(p => p.gearIds.some(id => ownerGearIdSet.has(id)));

    const components = meshGraph.findConnectedComponents(ownerGearIdSet);
    for (const gear of ownerGears) {
      if (!components.some(c => c.includes(gear.id))) components.push([gear.id]);
    }

    const coveredPlanIds  = new Set<string>();
    const coveredCompIdxs = new Set<number>();

    for (const plan of surviving) {
      const planGearSet = new Set(plan.gearIds);
      for (let i = 0; i < components.length; i++) {
        if (coveredCompIdxs.has(i)) continue;
        if (components[i].some(id => planGearSet.has(id))) {
          plan.gearIds = components[i].filter(id => ownerGearIdSet.has(id));
          coveredPlanIds.add(plan.id);
          coveredCompIdxs.add(i);
          break;
        }
      }
    }

    surviving = surviving.filter(p => coveredPlanIds.has(p.id));

    for (let i = 0; i < components.length; i++) {
      if (coveredCompIdxs.has(i)) continue;
      const comp = components[i].filter(id => ownerGearIdSet.has(id));
      if (comp.length === 0) continue;

      // Inherit role from whichever original plan any of these gears previously belonged to.
      // This preserves economy chain identity when a chain is split by enemy unit attacks.
      const compGearSet = new Set(comp);
      const parentPlan = plans.find(p => p.gearIds.some(id => compGearSet.has(id)));
      const inheritedRole: ChainRole = parentPlan?.role ?? 'combat'; // preserve defense/economy identity on split

      const newPlan: AIChainPlan = {
        id: nextId(),
        origin: AIChainPlanner.computeOrigin(comp, world),
        gearIds: comp,
        stats: AIChainPlanner.computeStats(comp, world),
        phase: 'bootstrap',
        role: inheritedRole,
        createdAt: Date.now(),
      };
      newPlan.phase = AIChainPlanner.getChainPhase(newPlan.stats);
      surviving.push(newPlan);
    }

    return surviving.map(p => AIChainPlanner.evaluateChain(p, world));
  }

  static evaluateChain(plan: AIChainPlan, world: World): AIChainPlan {
    const stats = AIChainPlanner.computeStats(plan.gearIds, world);
    const phase = AIChainPlanner.getChainPhase(stats);
    return { ...plan, stats, phase }; // role preserved via spread
  }

  /**
   * General stats → phase mapping.
   * Economy chains will permanently be in 'spawn' (no spawner) — that is intentional;
   * pickGearTypeForPhase branches on plan.role to handle them correctly.
   */
  static getChainPhase(stats: ChainStats): ChainPhase {
    if (stats.motorCount === 0)         return 'bootstrap';
    if (stats.spawnerTypes.length === 0) return 'spawn';
    if (stats.amplifierCount === 0)     return 'amplify';
    if (stats.capacitorCount + stats.researcherCount === 0) return 'support';
    return 'expand';
  }

  static isChainFull(plan: AIChainPlan, owner: 'player' | 'ai', world: World): boolean {
    const testTeeth  = 10;
    const testRadius = gearRadius(testTeeth);
    for (const gearId of plan.gearIds) {
      const gear = world.getGear(gearId);
      if (!gear) continue;
      const dist = gearRadius(gear.teeth) + testRadius;
      for (let a = 0; a < 12; a++) {
        const angle = (a / 12) * Math.PI * 2;
        if (world.canPlace(gear.x + Math.cos(angle) * dist, gear.y + Math.sin(angle) * dist, testTeeth, owner)) return false;
      }
    }
    return true;
  }

  static findBestAddition(
    plan: AIChainPlan,
    profile: AIStrategyProfile,
    owner: 'player' | 'ai',
    world: World,
    meshGraph: GearMeshGraph,
    economySystem: EconomySystem,
    aiResearched: Set<string>,
    unlockedTeeth: number[],
    context: AIPlacementContext,
  ): { gearType: GearType; teeth: number; x: number; y: number } | null {
    const gearType = AIChainPlanner.pickGearTypeForPhase(plan, profile, aiResearched, economySystem, owner, context);
    if (!gearType) return null;

    const gold = economySystem.getResources(owner).gold;
    const teeth = AIChainPlanner.selectTeeth(profile, gold, unlockedTeeth);

    const teethCandidates = [...unlockedTeeth].filter(t => t <= teeth).sort((a, b) => b - a);
    if (!teethCandidates.includes(10)) teethCandidates.push(10);

    for (const t of teethCandidates) {
      if (!economySystem.canAffordGold(owner, placementCost(t))) continue;
      const pos = AIChainPlanner.findBestSlot(plan, t, gearType, owner, world, meshGraph, profile);
      if (pos) return { gearType, teeth: t, x: pos.x, y: pos.y };
    }
    return null;
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Decide what gear to add next, respecting the chain's role.
   *
   * COMBAT build order:
   *   bootstrap → motor
   *   spawn     → amplifier (if unlocked) → spawner (once gold reserve is safe)
   *   amplify   → amplifier (catch-up)
   *   support   → researcher → capacitor (if unlocked) → 2nd amplifier
   *   expand    → add counter-spawner if missing → iron_miner → motor
   *
   * ECONOMY build order (always in 'spawn' phase, never builds spawner):
   *   motor → amplifier → researcher → iron_miner → iron_converter
   *   → more miners → motors for additional output
   */
  private static pickGearTypeForPhase(
    plan: AIChainPlan,
    profile: AIStrategyProfile,
    aiResearched: Set<string>,
    economySystem: EconomySystem,
    owner: 'player' | 'ai',
    context: AIPlacementContext,
  ): GearType | null {
    const { threatLevel, preferredSpawnerType } = context;

    // ── DEFENSE CHAIN ─────────────────────────────────────────────────────────
    if (plan.role === 'defense') {
      if (plan.stats.motorCount === 0) return 'motor';
      // Frontline defensive gears take priority over extra motors
      if (plan.stats.armoredCount === 0 && aiResearched.has('armored_gears')) return 'armored';
      if (plan.stats.spikedCount === 0 && aiResearched.has('spiked_gears')) return 'spiked';
      if (plan.stats.turretCount === 0 && aiResearched.has('crossbow_turret_tech')) return 'crossbow_turret';
      if (plan.stats.minelayerCount === 0 && aiResearched.has('unlock_minelayer')) return 'minelayer';
      if (plan.stats.healerCount === 0 && aiResearched.has('healer_gear_tech')) return 'healer';
      if (plan.stats.turretCount < 2 && aiResearched.has('artillery_turret_tech')) return 'artillery_turret';
      // Add more motors only when defensive gears are present and motor cap not reached
      const hasDefensiveContent = plan.stats.turretCount > 0
        || plan.stats.armoredCount > 0 || plan.stats.spikedCount > 0;
      if (hasDefensiveContent && plan.stats.motorCount < 3) return 'motor';
      // Without defensive tech, allow a second motor but don't spam
      if (!hasDefensiveContent && plan.stats.motorCount < 2) return 'motor';
      return null; // wait for defensive tech rather than spamming motors
    }

    // ── ECONOMY CHAIN ──────────────────────────────────────────────────────────
    if (plan.role === 'economy') {
      if (plan.stats.motorCount === 0) return 'motor';
      // Amplifier multiplies everything — build it first
      if (plan.stats.amplifierCount === 0 && aiResearched.has('basic_amplifier')) return 'amplifier';
      // Researcher: accelerates all tech, always available (no unlock needed)
      if (plan.stats.researcherCount === 0) return 'researcher';
      // Iron miners: primary resource generators (build up to 3)
      if (plan.stats.minerCount < 3 && aiResearched.has('unlock_iron_mining')) return 'iron_miner';
      // Iron converters: turn iron into gold (up to 2 for miner:converter ≈ 3:2 ratio)
      if (plan.stats.converterCount < 2 && aiResearched.has('iron_to_gold')) return 'iron_converter';
      // Crystal chain if researched
      if (aiResearched.has('unlock_crystal_mining') && plan.stats.minerCount < 5) return 'crystal_miner';
      if (aiResearched.has('crystal_to_gold') && plan.stats.converterCount < 3) return 'crystal_converter';
      // Aether chain if researched -- best rate of the three, so worth the depth
      if (aiResearched.has('unlock_aether_mining') && plan.stats.minerCount < 7) return 'aether_miner';
      if (aiResearched.has('aether_to_gold') && plan.stats.converterCount < 4) return 'aether_converter';
      // Extra motors drive higher throughput once miners are running
      if (plan.stats.minerCount > 0 && plan.stats.motorCount < 3) return 'motor';
      if (plan.stats.minerCount > 0) return 'motor';
      return null; // nothing actionable yet — wait for mining tech
    }

    // ── COMBAT CHAIN ──────────────────────────────────────────────────────────
    const spawner = resolveSpawner(preferredSpawnerType, aiResearched);

    switch (plan.phase) {
      case 'bootstrap':
        return 'motor';

      case 'spawn': {
        // Emergency: no spawner exists anywhere — rush a spawner immediately.
        // Also rush under critical threat. Both skip the amplifier preamble.
        if (plan.stats.spawnerTypes.length === 0 && (!context.hasAnySpawner || threatLevel === 'critical')) return spawner;

        // Amplifier first: it multiplies the spawner's output by 1.4× from the start
        if (plan.stats.amplifierCount === 0 && aiResearched.has('basic_amplifier')) return 'amplifier';

        // Wait for a reserve of the unit's actual cost resource before committing.
        // Derive unit name from spawner type (e.g. 'cavalry_spawner' → 'cavalry').
        const unitName = spawner.replace('_spawner', '') as UnitType;
        const unitDef = UNIT_DEFINITIONS[unitName];
        // Hard AI hoards less — it gets spawners out faster and relies on aggression.
        // Medium/easy accumulate a larger buffer before committing.
        const reserveMult = profile === 'hard'
          ? (threatLevel === 'danger' ? 3 : 6)
          : (threatLevel === 'danger' ? 5 : 10);
        const personalityMult = context.spawnReserveMult ?? 1.0;
        if (unitDef.costResource !== 'none') {
          const reserve = economySystem.getResources(owner)[unitDef.costResource];
          if (reserve < unitDef.costAmount * reserveMult * personalityMult) return null;
        }

        return spawner;
      }

      case 'amplify':
        // Catch-up: spawner was placed before amplifier was unlocked
        return 'amplifier';

      case 'support': {
        // Researcher first (always buildable, speeds up tech)
        if (plan.stats.researcherCount === 0) return 'researcher';
        // Capacitor if unlocked
        if (plan.stats.capacitorCount === 0 && aiResearched.has('basic_capacitor')) return 'capacitor';
        // Healer: sustain for adjacent gears/units — hard AI only
        if (profile === 'hard' && plan.stats.healerCount === 0 && aiResearched.has('healer_gear_tech')) return 'healer';
        // Second amplifier is very powerful once super_amplifier is available
        if (plan.stats.amplifierCount < 2 && aiResearched.has('basic_amplifier')) return 'amplifier';
        return 'motor';
      }

      case 'expand': {
        // Upgrade to preferred counter-spawner if the chain doesn't have it yet
        if (!plan.stats.spawnerTypes.includes(spawner)) {
          const tech = requiredTechForSpawner(spawner);
          if (!tech || aiResearched.has(tech)) return spawner;
        }
        // Natural diversification: add artillery as a secondary spawner once researched.
        // Artillery provides valuable ranged support alongside any melee spawner.
        if (!plan.stats.spawnerTypes.includes('artillery_spawner')
            && plan.stats.spawnerTypes.length > 0
            && aiResearched.has('unlock_artillery_spawner')) {
          return 'artillery_spawner';
        }
        // Defensive/utility upgrades — hard AI, one of each per chain
        if (profile === 'hard') {
          if (plan.stats.armoredCount   === 0 && aiResearched.has('armored_gears'))        return 'armored';
          if (plan.stats.spikedCount    === 0 && aiResearched.has('spiked_gears'))          return 'spiked';
          if (plan.stats.overclockCount === 0 && aiResearched.has('basic_overclock'))       return 'overclock';
          if (plan.stats.turretCount    === 0 && aiResearched.has('crossbow_turret_tech'))  return 'crossbow_turret';
        }
        // Iron miner for hard AI with multiple motors
        if (profile === 'hard' && aiResearched.has('unlock_iron_mining') && plan.stats.motorCount >= 2) {
          return 'iron_miner';
        }
        return 'motor';
      }

      case 'full':
      default:
        return null;
    }
  }

  private static computeRotationParities(
    ownerGears: Array<{ id: string }>,
    meshGraph: GearMeshGraph,
  ): Map<string, number> {
    const parities = new Map<string, number>();
    for (const gear of ownerGears) {
      if (parities.has(gear.id)) continue;
      const queue: Array<[string, number]> = [[gear.id, 0]];
      while (queue.length > 0) {
        const [id, p] = queue.shift()!;
        if (parities.has(id)) continue;
        parities.set(id, p);
        for (const nId of meshGraph.getNeighbors(id)) {
          if (!parities.has(nId)) queue.push([nId, 1 - p]);
        }
      }
    }
    return parities;
  }

  private static wouldCauseRotationConflict(
    cx: number, cy: number, teeth: number,
    ownerGears: Array<{ id: string; x: number; y: number; teeth: number }>,
    parities: Map<string, number>,
  ): boolean {
    const newRadius = gearRadius(teeth);
    let expectedParity: number | null = null;
    for (const gear of ownerGears) {
      const dist = Math.sqrt((cx - gear.x) ** 2 + (cy - gear.y) ** 2);
      if (Math.abs(dist - (gearRadius(gear.teeth) + newRadius)) <= GEAR_MESH_TOLERANCE * 2) {
        const gearParity = parities.get(gear.id);
        if (gearParity === undefined) continue;
        const candidateParity = 1 - gearParity;
        if (expectedParity === null) {
          expectedParity = candidateParity;
        } else if (expectedParity !== candidateParity) {
          return true; // conflict
        }
      }
    }
    return false;
  }

  /**
   * Find a slot adjacent to the chain.
   *
   * Scans positions around each chain gear at a jittered angle offset (not a
   * fixed grid of angles), so two AI games don't converge on the same-looking
   * rosette every time. Difficulty controls both how thorough the search is
   * and how good the AI is at applying its own jam-avoidance check:
   *   - hard:   24 candidates/gear, tight jitter, always the best-scoring
   *             valid slot, never a rotation conflict.
   *   - medium: 16 candidates/gear, moderate jitter, always best-scoring,
   *             never a rotation conflict.
   *   - easy:   8 candidates/gear, wide jitter, occasionally settles for a
   *             worse-than-best valid slot (a plausible but suboptimal human
   *             choice), and has a small chance of skipping the rotation-
   *             conflict check entirely -- a real mis-mesh, seeded and
   *             consequential (it can jam), not just an uglier gear.
   * Falls back with a slight inward offset to handle floating-point edge cases.
   */
  private static findBestSlot(
    plan: AIChainPlan,
    teeth: number,
    gearType: GearType,
    owner: 'player' | 'ai',
    world: World,
    meshGraph: GearMeshGraph,
    profile: AIStrategyProfile,
  ): { x: number; y: number } | null {
    const ownerGears = world.getGearsOwnedBy(owner);
    const parities = AIChainPlanner.computeRotationParities(ownerGears, meshGraph);
    const newRadius = gearRadius(teeth);

    const sampleCount = profile === 'hard' ? 24 : profile === 'medium' ? 16 : 8;
    const jitterRad = profile === 'hard' ? 0.03 : profile === 'medium' ? 0.10 : 0.28;
    // Easy: rarely skip the jam check -- a genuine mis-mesh mistake, not just a worse score.
    const skipsJamCheck = profile === 'easy' && Math.random() < 0.06;

    const candidates: Array<{ x: number; y: number; score: number }> = [];
    const tryPos = (cx: number, cy: number) => {
      if (!world.canPlace(cx, cy, teeth, owner)) return;
      if (!skipsJamCheck && AIChainPlanner.wouldCauseRotationConflict(cx, cy, teeth, ownerGears, parities)) return;
      const s = AIChainPlanner.scorePlacement(cx, cy, teeth, gearType, plan, world, meshGraph, owner);
      candidates.push({ x: cx, y: cy, score: s });
    };

    const scan = (distMult: number) => {
      for (const gearId of plan.gearIds) {
        const gear = world.getGear(gearId);
        if (!gear) continue;
        const dist = (gearRadius(gear.teeth) + newRadius) * distMult;
        for (let a = 0; a < sampleCount; a++) {
          const angle = (a / sampleCount) * Math.PI * 2 + (Math.random() * 2 - 1) * jitterRad;
          tryPos(gear.x + Math.cos(angle) * dist, gear.y + Math.sin(angle) * dist);
        }
      }
    };

    scan(1);
    if (candidates.length === 0) scan(0.97);
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => b.score - a.score);
    // Easy settles for a worse-than-best valid slot about a third of the
    // time, choosing among the next few candidates instead of always the
    // single best -- a plausible, not-quite-optimal human choice.
    if (profile === 'easy' && candidates.length > 1 && Math.random() < 0.35) {
      const pick = candidates[1 + Math.floor(Math.random() * Math.min(3, candidates.length - 1))];
      return { x: pick.x, y: pick.y };
    }
    return { x: candidates[0].x, y: candidates[0].y };
  }

  /**
   * Score a candidate placement.
   *
   * Key signals:
   *   +4 per meshing chain gear, +2 if motor, +3 if spawner, +2 if amplifier
   *   +5 bonus when connecting 2+ gears simultaneously (compact T-shape)
   *   Spawners: directional bonus toward the enemy base (shorter unit travel)
   *   Lane proximity: gears near lane centre engage faster
   *   Distance from origin: keeps the cluster compact
   */
  static scorePlacement(
    x: number, y: number, teeth: number, gearType: GearType,
    plan: AIChainPlan, world: World, _meshGraph: GearMeshGraph,
    owner: 'player' | 'ai',
  ): number {
    let score = 0;
    const newRadius = gearRadius(teeth);
    let meshCount = 0;

    for (const gearId of plan.gearIds) {
      const g = world.getGear(gearId);
      if (!g) continue;
      const d = Math.sqrt((x - g.x) ** 2 + (y - g.y) ** 2);
      if (Math.abs(d - (gearRadius(g.teeth) + newRadius)) <= GEAR_MESH_TOLERANCE * 2) {
        meshCount++;
        score += 4;
        if (g.type === 'motor')     score += 2;
        if (isSpawner(g.type))      score += 3;
        if (g.type === 'amplifier') score += 2;
      }
    }
    if (meshCount >= 2) score += 5;

    // Spawners: bias toward the enemy-facing side (units walk the shortest path)
    if (isSpawner(gearType)) {
      const frontDelta = owner === 'ai'
        ? plan.origin.x - x    // AI on right, enemy on left → lower x = forward
        : x - plan.origin.x;   // Player on left, enemy on right → higher x = forward
      score += Math.max(0, frontDelta) * 0.05;
    }

    // Lane proximity — role-based
    const inLane = y >= LANE_Y_MIN && y <= LANE_Y_MAX;
    if (plan.role === 'defense') {
      score += inLane ? 12 : -10;   // strongly prefer in-lane

      // Directional bias: armored/spiked/turrets toward enemy; motors toward back.
      // towardEnemy > 0 means the candidate is closer to the enemy than the chain origin.
      const towardEnemy = owner === 'ai'
        ? plan.origin.x - x    // AI zone: lower x = toward player
        : x - plan.origin.x;   // Player zone: higher x = toward AI
      if (gearType === 'armored' || gearType === 'spiked') {
        score += towardEnemy * 0.10;  // strongly prefer front (face the enemy)
      } else if (gearType === 'crossbow_turret' || gearType === 'artillery_turret') {
        score += towardEnemy * 0.04;  // mild front preference (turrets just behind armor)
      } else if (gearType === 'motor') {
        score -= towardEnemy * 0.08;  // motors prefer the back (power from behind)
      }
      // Penalize vertical spread — defense chains should grow horizontally along lane
      score -= Math.abs(y - LANE_CENTER_Y) * 0.06;
    } else if (plan.role === 'economy') {
      score += inLane ? -4 : 2;     // prefer off-lane (safe from units)
    } else {
      // combat: gentle proximity bonus toward lane edge (off-lane but close)
      score += Math.max(0, 80 - Math.abs(y - LANE_CENTER_Y)) * 0.012;
    }

    // Compactness penalty
    const dx = x - plan.origin.x;
    const dy = y - plan.origin.y;
    score -= Math.sqrt(dx * dx + dy * dy) * 0.002;

    return score;
  }

  static computeStats(gearIds: string[], world: World): ChainStats {
    let motorCount = 0, amplifierCount = 0, capacitorCount = 0, researcherCount = 0;
    let minerCount = 0, converterCount = 0;
    let healerCount = 0, spikedCount = 0, armoredCount = 0, overclockCount = 0, turretCount = 0, minelayerCount = 0;
    const spawnerTypes: GearType[] = [];
    let motorOutputSum = 0;

    for (const id of gearIds) {
      const g = world.getGear(id);
      if (!g) continue;
      if      (g.type === 'motor')                                          { motorCount++;      motorOutputSum += motorOutput(g.teeth); }
      else if (g.type === 'amplifier')                                      { amplifierCount++; }
      else if (g.type === 'capacitor')                                      { capacitorCount++; }
      else if (g.type === 'researcher')                                     { researcherCount++; }
      else if (g.type === 'healer')                                         { healerCount++; }
      else if (g.type === 'spiked')                                         { spikedCount++; }
      else if (g.type === 'armored')                                        { armoredCount++; }
      else if (g.type === 'overclock')                                      { overclockCount++; }
      else if (g.type === 'crossbow_turret' || g.type === 'artillery_turret') { turretCount++; }
      else if (g.type === 'minelayer')                                      { minelayerCount++; }
      else if (isMiner(g.type))                                             { minerCount++; }
      else if (isConverter(g.type))                                         { converterCount++; }
      else if (isSpawner(g.type))                                           { spawnerTypes.push(g.type); }
    }

    return {
      motorCount, amplifierCount, capacitorCount, researcherCount,
      minerCount, converterCount, healerCount, spikedCount, armoredCount, overclockCount, turretCount, minelayerCount,
      spawnerTypes,
      estimatedOutput: motorOutputSum * Math.pow(AMPLIFIER_CHAIN_MULTIPLIER, amplifierCount),
    };
  }

  static computeOrigin(gearIds: string[], world: World): { x: number; y: number } {
    let sx = 0, sy = 0, count = 0;
    for (const id of gearIds) {
      const g = world.getGear(id);
      if (!g) continue;
      sx += g.x; sy += g.y; count++;
    }
    return count === 0 ? { x: 0, y: 0 } : { x: sx / count, y: sy / count };
  }

  private static selectTeeth(profile: AIStrategyProfile, gold: number, unlockedTeeth: number[]): number {
    const available = [10, 15, 20, 30].filter(t => unlockedTeeth.includes(t));
    if (available.length === 0) return 10;
    if (profile === 'easy') return 10;
    if (profile === 'medium') {
      const opts = available.filter(t => t <= 15);
      return (opts.length > 0 && gold >= placementCost(15)) ? Math.max(...opts) : 10;
    }
    for (const t of [...available].sort((a, b) => b - a)) {
      if (gold >= placementCost(t)) return t;
    }
    return 10;
  }
}
