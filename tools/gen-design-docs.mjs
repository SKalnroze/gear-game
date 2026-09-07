#!/usr/bin/env node
// @ts-check
/**
 * Regenerate the numeric tables in the design documents from the game's own
 * constants.
 *
 * The design docs are the source of truth for *intent*; the constants remain
 * the source of truth for *values*. Hand-copying values into prose is how
 * design docs rot, so every table lives between markers and is written here:
 *
 *   <!-- BEGIN GENERATED: gears.catalogue -->
 *   ...table...
 *   <!-- END GENERATED: gears.catalogue -->
 *
 *   node tools/gen-design-docs.mjs           rewrite the blocks
 *   node tools/gen-design-docs.mjs --check   exit 1 if any block is stale
 *
 * The constants are TypeScript, so they are bundled with the esbuild binary
 * that already ships inside Vite — this script adds no dependencies.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

// ─── Loading the constants ────────────────────────────────────────────────

/** Bundle the constants modules to ESM and import them. */
async function loadConstants() {
  const dir = mkdtempSync(join(tmpdir(), 'gear-docs-'));
  const entry = join(dir, 'entry.ts');
  const out = join(dir, 'bundle.mjs');

  // One entry re-exporting everything the tables need, namespaced so that
  // same-named constants from different modules cannot collide.
  writeFileSync(entry, `
    export * as gear from ${JSON.stringify(join(ROOT, 'src/constants/gear.constants.ts'))};
    export * as unit from ${JSON.stringify(join(ROOT, 'src/constants/unit.constants.ts'))};
    export * as tech from ${JSON.stringify(join(ROOT, 'src/constants/tech.constants.ts'))};
    export * as ability from ${JSON.stringify(join(ROOT, 'src/constants/ability.constants.ts'))};
    export * as balance from ${JSON.stringify(join(ROOT, 'src/constants/balance.constants.ts'))};
    export * as world from ${JSON.stringify(join(ROOT, 'src/constants/world.constants.ts'))};
    export * as gearRegistry from ${JSON.stringify(join(ROOT, 'src/gears/registry.ts'))};
    export * as power from ${JSON.stringify(join(ROOT, 'src/constants/power.constants.ts'))};
    export * as thermal from ${JSON.stringify(join(ROOT, 'src/constants/thermal.constants.ts'))};
    export * as tier from ${JSON.stringify(join(ROOT, 'src/constants/tier.constants.ts'))};
    export * as unitUtils from ${JSON.stringify(join(ROOT, 'src/systems/unit.utils.ts'))};
  `.replace(/\\/g, '\\\\'));

  const esbuild = join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'esbuild.cmd' : 'esbuild');
  execFileSync(esbuild, [entry, '--bundle', '--format=esm', `--outfile=${out}`, '--log-level=warning'], {
    cwd: ROOT,
    stdio: ['ignore', 'inherit', 'inherit'],
    shell: process.platform === 'win32',
  });

  const mod = await import(pathToFileURL(out).href);
  rmSync(dir, { recursive: true, force: true });
  return mod;
}

// ─── Rendering helpers ────────────────────────────────────────────────────

/** @param {unknown} s */
const title = (s) => String(s).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
/** @param {number} n */
const num = (n) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(4))));
/** Escape a pipe so a value cannot break out of a markdown table cell. */
/** @param {unknown} s */
const cell = (s) => String(s).replace(/\|/g, '\\|');
/** @param {number} ms */
const secs = (ms) => `${Number((ms / 1000).toFixed(1))}s`;

/**
 * @param {string[]} headers
 * @param {unknown[][]} rows
 */
