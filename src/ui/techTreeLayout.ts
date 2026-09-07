/**
 * Pure tech-tree math: what state each node is in, and where it sits.
 *
 * Every node is visible from the start (see getNodeVisualState) — a node
 * with no prereqs touched at all renders as a blank "distant" circle rather
 * than being hidden, so the whole tree's shape is legible immediately. A
 * node whose prereqs are only *partially* touched is "next" — a real gear,
 * locked, with the remaining requirement readable only in its tooltip.
 *
 * Position is no longer physics: every node's coordinates (and every
 * connection's curve) come from a hand-designed TechTreeLayoutData — see
 * TECH_TREE_LAYOUT in src/data/techTreeLayoutData.ts, authored with the Tech
 * Layout Editor (Settings → TECH LAYOUT EDITOR). generateDefaultLayout below
 * is only a starting point for that editor, not something the running game
 * ever computes itself.
 */
import { TECH_NODES } from '../constants/tech.constants';

export type BranchId =
  | 'core_units' | 'gears_eng' | 'gold_econ'
  | 'iron_branch' | 'defense' | 'crystal_branch' | 'aether_branch' | 'abilities';

export const BRANCH_LABELS: Record<BranchId, string> = {
  core_units:     'CORE UNITS',
  gears_eng:      'ENGINEERING',
  gold_econ:      'GOLD ECONOMY',
  iron_branch:    'IRON',
  defense:        'DEFENSE',
  crystal_branch: 'CRYSTAL',
  aether_branch:  'AETHER',
  abilities:      'ABILITIES',
};

/** Single-glyph icon drawn at the center of each branch's gears. */
export const BRANCH_ICON: Record<BranchId, string> = {
  core_units:     '⚔',
  gears_eng:      '⚙',
  gold_econ:      '◈',
  iron_branch:    '⛏',
  defense:        '⬡',
  crystal_branch: '◆',
  aether_branch:  '✦',
  abilities:      '⚡',
};

/** Angular order around the circle, starting at the top and going clockwise
 * — each branch gets an even share and a gentle pull toward it (see
 * TechForceGraph's branch-pull force), so e.g. every Iron node trends the
 * same direction instead of the tree being a formless blob. */
export const BRANCH_ORDER: BranchId[] = [
  'core_units', 'gears_eng', 'gold_econ', 'iron_branch',
  'defense', 'crystal_branch', 'aether_branch', 'abilities',
];

export const BRANCH_ANGLE: Record<BranchId, number> = Object.fromEntries(
  BRANCH_ORDER.map((b, i) => [b, -Math.PI / 2 + (i / BRANCH_ORDER.length) * Math.PI * 2]),
) as Record<BranchId, number>;

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
 * (e.g. Iron Guard Spawner lives in the Units column but is colored the
 * same as Iron Mining and Iron Smelting). */
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

export function branchOf(nodeId: string): BranchId {
  return NODE_BRANCH[nodeId] ?? 'core_units';
}

/** Deterministic 0..1 pseudo-hash of a string — used to spread a branch's own
 * nodes across a slice of its compass segment (so they don't all seed on
 * exactly the same ray) without needing a shared RNG. */
