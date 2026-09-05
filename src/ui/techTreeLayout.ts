/**
 * Pure layout math for the radial tech tree. No Phaser dependency, so it's
 * testable in isolation the same way unit.utils.ts separates pure scaling
 * math from UnitSystem.
 *
 * Shape: every node's *radius* is its prereq-chain depth (nodes with no
 * prereqs sit on the innermost ring, "available now"); every node's *angle*
 * is its branch — a thematic grouping that's finer than TECH_NODES' column
 * field so a single resource's nodes always point the same direction, even
 * when (like the resource unit spawners) they live in the Units column.
 */
import { TECH_NODES } from '../constants/tech.constants';

export type BranchId =
  | 'core_units' | 'gears_eng' | 'gold_econ'
  | 'iron_branch' | 'defense' | 'crystal_branch' | 'aether_branch' | 'abilities';

/** Angular order around the circle, starting at the top and going clockwise. */
export const BRANCH_ORDER: BranchId[] = [
  'core_units', 'gears_eng', 'gold_econ', 'iron_branch',
  'defense', 'crystal_branch', 'aether_branch', 'abilities',
];

export const BRANCH_LABELS: Record<BranchId, string> = {
  core_units:     '⚔ CORE UNITS',
  gears_eng:      '⚙ ENGINEERING',
  gold_econ:      '◈ GOLD ECONOMY',
  iron_branch:    '⛏ IRON',
  defense:        '⬡ DEFENSE',
  crystal_branch: '◆ CRYSTAL',
  aether_branch:  '✦ AETHER',
  abilities:      '⚡ ABILITIES',
};

export const BRANCH_ACCENT: Record<BranchId, number> = {
  core_units:     0x4488ff,
  gears_eng:      0x00ffcc,
  gold_econ:      0xffcc22,
  iron_branch:    0xaa8866,
  defense:        0xff6644,
  crystal_branch: 0xcc66ff,
  aether_branch:  0x22ddaa,
  abilities:      0xff44aa,
};

/** Every tech node assigned to exactly one thematic branch, by hand, so
 * resource lines stay coherent across the old Gears/Units/Economy columns
 * (e.g. Iron Guard Spawner lives in the Units column but points the same
 * direction as Iron Mining and Iron Smelting). */
export const NODE_BRANCH: Record<string, BranchId> = {
  // gears_eng (14)
  basic_amplifier: 'gears_eng', basic_capacitor: 'gears_eng', basic_overclock: 'gears_eng',
  gear_precision_1: 'gears_eng', gear_precision_2: 'gears_eng', gear_precision_3: 'gears_eng',
  gear_precision_4: 'gears_eng', gear_precision_5: 'gears_eng', unlock_relief_valve: 'gears_eng',
  capacitor_upgrade: 'gears_eng', extended_overclock: 'gears_eng', super_amplifier: 'gears_eng',
  overclock_mastery: 'gears_eng', combo_chain_bonus: 'gears_eng',
  // core_units (15)
  unlock_infantry: 'core_units', infantry_speed: 'core_units', unlock_artillery_spawner: 'core_units',
  unlock_cavalry_spawner: 'core_units', unlock_slime_spawner: 'core_units', unlock_crossbow_spawner: 'core_units',
  elite_infantry_unlock: 'core_units', cavalry_charge: 'core_units', elite_artillery_unlock: 'core_units',
  elite_cavalry_unlock: 'core_units', total_war: 'core_units',
  unlock_sapper_spawner: 'core_units', unlock_skirmish_diver_spawner: 'core_units',
  unlock_saboteur_spawner: 'core_units', unlock_raider_spawner: 'core_units',
  // gold_econ (7)
  gold_mining_1: 'gold_econ', gold_mining_2: 'gold_econ', gold_mining_3: 'gold_econ', gold_empire: 'gold_econ',
  power_efficiency_1: 'gold_econ', power_efficiency_2: 'gold_econ', power_overdrive: 'gold_econ',
  // iron_branch (3)
  unlock_iron_mining: 'iron_branch', iron_to_gold: 'iron_branch', unlock_iron_guard_spawner: 'iron_branch',
  // crystal_branch (3)
  unlock_crystal_mining: 'crystal_branch', crystal_to_gold: 'crystal_branch', unlock_crystal_sentinel_spawner: 'crystal_branch',
  // aether_branch (3)
  unlock_aether_mining: 'aether_branch', aether_to_gold: 'aether_branch', unlock_aether_phantom_spawner: 'aether_branch',
  // abilities (2)
  counter_intel: 'abilities', power_surge: 'abilities',
  // defense (11)
  base_fortification: 'defense', spiked_gears: 'defense', armored_gears: 'defense', fortress_wall: 'defense',
  crossbow_turret_tech: 'defense', unlock_minelayer: 'defense', healer_gear_tech: 'defense',
  unlock_sentry: 'defense', artillery_turret_tech: 'defense', heavy_fortification: 'defense',
  unlock_field_medic_spawner: 'defense',
};