function table(headers, rows) {
  const head = `| ${headers.join(' | ')} |`;
  const rule = `|${headers.map(() => '---').join('|')}|`;
  return [head, rule, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n');
}

// ─── Blocks ───────────────────────────────────────────────────────────────

/**
 * Render every generated block.
 * @param {any} m namespaced constants bundle
 * @returns {Record<string, string>}
 */
function buildBlocks(m) {
  const { gear, unit, tech, ability, balance, world, tier, power, thermal, gearRegistry, unitUtils } = m;
  /** @type {Record<string, string>} */
  const blocks = {};

  // Gear catalogue -------------------------------------------------------
  // basePowerCost/synergies were removed from GearDefinition entirely
  // (divergences #9, #10) -- power was never a stored resource and nothing
  // read the declared synergies, so both fields were pure fiction.
  blocks['gears.catalogue'] = table(
    ['Gear', 'Category', 'Gold cost', 'Unlocked by', 'In-game description'],
    Object.values(gear.GEAR_DEFINITIONS).map((d) => [
      title(d.type),
      gearRegistry.GEAR_BEHAVIOURS[d.type].category,
      num(d.goldCost),
      d.unlockNode ? `\`${d.unlockNode}\`` : '_from start_',
      d.description,
    ]),
  );

  // Gear formulas --------------------------------------------------------
  const T = gear.DEFAULT_TEETH;
  blocks['gears.formulas'] = table(
    ['Quantity', 'Formula', `At ${T} teeth`, 'Scaling'],
    [
      ['Radius', '`teeth × 2.5`', `${num(gear.gearRadius(T))} px`, 'linear'],
      ['Motor output', '`teeth × 0.4`', num(gear.motorOutput(T)), 'linear'],
      ['Motor torque', '`teeth² × 0.8`', num(gear.motorTorque(T)), 'quadratic'],
      ['Spike damage', '`teeth × 0.5`', num(gear.spikeDamage(T)), 'linear, × spin'],
      ['Max HP', '`round(teeth² × 0.5)`', num(gear.gearMaxHp(T, 'motor')), 'quadratic; armored ×3, spiked ×0.7'],
      ['Mining output', '`teeth × 0.3`', num(gear.miningOutput(T)), 'linear'],
      ['Researcher output', '`teeth × 150` ms', `${num(gear.researcherOutput(T))} ms`, 'linear'],
      ['Converter output', '`teeth × 0.25`', num(gear.converterOutput(T)), 'linear'],
      ['Healer output', '`teeth × 1.5`', num(gear.healerOutput(T)), 'linear'],
      ['Healer radius', '`radius × 3`', `${num(gear.healerRadius(T))} px`, 'linear'],
      ['Turret ammo', '`max(3, round(teeth × 0.5))`', num(gear.turretMaxAmmo(T)), 'linear, floor 3'],
      ['Crossbow turret range', '`size(teeth) × 4 × 0.75`', `${num(gear.turretRange(T, 'crossbow_turret'))} px`, 'linear -- always 0.75x the mobile Crossbow\'s own range'],
      ['Artillery turret range', '`size(teeth) × 10 × 0.8`', `${num(gear.turretRange(T, 'artillery_turret'))} px`, 'linear -- always 0.8x the mobile Artillery\'s own range'],
    ],
  );

  // Unit stats -----------------------------------------------------------
  blocks['units.stats'] = table(
    ['Unit', 'HP', 'Speed', 'Combat dmg', 'Base dmg', 'Cost', 'Range @10t'],
    Object.values(unit.UNIT_DEFINITIONS).map((d) => {
      const scaled = unitUtils.computeScaledStats(d, T, d.type);
      return [
        title(d.type),
        num(d.hp),
        num(d.speed),
        num(d.baseDamage),
        num(d.damage),
        d.costAmount ? `${num(d.costAmount)} ${d.costResource}` : '—',
        num(scaled.attackRange),
      ];
    }),
  );

  // Unit scaling exponents ----------------------------------------------
  blocks['units.scaling'] = table(
    ['Stat', 'Formula', 'Effect of bigger gears'],
    [
      ['HP', '`base × s^1.5`', 'grows faster than size — bigger is tankier'],
      ['Speed', '`base × s^-0.5`', 'shrinks — bigger is slower'],
      ['Damage', '`base × s^1.2`', 'grows'],
      ['Size', '`teeth × 1.2`', 'linear'],
      ['Attack range', '`36 × s^0.8` (artillery `size × 10`, sentinel `size × 6`)', 'grows sublinearly'],
      ['Mass', '`10 × s² × typeMult`', 'quadratic'],
      ['Cost', '`base × s^1.3`', 'grows faster than output'],
    ],
  );

  // Counter matrix -------------------------------------------------------
  const unitKeys = Object.keys(unit.UNIT_DEFINITIONS);
  blocks['units.counters'] = table(
    ['Attacker ↓ / Defender →', ...unitKeys.map((k) => title(k))],
    unitKeys.map((a) => [
      `**${title(a)}**`,
      ...unitKeys.map((d) => {
        const v = unit.getCounterMultiplier(a, d);
        return v === 1 ? '·' : `${num(v)}×`;
      }),
    ]),
  );

  // Abilities ------------------------------------------------------------
  blocks['abilities'] = table(
    ['Ability', 'Kind', 'Cooldown', 'Description'],
    Object.values(ability.ABILITY_DEFINITIONS).map((a) => [
      a.name,
      a.passive ? 'passive' : 'active',
      a.cooldownMs > 0 ? secs(a.cooldownMs) : '—',
      a.description,
    ]),
  );

  // Tech tree, one block per column --------------------------------------
  const COLUMNS = { 0: 'gears', 1: 'units', 2: 'economy', 3: 'abilities', 4: 'defense' };
  /** @param {any} e */
  const effectText = (e) => {
    const { kind, ...rest } = e;
    const detail = Object.entries(rest).map(([k, v]) => `${k}=${v}`).join(', ');
    return detail ? `\`${kind}\` (${detail})` : `\`${kind}\``;
  };
  for (const [col, name] of Object.entries(COLUMNS)) {
    const nodes = Object.values(tech.TECH_NODES)
      .filter((n) => n.column === Number(col))
      .sort((a, b) => a.tier - b.tier || a.goldCost - b.goldCost);
    blocks[`tech.${name}`] = table(
      ['Node', 'Tier', 'Gold', 'Time', 'Requires', 'Effects'],
      nodes.map((n) => [
        `**${n.name}**<br>\`${n.id}\``,
        `T${n.tier}`,
        num(n.goldCost),
        secs(n.researchTime),
        n.prereqs.length ? n.prereqs.map((/** @type {string} */ p) => `\`${p}\``).join('<br>') : '—',
        n.effects.map(effectText).join('<br>'),
      ]),
    );
  }

  const allNodes = Object.values(tech.TECH_NODES);
  blocks['tech.summary'] = table(
    ['Column', 'Nodes', 'Total gold', 'Total research time'],
    [
      ...Object.entries(COLUMNS).map(([col, name]) => {
        const ns = allNodes.filter((n) => n.column === Number(col));
        return [
          title(name),
          String(ns.length),
          num(ns.reduce((s, n) => s + n.goldCost, 0)),
          secs(ns.reduce((s, n) => s + n.researchTime, 0)),
        ];
      }),
      [
        '**All**',
        `**${allNodes.length}**`,
        `**${num(allNodes.reduce((s, n) => s + n.goldCost, 0))}**`,
        `**${secs(allNodes.reduce((s, n) => s + n.researchTime, 0))}**`,
      ],
    ],
  );

  // Balance constants ----------------------------------------------------
  /**
   * @param {string} key
   * @param {string} meaning
   */
  const bal = (key, meaning) => [`\`${key}\``, num(balance[key]), meaning];
  blocks['balance.constants'] = table(
    ['Constant', 'Value', 'Governs'],
    [
      bal('BASE_GOLD_PER_SEC', 'passive income for both sides'),
      bal('GOLD_TICK_INTERVAL', 'income tick, ms'),
      bal('BASE_MAX_HP', 'starting base HP'),
      bal('AMPLIFIER_CHAIN_MULTIPLIER', 'per-amplifier chain output multiplier'),
      bal('CAPACITOR_BURST_MULTIPLIER', 'capacitor burst size'),
      bal('CAPACITOR_BURST_ROTATIONS', 'rotations between bursts'),
      bal('CAPACITOR_OVERCLOCK_BURST_BONUS', 'added to the multiplier beside a live overclock'),
      bal('OVERCLOCK_DURATION', 'boost window, ms'),
      bal('OVERCLOCK_BURNOUT_DURATION', 'downtime after burnout, ms'),
      bal('OVERCLOCK_SPEED_BONUS', 'omega and torque bonus to neighbours'),
      bal('JAM_DAMAGE_RATE', 'HP/sec per unit of jam stress'),
      bal('JAM_STRESS_MULTIPLIER', 'torque → stress'),
      bal('COMBAT_TICK_INTERVAL', 'combat resolution period, ms'),
      bal('ENGAGE_DISTANCE', 'default melee range, px'),
      bal('ARMORED_DAMAGE_RATE', 'unit damage to armored gears'),
      bal('UNIT_GEAR_DAMAGE_RATE', 'unit damage to ordinary gears'),
      bal('SLIME_FRICTION_VALUE', 'friction a slime puddle adds to gears standing in it'),
      bal('AI_POLL_INTERVAL', 'how often the AI re-evaluates the board, ms (actual action rate is throttled by its APM budget, not this)'),
      bal('AI_ACTION_BUDGET_CAPACITY', 'AI action-budget burst allowance, actions'),
      bal('GEAR_PLACEMENT_COST_BASE', 'flat gold per gear'),
      bal('GEAR_PLACEMENT_COST_MULTIPLIER', 'gold per tooth'),
      bal('REPOSITION_COOLDOWN_MS', 'gear move cooldown'),
    ],
  );

  // World constants ------------------------------------------------------
  /**
   * @param {string} key
   * @param {string} meaning
   */
  const w = (key, meaning) => [`\`${key}\``, num(world[key]), meaning];
  blocks['world.constants'] = table(
    ['Constant', 'Value', 'Meaning'],
    [
      w('WORLD_WIDTH', 'arena width, px'),
      w('WORLD_HEIGHT', 'arena height, px'),
      w('PLAYER_ZONE_MAX_X', 'right edge of the left build zone'),
      w('AI_ZONE_MIN_X', 'left edge of the right build zone'),
      w('LANE_Y_MIN', 'top of the lane band'),
      w('LANE_Y_MAX', 'bottom of the lane band'),
      w('PLAYER_BASE_X', 'left base centre'),
      w('AI_BASE_X', 'right base centre'),
      w('SNAP_THRESHOLD', 'mesh snap grab distance, px'),
    ],
  );

  // Dependency versions --------------------------------------------------
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const ROLES = {
    phaser: 'Game engine',
    'phaser3-rex-plugins': 'In-canvas UI widgets',
    tone: 'Procedural music synthesis',
    typescript: 'Language',
    vite: 'Dev server and bundler',
    vitest: 'Unit test runner',
    '@vitest/coverage-v8': 'Coverage',
    '@playwright/test': 'End-to-end tests and the screenshot tool',
    'happy-dom': 'DOM environment for UI tests',
  };
  blocks['stack.versions'] = table(
    ['Package', 'Version', 'Role'],
    Object.entries(ROLES)
      .filter(([name]) => pkg.dependencies?.[name] || pkg.devDependencies?.[name])
      .map(([name, role]) => [
        `\`${name}\``,
        pkg.dependencies?.[name] ?? pkg.devDependencies?.[name],
        pkg.dependencies?.[name] ? `${role} (runtime)` : role,
      ]),
  );

  // Gear physics ---------------------------------------------------------
  blocks['gears.physics'] = table(
    ['Constant', 'Value', 'Meaning'],
    [
      ['`GEAR_MODULE`', num(gear.GEAR_MODULE), 'px of radius per tooth'],
      ['`GEAR_MESH_TOLERANCE`', num(gear.GEAR_MESH_TOLERANCE), 'px of slack when deciding two gears mesh'],
      ['`BASE_INERTIA`', num(gear.BASE_INERTIA), 'rotational inertia of a tier-1 gear; steps x1.5 per tier alongside torque, so tier never changes the speed of a lone motor'],
      ['`INERTIA_DENSITY`', String(gear.INERTIA_DENSITY), 'density fed to Matter.js for real unit body mass/inertia (no longer on the gear rotation path)'],
      ['`DEFAULT_TEETH`', num(gear.DEFAULT_TEETH), 'teeth of a tier-1 gear'],
      ['`MAX_GEAR_TEETH`', num(gear.MAX_GEAR_TEETH), 'teeth of a tier-5 gear; sizes the collision grid'],
    ],
  );

  // Tier ladder ------------------------------------------------------------
  blocks['gears.tiers'] = table(
    ['Tier', 'Teeth', 'Radius (px)', 'Strength x', 'Range x', 'Cost x'],
    Object.keys(tier.TIER_TEETH).map((t) => {
      const n = Number(t);
      return [
        `**T${n}**`,
        num(tier.TIER_TEETH[n]),
        num(tier.TIER_TEETH[n] * gear.GEAR_MODULE),
        num(tier.tierPower(n)),
        num(tier.tierRangeFactor(n)),
        num(tier.tierCostFactor(n)),
      ];
    }),
  );

  // Electrical grid -------------------------------------------------------
  blocks['power.constants'] = table(
    ['Constant', 'Value', 'Meaning'],
    [
      ['`WIRE_BASE_RANGE`', num(power.WIRE_BASE_RANGE), 'px an ordinary electrical gear can throw a wire'],
      ['`POLE_RANGE`', num(power.POLE_RANGE), 'px a power pole can span -- its entire purpose'],
      ['`MAX_WIRES_PER_GEAR` / `_POLE`', `${num(power.MAX_WIRES_PER_GEAR)} / ${num(power.MAX_WIRES_PER_POLE)}`, 'terminals, so the network stays readable'],
      ['`SOLAR_OUTPUT`', num(power.SOLAR_OUTPUT), 'tier-1 solar generation, per second'],
      ['`BURNER_OUTPUT`', num(power.BURNER_OUTPUT), 'tier-1 burner generation, per second'],
      ['`BURNER_COAL_PER_SEC`', num(power.BURNER_COAL_PER_SEC), 'coal a tier-1 burner eats per second'],
      ['`BURNER_SELF_HEAT`', num(power.BURNER_SELF_HEAT), 'heat a running burner adds to itself per second'],
      ['`CRANK_OUTPUT`', num(power.CRANK_OUTPUT), 'peak hand-crank output, decaying to zero'],
      ['`CRANK_WINDOW_MS`', num(power.CRANK_WINDOW_MS), 'ms one crank click lasts'],
      ['`BATTERY_CAPACITY`', num(power.BATTERY_CAPACITY), 'tier-1 storage'],
      ['`BATTERY_MAX_DISCHARGE`', num(power.BATTERY_MAX_DISCHARGE), 'cap on stored power released per second'],
      ['`MOTOR_DRAW`', num(power.MOTOR_DRAW), 'electricity a tier-1 motor asks for'],
      ['`MOTOR_BASELINE`', num(power.MOTOR_BASELINE), 'torque fraction of an unpowered motor (staged at 1.0 until the grid is playable)'],
      ['`TIE_INTAKE`', num(power.TIE_INTAKE), 'surplus the grid tie buys per second'],
      ['`GOLD_PER_ELECTRICITY`', num(power.GOLD_PER_ELECTRICITY), 'gold per unit of electricity sold'],
      ['`OVERLOAD_HEAT_PER_UNIT`', num(power.OVERLOAD_HEAT_PER_UNIT), 'heat per unit of surplus with nowhere to go'],
    ],
  );

  // Heat and oil -----------------------------------------------------------
  blocks['thermal.constants'] = table(
    ['Constant', 'Value', 'Meaning'],
    [
      ['`FRICTION_K`', num(thermal.FRICTION_K), 'friction heat coefficient, calibrated so ~8 rad/s seizes a dry tier-1 gear'],
      ['`FRICTION_SPEED_EXP`', num(thermal.FRICTION_SPEED_EXP), 'heat grows with |omega| to this power -- speed costs more than linearly'],
      ['`COOL_K`', num(thermal.COOL_K), 'fraction of stored heat shed per second'],
      ['`HEAT_THRESHOLD_BASE`', num(thermal.HEAT_THRESHOLD_BASE), 'heat a tier-1 gear tolerates dry'],
      ['`HEAT_THRESHOLD_TIER_STEP`', num(thermal.HEAT_THRESHOLD_TIER_STEP), 'per tier: more metal, more heat soaked'],
      ['`HOT_FRACTION`', num(thermal.HOT_FRACTION), 'threshold fraction at which efficiency starts falling'],
      ['`SEIZE_RELEASE_FRACTION`', num(thermal.SEIZE_RELEASE_FRACTION), 'hysteresis: a seized gear releases only below this'],
      ['`HOT_EFFICIENCY_FLOOR`', num(thermal.HOT_EFFICIENCY_FLOOR), 'efficiency just before seizing'],
      ['`SEIZE_STRESS_BASE`', num(thermal.SEIZE_STRESS_BASE), 'tier-1 damage stress applied while seized'],
      ['`SEIZE_RAMP_PER_SEC`', num(thermal.SEIZE_RAMP_PER_SEC), 'how fast an ignored seizure escalates'],
      ['`OIL_CAPACITY_BASE`', num(thermal.OIL_CAPACITY_BASE), 'oil a tier-1 gear holds'],
      ['`OILER_CAPACITY_MULT`', num(thermal.OILER_CAPACITY_MULT), 'the oiler is a reservoir, not a consumer'],
      ['`OIL_PER_ROTATION` / `COAL_PER_OIL_ROTATION`', `${num(thermal.OIL_PER_ROTATION)} / ${num(thermal.COAL_PER_OIL_ROTATION)}`, 'oil made per rotation, and the coal it costs'],
      ['`OIL_FRICTION_RELIEF`', num(thermal.OIL_FRICTION_RELIEF), 'friction a full film avoids'],
      ['`OIL_BLEED_K`', num(thermal.OIL_BLEED_K), 'extra cooling from a full film'],
      ['`OIL_THRESHOLD_BONUS`', num(thermal.OIL_THRESHOLD_BONUS), 'how much a full film raises the seize point'],
      ['`OIL_DIFFUSE_K`', num(thermal.OIL_DIFFUSE_K), 'how fast oil spreads along meshed teeth'],
    ],
  );

  return blocks;
}

// ─── Splicing ─────────────────────────────────────────────────────────────

const DOCS = [
  'docs/GAME_DESIGN.md',
  'docs/design/views.md',
  'docs/design/gears.md',
  'docs/design/units.md',
  'docs/design/tech-tree.md',
  'docs/design/balance.md',
  'docs/design/presentation.md',
  'docs/design/tech-stack.md',
];

/**
 * @param {string} text
 * @param {Record<string, string>} blocks
 * @param {string} file
 * @param {Set<string>} seen
 * @param {string[]} problems
 */
function splice(text, blocks, file, seen, problems) {
  const re = /(<!-- BEGIN GENERATED: ([\w.-]+) -->)([\s\S]*?)(<!-- END GENERATED: \2 -->)/g;
  return text.replace(re, (whole, begin, id, body, end) => {
    if (!(id in blocks)) {
      problems.push(`${file}: unknown generated block "${id}"`);
      return whole;
    }
    seen.add(id);
    return `${begin}\n${blocks[id]}\n${end}`;
  });
}

async function main() {
  const blocks = buildBlocks(await loadConstants());
  const seen = new Set();
  const problems = [];
  const stale = [];

  for (const rel of DOCS) {
    const path = join(ROOT, rel);
    if (!existsSync(path)) {
      problems.push(`missing document: ${rel}`);
      continue;
    }
    const before = readFileSync(path, 'utf8');
    const after = splice(before, blocks, rel, seen, problems);

    if (before === after) continue;
    if (CHECK) stale.push(rel);
    else writeFileSync(path, after, 'utf8');
  }

  for (const id of Object.keys(blocks)) {
    if (!seen.has(id)) problems.push(`generated block "${id}" is not referenced by any document`);
  }

  if (problems.length) {
    console.error('Problems:');
    for (const p of problems) console.error(`  - ${p}`);
  }

  if (CHECK) {
    if (stale.length) {
      console.error('\nThese documents have stale generated tables:');
      for (const f of stale) console.error(`  - ${f}`);
      console.error('\nRun `npm run docs:gen` and commit the result.');
      process.exit(1);
    }
    if (problems.length) process.exit(1);
    console.log(`Design docs are up to date (${seen.size} generated blocks).`);
  } else {
    console.log(`Wrote ${seen.size} generated blocks across ${DOCS.length} documents.`);
    if (problems.length) process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