function hashUnit(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

/** A node's initial compass direction: its branch's shared angle, nudged by
 * a per-node deterministic offset so siblings fan out across roughly a third
 * of the branch's own slice of the circle instead of stacking on one ray. */
export function themeAngle(nodeId: string): number {
  const branch = branchOf(nodeId);
  const slice = (Math.PI * 2) / BRANCH_ORDER.length;
  const offset = (hashUnit(nodeId) - 0.5) * slice * 0.7;
  return BRANCH_ANGLE[branch] + offset;
}

// ─── Icons ──────────────────────────────────────────────────────────────────

/** A distinct, colorful icon per tech "family" — a node whose id ends in a
 * tier number (`gold_mining_1`, `gear_precision_1`...) shares its family's
 * icon with every other tier and is told apart by a Roman numeral instead
 * (see getNodeIcon), the same way the node names already read "Gold Mining
 * I/II/III." Every other node gets its own unique icon. */
const FAMILY_ICON: Record<string, string> = {
  gear_precision: '⚙',
  gold_mining: '💰',
  power_efficiency: '🔧',
};

const NODE_ICON: Record<string, string> = {
  basic_amplifier: '📢',
  basic_capacitor: '🔋',
  basic_overclock: '🌀',
  capacitor_upgrade: '🔌',
  extended_overclock: '⏱',
  unlock_relief_valve: '🚿',
  super_amplifier: '📣',
  overclock_mastery: '🌪',
  combo_chain_bonus: '🔗',
  unlock_infantry: '🪖',
  infantry_speed: '🥾',
  unlock_artillery_spawner: '💣',
  unlock_cavalry_spawner: '🐎',
  unlock_slime_spawner: '🟢',
  unlock_crossbow_spawner: '🏹',
  elite_infantry_unlock: '🎖',
  cavalry_charge: '🏇',
  unlock_iron_guard_spawner: '🛡',
  elite_artillery_unlock: '💥',
  elite_cavalry_unlock: '🐴',
  unlock_crystal_sentinel_spawner: '🔷',
  unlock_aether_phantom_spawner: '👻',
  total_war: '⚔',
  unlock_sapper_spawner: '🧨',
  unlock_skirmish_diver_spawner: '🤿',
  unlock_raider_spawner: '🗡',
  unlock_saboteur_spawner: '🥷',
  unlock_iron_mining: '⛏',
  unlock_crystal_mining: '💎',
  iron_to_gold: '🔥',
  power_overdrive: '⚡',
  unlock_aether_mining: '✨',
  crystal_to_gold: '🔮',
  aether_to_gold: '🌌',
  gold_empire: '👑',
  counter_intel: '🕵',
  power_surge: '🎇',
  base_fortification: '🧱',
  spiked_gears: '📌',
  armored_gears: '🔰',
  fortress_wall: '🏰',
  crossbow_turret_tech: '🎯',
  unlock_minelayer: '🪤',
  healer_gear_tech: '➕',
  unlock_field_medic_spawner: '🚑',
  unlock_sentry: '👁',
  artillery_turret_tech: '🚀',
  heavy_fortification: '🗿',
};

const ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

/** Strips a trailing `_<n>` tier suffix, if any — `gold_mining_2` becomes
 * `gold_mining`. Returns null for a node with no numeric suffix at all. */
function familyKeyOf(nodeId: string): { family: string; tier: number } | null {
  const m = nodeId.match(/^(.*)_(\d+)$/);
  if (!m) return null;
  return { family: m[1], tier: parseInt(m[2], 10) };
}

export interface NodeIcon {
  glyph: string;
  /** Roman numeral to print after the glyph, e.g. "III" — null for a node
   * whose family has no dedicated shared icon (each tier is its own icon). */
  numeral: string | null;
}

export function getNodeIcon(nodeId: string): NodeIcon {
  const fam = familyKeyOf(nodeId);
  if (fam && FAMILY_ICON[fam.family]) {
    return { glyph: FAMILY_ICON[fam.family], numeral: ROMAN_NUMERALS[fam.tier - 1] ?? String(fam.tier) };
  }
  return { glyph: NODE_ICON[nodeId] ?? BRANCH_ICON[branchOf(nodeId)] ?? '⚙', numeral: null };
}

// ─── Visibility ─────────────────────────────────────────────────────────────

export interface TechVisibilityState {
  researched: Set<string>;
  queue: string[];
  inProgress?: string;
}

export type NodeVisualState = 'researched' | 'researching' | 'queued' | 'available' | 'next' | 'distant';

function isTouched(id: string, tech: TechVisibilityState): boolean {
  return tech.researched.has(id) || tech.inProgress === id || tech.queue.includes(id);
}

/** Every node is always visible; this is which of the six looks it wears.
 * 'distant' — nothing leading to it has been touched yet — is the blank,
 * undecorated circle; every other state is a full gear. */
export function getNodeVisualState(nodeId: string, tech: TechVisibilityState): NodeVisualState {
  if (tech.researched.has(nodeId)) return 'researched';
  if (tech.inProgress === nodeId) return 'researching';
  if (tech.queue.includes(nodeId)) return 'queued';

  const node = TECH_NODES[nodeId];
  const prereqs = node?.prereqs ?? [];
  if (prereqs.length === 0) return 'available';

  const touched = prereqs.filter(p => isTouched(p, tech)).length;
  if (touched === prereqs.length) return 'available';
  if (touched > 0) return 'next'; // one prereq away — a real gear, but locked
  return 'distant';
}

/** Every tech node is simulated and rendered from the very first frame. */
export function computeVisibleNodeIds(_tech: TechVisibilityState): Set<string> {
  return new Set(Object.keys(TECH_NODES));
}

/** Prereqs of a node that are not yet touched by research — the part of the
 * requirement that only shows up as readable text in the tooltip. */
export function getUnmetPrereqs(nodeId: string, tech: TechVisibilityState): string[] {
  const node = TECH_NODES[nodeId];
  return (node?.prereqs ?? []).filter(p => !isTouched(p, tech));
}

// ─── Depth (prereq-chain length, used as radial bias) ──────────────────────

let depthCache: Map<string, number> | null = null;
export function computeDepths(): Map<string, number> {
  if (depthCache) return depthCache;
  const cache = new Map<string, number>();
  function depthOf(id: string): number {
    const cached = cache.get(id);
    if (cached !== undefined) return cached;
    const node = TECH_NODES[id];
    const prereqs = node?.prereqs ?? [];
    const d = prereqs.length ? 1 + Math.max(...prereqs.map(depthOf)) : 0;
    cache.set(id, d);
    return d;
  }
  for (const id of Object.keys(TECH_NODES)) depthOf(id);
  depthCache = cache;
  return cache;
}
// ─── Static layout (hand-designed, loaded from disk) ────────────────────────

/** Every "researchable now" (no-prereq) node spokes visually from this id in
 * the layout — it's a hub position, not a tech, and is never rendered as a
 * gear or researchable itself. */
export const ROOT_NODE_ID = '__tech_root__';

export const NODE_R = 20;

export interface LayoutPoint { x: number; y: number }

/** A saved tech-tree layout: every node's fixed position (keyed by tech id,
 * plus ROOT_NODE_ID for the hub), and every connection's interior bead
 * points (keyed by "fromId->toId", endpoints excluded since those always
 * mirror the two nodes' own positions). Authored with the Tech Layout Editor
 * and checked in as src/data/techTreeLayoutData.ts — the running game only
 * ever reads one of these, it never computes positions itself. */
export interface TechTreeLayoutData {
  version: 1;
  nodes: Record<string, LayoutPoint>;
  edges: Record<string, LayoutPoint[]>;
}

export function edgeKey(fromId: string, toId: string): string {
  return `${fromId}->${toId}`;
}

/** Every (prereqId, nodeId) pair the layout needs a position/curve for —
 * depth-0 nodes spoke from the root since they have no real prereq. */
export function allEdgePairs(): { fromId: string; toId: string }[] {
  const pairs: { fromId: string; toId: string }[] = [];
  for (const [nodeId, node] of Object.entries(TECH_NODES)) {
    const prereqs = node.prereqs?.length ? node.prereqs : [ROOT_NODE_ID];
    for (const fromId of prereqs) pairs.push({ fromId, toId: nodeId });
  }
  return pairs;
}

const DEFAULT_EDGE_LEN = 175;
const DEFAULT_ROOT_EDGE_LEN = 150;
const DEFAULT_EDGE_SEGMENT_LEN = 45;

/** A straight line of interior beads between two points, spaced so segment
 * length stays roughly DEFAULT_EDGE_SEGMENT_LEN (more beads for a longer
 * connection). Used both for the editor's initial default layout and to
 * regenerate a connection's curve after its node is dragged somewhere new. */
export function generateStraightBeads(from: LayoutPoint, to: LayoutPoint): LayoutPoint[] {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const interior = Math.max(1, Math.min(6, Math.round(dist / DEFAULT_EDGE_SEGMENT_LEN) - 1));
  const beads: LayoutPoint[] = [];
  for (let i = 1; i <= interior; i++) {
    const t = i / (interior + 1);
    beads.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
  }
  return beads;
}

/** A reasonable starting layout for the Tech Layout Editor: each node placed
 * at its tier's (prereq-depth's) nominal ring radius, in its branch's
 * compass direction, with a small deterministic per-node spread so siblings
 * fan out instead of stacking on one ray. Every connection gets a few
 * straight-line interior beads to drag into a curve. This is a one-time
 * seed for hand design, not something the game itself ever runs. */
export function generateDefaultLayout(): TechTreeLayoutData {
  const depths = computeDepths();
  const nodes: Record<string, LayoutPoint> = { [ROOT_NODE_ID]: { x: 0, y: 0 } };

  for (const id of Object.keys(TECH_NODES)) {
    const depth = depths.get(id) ?? 0;
    const r = DEFAULT_ROOT_EDGE_LEN + depth * DEFAULT_EDGE_LEN;
    const angle = themeAngle(id);
    nodes[id] = { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
  }

  const edges: Record<string, LayoutPoint[]> = {};
  for (const { fromId, toId } of allEdgePairs()) {
    const from = nodes[fromId], to = nodes[toId];
    if (!from || !to) continue;
    edges[edgeKey(fromId, toId)] = generateStraightBeads(from, to);
  }

  return { version: 1, nodes, edges };
}