// ─── Tunables ───────────────────────────────────────────────────────────────

export const HUB_RADIUS = 110;
export const RING_GAP = 190;
export const CARD_W = 168;
export const CARD_H = 46;
const SIBLING_GAP = 36;
const BRANCH_GAP_DEG = 5;
/** Vertical compression: the panel viewport is short and wide, so rings are
 * ellipses rather than circles to fit more of the tree in view at once. */
export const ELLIPSE_Y = 0.6;

export function polarToXY(radius: number, angle: number): { x: number; y: number } {
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * ELLIPSE_Y };
}

export interface TechLayoutNode {
  id: string;
  x: number; y: number;
  angle: number; radius: number;
  depth: number;
  branch: BranchId;
}

export interface BranchSector {
  id: BranchId;
  label: string;
  accent: number;
  startAngle: number;
  endAngle: number;
  outerRadius: number;
}

export interface TechTreeLayout {
  nodes: Map<string, TechLayoutNode>;
  sectors: BranchSector[];
  maxRadius: number;
  maxDepth: number;
}

export function computeTechTreeLayout(): TechTreeLayout {
  const ids = Object.keys(TECH_NODES);

  // Prereq-chain depth, memoized. TECH_NODES is a DAG (prereqs are always
  // researched-before, never cyclic), so plain recursion is safe.
  const depthCache = new Map<string, number>();
  function depthOf(id: string): number {
    const cached = depthCache.get(id);
    if (cached !== undefined) return cached;
    const node = TECH_NODES[id];
    const prereqs = node?.prereqs ?? [];
    const d = prereqs.length ? 1 + Math.max(...prereqs.map(depthOf)) : 0;
    depthCache.set(id, d);
    return d;
  }
  for (const id of ids) depthOf(id);

  const byBranch = new Map<BranchId, string[]>();
  for (const b of BRANCH_ORDER) byBranch.set(b, []);
  for (const id of ids) {
    const b = NODE_BRANCH[id] ?? 'core_units';
    byBranch.get(b)!.push(id);
  }

  const gapRad = (BRANCH_GAP_DEG * Math.PI) / 180;
  const availableRad = Math.PI * 2 - gapRad * BRANCH_ORDER.length;
  let cursor = -Math.PI / 2; // start pointing straight up

  const sectorSpans = new Map<BranchId, { start: number; end: number }>();
  for (const b of BRANCH_ORDER) {
    const count = byBranch.get(b)!.length;
    const width = availableRad * (count / ids.length);
    sectorSpans.set(b, { start: cursor, end: cursor + width });
    cursor += width + gapRad;
  }

  // Group every branch's nodes by depth up front — needed twice below,
  // once to size the shared hub and once to actually place nodes.
  const branchDepths = new Map<BranchId, Map<number, string[]>>();
  let maxDepth = 0;
  for (const b of BRANCH_ORDER) {
    const byDepth = new Map<number, string[]>();
    for (const id of byBranch.get(b)!) {
      const d = depthCache.get(id)!;
      maxDepth = Math.max(maxDepth, d);
      if (!byDepth.has(d)) byDepth.set(d, []);
      byDepth.get(d)!.push(id);
    }
    branchDepths.set(b, byDepth);
  }

  /** Radius needed for `n` siblings to sit `CARD_W + SIBLING_GAP` apart
   * (arc-length) inside a sector of the given angular width. A single node
   * needs no fan-out room at all, hence `n - 1`, not `n`. */
  function fanRadius(n: number, sectorWidth: number): number {
    if (n <= 1) return 0;
    return ((n - 1) * (CARD_W + SIBLING_GAP)) / sectorWidth;
  }

  // Pass 1: every branch's "available now" ring (depth 0) shares ONE radius,
  // so the center reads as a single coherent ring rather than a jagged one —
  // sized to whichever branch has the most root siblings to fan out.
  let hubRadius = HUB_RADIUS;
  for (const b of BRANCH_ORDER) {
    const span = sectorSpans.get(b)!;
    const roots = branchDepths.get(b)!.get(0) ?? [];
    hubRadius = Math.max(hubRadius, fanRadius(roots.length, span.end - span.start));
  }

  const nodes = new Map<string, TechLayoutNode>();
  const sectors: BranchSector[] = [];
  let maxRadius = hubRadius;

  // Pass 2: place nodes. Each depth ring sits at least RING_GAP further out
  // than the previous ring *in the same branch* — using RING_GAP itself as
  // the floor (not a small fixed step) is what keeps a busy branch's rings
  // from crowding into each other once sibling fan-out has already pushed
  // an inner ring's radius well past its "ideal" ring-per-depth spacing.
  for (const b of BRANCH_ORDER) {
    const span = sectorSpans.get(b)!;
    const sectorWidth = span.end - span.start;
    const byDepth = branchDepths.get(b)!;
    const depths = Array.from(byDepth.keys()).sort((x, y) => x - y);

    let prevRadius = 0;
    let branchOuterRadius = hubRadius;

    for (const depth of depths) {
      const idsAtDepth = byDepth.get(depth)!;
      const n = idsAtDepth.length;
      const idealRadius = hubRadius + depth * RING_GAP;
      const requiredRadius = fanRadius(n, sectorWidth);
      const radius = depth === 0
        ? hubRadius
        : Math.max(idealRadius, requiredRadius, prevRadius + RING_GAP);
      prevRadius = radius;
      maxRadius = Math.max(maxRadius, radius);
      branchOuterRadius = radius;

      // Order siblings by the average angle of their already-placed prereqs
      // (a simple barycenter heuristic) so children fan out roughly under
      // their parents instead of in declaration order, which is what keeps
      // sibling edges from crossing each other within a branch.
      const withIdeal = idsAtDepth.map(id => {
        const node = TECH_NODES[id];
        const prereqAngles = (node?.prereqs ?? [])
          .map(p => nodes.get(p)?.angle)
          .filter((a): a is number => a !== undefined);
        const ideal = prereqAngles.length
          ? prereqAngles.reduce((sum, a) => sum + a, 0) / prereqAngles.length
          : (span.start + span.end) / 2;
        return { id, ideal };
      });
      withIdeal.sort((a, c) => a.ideal - c.ideal);

      const neededArc = n > 1 ? (n - 1) * (CARD_W + SIBLING_GAP) : 0;
      const usedSpan = Math.min(sectorWidth * 0.92, neededArc / radius);
      const half = usedSpan / 2;
      let center = withIdeal.reduce((sum, e) => sum + e.ideal, 0) / withIdeal.length;
      const lo = span.start + sectorWidth * 0.04 + half;
      const hi = span.end - sectorWidth * 0.04 - half;
      if (lo <= hi) center = Math.min(hi, Math.max(lo, center));

      withIdeal.forEach((entry, i) => {
        const t = n === 1 ? 0.5 : i / (n - 1);
        const angle = n === 1 ? center : center - half + t * usedSpan;
        const { x, y } = polarToXY(radius, angle);
        nodes.set(entry.id, { id: entry.id, x, y, angle, radius, depth, branch: b });
      });
    }

    sectors.push({
      id: b, label: BRANCH_LABELS[b], accent: BRANCH_ACCENT[b],
      startAngle: span.start, endAngle: span.end, outerRadius: branchOuterRadius,
    });
  }

  return { nodes, sectors, maxRadius, maxDepth };
}
