import { GearState } from '../types/gear.types';
import { World } from '../world/World';
import { GearMeshGraph } from '../world/GearMeshGraph';
import { EventBus } from './EventBus';
import { GEAR_DEFINITIONS, gearInertia, motorTorque, motorOutput, crackLevelFor } from '../constants/gear.constants';
import { motorPowerFactor } from '../world/power.utils';
import { MOTOR_BASELINE } from '../constants/power.constants';
import {
  stepThermal, diffuseOil, escalatedSeizeStress, oilCapacityFor, thermalEfficiency,
  type OilNode,
} from './thermal.utils';
import { OIL_DIFFUSE_INTERVAL_MS, OILER_CAPACITY_MULT } from '../constants/thermal.constants';
import {
  AMPLIFIER_CHAIN_MULTIPLIER,
  COMBO_CHAIN_MIN_GEARS,
  OVERCLOCK_SPEED_BONUS,
  CAPACITOR_BURST_MULTIPLIER,
  CAPACITOR_BURST_ROTATIONS,
  CAPACITOR_OVERCLOCK_BURST_BONUS,
  OVERCLOCK_DURATION,
  OVERCLOCK_BURNOUT_DURATION,
  JAM_DAMAGE_RATE,
  JAM_STRESS_MULTIPLIER,
  jamSeverity,
  RELIEF_VALVE_SELF_DAMAGE_MULT,
  RELIEF_VALVE_NEIGHBOR_DAMAGE_MULT,
} from '../constants/balance.constants';
import { meshOmega } from '../utils/MathUtils';
import { GameClock } from './GameClock';
import type { EconomySystem } from './EconomySystem';

const TWO_PI = Math.PI * 2;

export interface ChainInfo {
  id: string;
  gearIds: string[];
  owner: 'player' | 'ai';
  hasMotor: boolean;
  hasAmplifier: boolean;
  hasConverter: boolean;
  hasCapacitor: boolean;
}

/**
 * Computes torque-based omega for each gear, tracks accumulated angle,
 * fires gear:full_rotation events.
 */
export class RotationPhysicsSystem {
  private world: World;
  private meshGraph: GearMeshGraph;
  private eventBus: EventBus;
  private clock: GameClock;

  private chains: Map<string, ChainInfo> = new Map();
  private capacitorRotationCount: Map<string, number> = new Map();

  // Jam tracking
  private jammedPairs: Map<string, string> = new Map();     // gearId → conflictingGearId
  /**
   * Gears stopped by HEAT, kept deliberately separate from `jammedPairs`.
   *
   * propagateTorque() clears every rotation-conflict jam each time it runs, and
   * it now runs whenever grid power changes rather than only on mesh changes.
   * If a heat seizure lived in that same map it would be wiped the instant a
   * battery charged, and overheating would silently do nothing. This set is
   * owned by the thermal step and cleared only by hysteresis release.
   */
  private seizedGears: Set<string> = new Set();
  private seizedSince: Map<string, number> = new Map();
  private lastOilDiffuseAt = Number.NEGATIVE_INFINITY;
  /** Heat owed from elsewhere (burner self-heat, electrical overload). */
  private externalHeat: ((gearId: string) => number) | null = null;

  private jamStressMap: Map<string, number> = new Map();    // gearId → stress value

  // Tech modifiers, per side. These were single values shared by both owners,
  // so one side's research changed the other side's chain output too.
  private powerBonusPct: Record<'player' | 'ai', number> = { player: 0, ai: 0 };
  // Additive bonus from researched tech, per side, on top of the base
  // multiplier. Used to overwrite an absolute value from a hard-coded 2.5
  // rather than composing -- a second capacitor tech node would have
  // silently replaced the first's bonus instead of stacking with it.
  private capacitorBurstBonus: Record<'player' | 'ai', number> = { player: 0, ai: 0 };
  /** Extra boost-window ms from researched overclock duration nodes, per side. */
  private overclockDurationBonus: Record<'player' | 'ai', number> = { player: 0, ai: 0 };
  /** Extra torque multiplier on chains of 4+ gears, from Combo Chain Bonus, per side. */
  private chainComboBonus: Record<'player' | 'ai', number> = { player: 0, ai: 0 };

  // Optional ability system refs (set after construction), one per side --
  // each side's overclock gears check that side's own AbilitySystem, not a
  // single player-only instance.
  private abilitySystem: { isUnlocked: (id: 'power_surge' | 'counter_intel' | 'overclock_no_burnout') => boolean } | null = null;
  private aiAbilitySystem: { isUnlocked: (id: 'power_surge' | 'counter_intel' | 'overclock_no_burnout') => boolean } | null = null;

  // Optional economy ref (set after construction) -- capacitor bursts credit
  // gold directly through it, once it is wired up.
  private economySystem: EconomySystem | null = null;

  /**
   * Torque a motor actually delivers, after electricity.
   *
   * An unpowered motor is not bricked -- it idles at MOTOR_BASELINE, so a
   * blackout slows you rather than ending the run. Power scales it back up to
   * full. This is the trade that replaced the old size-costs-speed penalty:
   * tier buys strength, electricity buys speed.
   */
  private poweredTorque(gear: GearState): number {
    return motorTorque(gear.teeth)
      * motorPowerFactor(gear.powerSatisfaction ?? 0, MOTOR_BASELINE)
      * thermalEfficiency(gear);
  }

  /**
   * Force a chain re-solve because motor power changed.
   *
   * Called only when a motor's QUANTISED satisfaction actually moved -- see
   * SATISFACTION_STEPS. Torque feeds an O(V+E) double BFS, so a continuously
   * drifting grid would otherwise rebuild every chain every frame.
   */
  /**
   * Source of heat produced outside the rotation model -- burners running, and
   * electrical overload dumped into the generators causing it. Wiring it as a
   * lookup rather than a system reference keeps PowerSystem out of this file.
   */
  setExternalHeatSource(source: (gearId: string) => number): void {
    this.externalHeat = source;
  }

  markChainsDirty(): void {
    this.rebuildChains();
  }

  private readonly onMeshUpdated = () => this.rebuildChains();
  private readonly onGearPlaced = ({ gear }: { gear: GearState }) => {
    // Overclock gears run on their own from the moment they are placed;
    // nothing else in the game ever started them.
    if (gear?.type === 'overclock') this.startOverclock(gear, this.clock.now);
    this.rebuildChains();
  };
  private readonly onGearRemoved = () => this.rebuildChains();

  constructor(world: World, meshGraph: GearMeshGraph, eventBus: EventBus, clock: GameClock) {
    this.world = world;
    this.meshGraph = meshGraph;
    this.eventBus = eventBus;
    this.clock = clock;

    this.eventBus.on('gear:mesh_updated', this.onMeshUpdated);
    this.eventBus.on('gear:placed', this.onGearPlaced);
    this.eventBus.on('gear:removed', this.onGearRemoved);
  }

  setPowerBonusPct(owner: 'player' | 'ai', pct: number): void {
    this.powerBonusPct[owner] = pct;
  }

  setCapacitorBurstBonus(owner: 'player' | 'ai', bonus: number): void {
    this.capacitorBurstBonus[owner] = bonus;
  }

  setChainComboBonus(owner: 'player' | 'ai', bonus: number): void {
    this.chainComboBonus[owner] = bonus;
  }

  /** Burst multiplier for a side, including researched bonuses. */
  private capacitorBurstMultiplier(owner: 'player' | 'ai'): number {
    return CAPACITOR_BURST_MULTIPLIER + this.capacitorBurstBonus[owner];
  }

  rebuildChains(): void {
    this.chains.clear();
    const allGears = this.world.getAllGears();

    const components = this.meshGraph.findConnectedComponents(allGears.keys());

    for (const component of components) {
      if (component.length === 0) continue;

      const chainId = component[0];
      const gears = component.map(id => allGears.get(id)).filter(Boolean) as GearState[];

      const hasMotor = gears.some(g => g.type === 'motor' && !g.isBurntOut);
      const hasAmplifier = gears.some(g => g.type === 'amplifier' && !g.isBurntOut);
      const hasCapacitor = gears.some(g => g.type === 'capacitor' && !g.isBurntOut);
      const hasConverter = gears.some(g =>
        (g.type === 'iron_converter' || g.type === 'crystal_converter' || g.type === 'aether_converter') && !g.isBurntOut,
      );
      const owner = gears[0]?.owner ?? 'player';

      this.chains.set(chainId, {
        id: chainId,
        gearIds: component,
        owner,
        hasMotor,
        hasAmplifier,
        hasConverter,
        hasCapacitor,
      });
    }

    this.propagateTorque();
  }

  /**
   * Two-pass BFS: Pass 1 computes chain physics, Pass 2 propagates with jam detection.
   */
  propagateTorque(): void {
    const allGears = this.world.getAllGears();
    const visited = new Set<string>();

    // Reset all velocities
    for (const [, gear] of allGears) {
      gear.angularVelocity = 0;
      gear.torqueOutput = 0;
      gear.isSpinning = false;
    }

    // Clear jams from previous cycle -- but never a heat seizure, which this
    // pass does not own and must not silently undo.
    for (const gearId of this.jammedPairs.keys()) {
      if (this.seizedGears.has(gearId)) continue;
      const gear = allGears.get(gearId);
      if (gear) {
        gear.isJammed = false;
        gear.jamStress = 0;
        this.world.updateGear(gear);
        this.eventBus.emit('gear:jam_cleared', { gearId });
      }
    }
    this.jammedPairs.clear();
    this.jamStressMap.clear();

    // BFS from each motor
    for (const [, gear] of allGears) {
      if (gear.type !== 'motor' || gear.isBurntOut || visited.has(gear.id)) continue;
      // A seized motor drives nothing until it cools.
      if (this.seizedGears.has(gear.id)) continue;

      // Pass 1: Compute chain physics for this motor's chain
      const chainGearIds = this.getChainGearIds(gear.id, visited);
      const chainGears = chainGearIds.map(id => allGears.get(id)).filter(Boolean) as GearState[];
      const correctedMotorOmega = this.computeChainPhysics(chainGearIds, chainGears, allGears, gear.owner);

      // Pass 2: Propagate torque with jam detection
      const mTorque = this.poweredTorque(gear);
      gear.angularVelocity = correctedMotorOmega;
      gear.torqueOutput = mTorque;
      gear.isSpinning = true;
      visited.add(gear.id);

      const queue: Array<{ id: string; omega: number; torque: number }> = [
        { id: gear.id, omega: correctedMotorOmega, torque: mTorque },
      ];

      while (queue.length > 0) {
        const { id: currentId, omega: currentOmega, torque: currentTorque } = queue.shift()!;
        const current = allGears.get(currentId);
        if (!current) continue;

        const currentTeeth = current.teeth;

        for (const neighborId of this.meshGraph.getNeighbors(currentId)) {
          // Check for jam on conflicting paths
          if (visited.has(neighborId)) {
            const neighbor = allGears.get(neighborId);
            if (neighbor && !neighbor.isBurntOut) {
              const incomingOmega = meshOmega(currentOmega, currentTeeth, neighbor.teeth);
              if (neighbor.angularVelocity !== 0 &&
                  Math.sign(incomingOmega) !== Math.sign(neighbor.angularVelocity)) {
                this.markJammed(current, neighbor, currentTorque);
              }
            }
            continue;
          }

          const neighbor = allGears.get(neighborId);
          if (!neighbor || neighbor.isBurntOut || this.seizedGears.has(neighborId)) continue;

          const neighborTeeth = neighbor.teeth;

          // Torque attenuation by gear ratio
          const neighborTorque = currentTorque * (currentTeeth / neighborTeeth);
          const neighborOmega = meshOmega(currentOmega, currentTeeth, neighborTeeth);

          // Apply overclock boost from adjacent overclock gears
          const overclockBoost = this.getOverclockBoost(neighborId, allGears);
          const finalOmega = neighborOmega * (1 + overclockBoost);
          const effectiveTorque = neighborTorque * (1 + overclockBoost);

          neighbor.angularVelocity = finalOmega;
          neighbor.torqueOutput = effectiveTorque;
          neighbor.isSpinning = true;
          visited.add(neighborId);
          this.world.updateGear(neighbor);

          queue.push({ id: neighborId, omega: finalOmega, torque: effectiveTorque });
        }
      }

      this.world.updateGear(gear);
    }
  }

  /**
   * Get all gears in a chain starting from a motor gear (without adding to visited).
   */
  private getChainGearIds(gearId: string, visited: Set<string>): string[] {
    const allGears = this.world.getAllGears();
    const result: string[] = [];
    const queue: string[] = [gearId];
    const localVisited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (localVisited.has(current) || visited.has(current)) continue;
      localVisited.add(current);
      result.push(current);

      const neighbors = this.meshGraph.getNeighbors(current);
      for (const nId of neighbors) {
        const n = allGears.get(nId);
        // A seized gear is a wall: torque does not cross it, which is what
        // makes an overheat stop the chain rather than just the one gear.
        if (n && !n.isBurntOut && !this.seizedGears.has(nId)
            && !localVisited.has(nId) && !visited.has(nId)) {
          queue.push(nId);
        }
      }
    }
    return result;
  }

  /**
   * Pass 1: Compute physics for a chain and return corrected motor omega.
   */
  private computeChainPhysics(
    chainGearIds: string[],
    chainGears: GearState[],
    allGears: Map<string, GearState>,
    owner: 'player' | 'ai'
  ): number {
    // Compute effective inertia and total motor torque
    let chainEffectiveInertia = 0;
    let totalMotorTorque = 0;
    let totalFrictionLoad = 0;

    // Build omega ratios from first motor
    const omegaRatios = new Map<string, number>();
    const queue: Array<{ id: string; ratio: number }> = [];

    // Find first motor and start BFS
    let firstMotorId: string | null = null;
    for (const gId of chainGearIds) {
      const g = allGears.get(gId);
      if (g && g.type === 'motor' && !g.isBurntOut) {
        firstMotorId = gId;
        break;
      }
    }

    if (!firstMotorId) return 0; // No motor, no rotation

    omegaRatios.set(firstMotorId, 1.0);
    queue.push({ id: firstMotorId, ratio: 1.0 });
    const localVisited = new Set<string>([firstMotorId]);
    // Set, not the array: this is the inner loop of a BFS that now re-runs
    // whenever grid power changes, and `chainGearIds.includes` made it O(n^2)
    // per chain.
    const chainMembers = new Set(chainGearIds);

    // BFS to compute ratio for each gear relative to motor
    while (queue.length > 0) {
      const { id: currentId, ratio: currentRatio } = queue.shift()!;
      const current = allGears.get(currentId);
      if (!current) continue;

      for (const nId of this.meshGraph.getNeighbors(currentId)) {
        if (localVisited.has(nId)) continue;
        const neighbor = allGears.get(nId);
        if (!neighbor || !chainMembers.has(nId)) continue;

        const neighborRatio = currentRatio * (current.teeth / neighbor.teeth);
        omegaRatios.set(nId, neighborRatio);
        localVisited.add(nId);
        queue.push({ id: nId, ratio: neighborRatio });
      }
    }

    // Compute inertia and torque
    let amplifierCount = 0;
    for (const gId of chainGearIds) {
      const g = allGears.get(gId);
      if (!g) continue;

      const ratio = omegaRatios.get(gId) ?? 0;
      const inertia = gearInertia(g.teeth);
      chainEffectiveInertia += inertia * (ratio * ratio);
      totalFrictionLoad += g.frictionLoad;

      if (g.type === 'motor' && !g.isBurntOut) {
        // Motor torque is scaled by its omega ratio at the reference frame (power conservation: P = τ × ω)
        totalMotorTorque += this.poweredTorque(g) * (omegaRatios.get(gId) ?? 1.0);
      }
      if (g.type === 'amplifier' && !g.isBurntOut) {
        amplifierCount++;
      }
    }

    // Each amplifier multiplies the chain's total torque, stacking. This is
    // the amplifier's whole purpose: since omega = torque / inertia, boosting
    // torque directly speeds up every gear on the chain, so everything hanging
    // off gear:full_rotation (spawning, mining, research, healing, reload)
    // happens more often. Previously this multiplier only fed an unbanked
    // "power" figure consumed solely by the capacitor burst -- so a chain
    // with no capacitor gained nothing from an amplifier at all.
    if (amplifierCount > 0) {
      totalMotorTorque *= Math.pow(AMPLIFIER_CHAIN_MULTIPLIER, amplifierCount);
    }

    // Combo Chain Bonus: a second, gear-type-agnostic way into the same
    // "big chain spins faster" territory the amplifier occupies -- reward
    // the chain's *size* directly rather than one specific gear on it.
    const comboBonus = this.chainComboBonus[owner];
    if (comboBonus > 0 && chainGearIds.length >= COMBO_CHAIN_MIN_GEARS) {
      totalMotorTorque *= 1 + comboBonus;
    }

    // Return corrected motor omega with friction
    const correctedOmega = totalMotorTorque / (chainEffectiveInertia + totalFrictionLoad);
    return correctedOmega;
  }

  /**
   * Mark two gears as jammed and record stress.
   */
  private markJammed(gearA: GearState, gearB: GearState, torque: number): void {
    const stress = torque * JAM_STRESS_MULTIPLIER;

    gearA.isJammed = true;
    gearA.angularVelocity = 0;
    gearA.isSpinning = false;
    gearA.jamStress = stress;
    this.jamStressMap.set(gearA.id, stress);
    this.jammedPairs.set(gearA.id, gearB.id);
    this.world.updateGear(gearA);

    gearB.isJammed = true;
    gearB.angularVelocity = 0;
    gearB.isSpinning = false;
    gearB.jamStress = stress;
    this.jamStressMap.set(gearB.id, stress);
    this.jammedPairs.set(gearB.id, gearA.id);
    this.world.updateGear(gearB);

    this.eventBus.emit('gear:jammed', {
      gearId: gearA.id,
      conflictingGearId: gearB.id,
      torque,
      severity: jamSeverity(stress),
    });
  }

  /** True when a meshed neighbour is an overclock gear inside its boost window. */
  private hasActiveOverclockNeighbor(gearId: string, allGears: Map<string, GearState>): boolean {
    return this.getOverclockBoost(gearId, allGears) > 0;
  }

  private getOverclockBoost(gearId: string, allGears: Map<string, GearState>): number {
    const now = this.clock.now;
    const neighbors = this.meshGraph.getNeighbors(gearId);
    for (const nId of neighbors) {
      const n = allGears.get(nId);
      if (n?.type === 'overclock' && !n.isBurntOut && n.overclockUntil && now < n.overclockUntil) {
        return OVERCLOCK_SPEED_BONUS;
      }
    }
    return 0;
  }

  /**
   * Main update — accumulate angles, fire full-rotation events, and apply jam damage.
   */
  update(deltaSec: number): void {
    const now = this.clock.now;
    const allGears = this.world.getAllGears();

    for (const [, gear] of allGears) {
      if (!gear.isSpinning) continue;

      gear.currentAngle += gear.angularVelocity * deltaSec;
      const deltaAngle = Math.abs(gear.angularVelocity) * deltaSec;
      gear.accumulatedAngle += deltaAngle;

      while (gear.accumulatedAngle >= TWO_PI) {
        gear.accumulatedAngle -= TWO_PI;
        this.onFullRotation(gear, allGears);
      }

      this.world.updateGear(gear);
    }

    // Heat and oil, in this same pass: omega is already in hand, and a seizure
    // set here has to be visible to the damage loop below in the SAME frame.
    this.stepHeat(allGears, deltaSec, now);
    this.stepOil(allGears, now);

    // Apply jam damage
    for (const [gearId, stress] of this.jamStressMap) {
      const gear = allGears.get(gearId);
      if (!gear?.isJammed) {
        this.jamStressMap.delete(gearId);
        continue;
      }

      let dmg = stress * JAM_DAMAGE_RATE * deltaSec;
      // Relief valve: a gear built to take a jam for the chain instead of
      // breaking. Reduces its own jam damage sharply, and softens damage on
      // a meshed neighbour that's jammed too -- the mechanical equivalent of
      // a clutch or flywheel absorbing shock so the rest of the train
      // doesn't have to.
      if (gear.type === 'relief_valve') {
        dmg *= RELIEF_VALVE_SELF_DAMAGE_MULT;
      } else if (this.meshGraph.getNeighbors(gearId).some(nId => allGears.get(nId)?.type === 'relief_valve')) {
        dmg *= RELIEF_VALVE_NEIGHBOR_DAMAGE_MULT;
      }
      gear.hp = Math.max(0, gear.hp - dmg);
      gear.crackLevel = crackLevelFor(gear.hp, gear.maxHp);
      this.world.updateGear(gear);

      this.eventBus.emit('gear:damaged', {
        gearId,
        damage: dmg,
        remainingHp: gear.hp,
        source: this.seizedGears.has(gearId) ? 'heat' : 'jam',
      });

      if (gear.hp <= 0) {
        const cookedItself = this.seizedGears.has(gearId);
        this.jamStressMap.delete(gearId);
        this.jammedPairs.delete(gearId);
        this.seizedGears.delete(gearId);
        this.seizedSince.delete(gearId);
        this.eventBus.emit('gear:destroyed', {
          gearId,
          owner: gear.owner,
          cause: cookedItself ? 'heat' : 'jam',
        });
      }
    }

    this.checkOverclockBurnouts(now);
  }

  /**
   * Advance every gear's heat, and apply the resulting band.
   *
   * A seizure reuses the existing jam machinery -- isJammed, jamStress and
   * jamStressMap -- so HP loss, crack levels, the relief-valve softening and
   * gear:destroyed all work unchanged. What it does NOT reuse is jammedPairs,
   * whose whole lifecycle is "cleared and rebuilt by propagateTorque".
   */
  private stepHeat(allGears: Map<string, GearState>, deltaSec: number, now: number): void {
    for (const [, gear] of allGears) {
      const wasSeized = this.seizedGears.has(gear.id);
      const result = stepThermal({
        heat: gear.heat ?? 0,
        oil: gear.oil ?? 0,
        tier: gear.tier,
        omega: gear.angularVelocity,
        dt: deltaSec,
        externalHeat: this.externalHeat?.(gear.id) ?? 0,
        wasSeized,
      });

      gear.heat = result.heat;
      gear.oil = result.oil;

      if (result.state === 'seized') {
        if (!wasSeized) this.beginSeizure(gear, now);
        // Stress climbs the longer an overheat is ignored, so reacting early
        // costs HP and ignoring it costs the gear.
        const heldFor = (now - (gear.seizedAt ?? now)) / 1000;
        const stress = escalatedSeizeStress(gear.tier, heldFor);
        gear.jamStress = stress;
        this.jamStressMap.set(gear.id, stress);
        gear.angularVelocity = 0;
        gear.isSpinning = false;
      } else if (wasSeized) {
        this.endSeizure(gear);
      }

      this.world.updateGear(gear);
    }
  }

  private beginSeizure(gear: GearState, now: number): void {
    // Set BEFORE rebuilding: rebuildChains re-solves torque, and torque reads
    // thermalEfficiency, which reads this flag.
    gear.isSeized = true;
    this.seizedGears.add(gear.id);
    this.seizedSince.set(gear.id, now);
    gear.seizedAt = now;
    gear.isJammed = true;
    this.eventBus.emit('gear:jammed', {
      gearId: gear.id,
      conflictingGearId: gear.id,
      torque: gear.jamStress,
      severity: jamSeverity(gear.jamStress),
      cause: 'heat',
    });
    // The chain has to be re-solved without this gear in it.
    this.rebuildChains();
  }

  private endSeizure(gear: GearState): void {
    // Cleared BEFORE rebuilding, for the same reason -- leaving it set made the
    // chain re-solve with zero torque and the gear stayed at a standstill even
    // though it had cooled and released.
    gear.isSeized = false;
    this.seizedGears.delete(gear.id);
    this.seizedSince.delete(gear.id);
    this.jamStressMap.delete(gear.id);
    gear.seizedAt = undefined;
    gear.isJammed = false;
    gear.jamStress = 0;
    this.eventBus.emit('gear:jam_cleared', { gearId: gear.id });
    this.rebuildChains();
  }

  /**
   * Spread oil along meshed teeth.
   *
   * On its own sub-tick: oil moves slowly and resolving it every frame is
   * wasted work. Deltas are computed against a snapshot and applied afterwards,
   * so edge order cannot change the result.
   */
  private stepOil(allGears: Map<string, GearState>, now: number): void {
    if (now - this.lastOilDiffuseAt < OIL_DIFFUSE_INTERVAL_MS) return;
    const dt = (now - this.lastOilDiffuseAt) / 1000;
    this.lastOilDiffuseAt = now;
    if (!Number.isFinite(dt) || dt <= 0) return;

    const nodes = new Map<string, OilNode>();
    for (const [id, gear] of allGears) {
      const capacity = oilCapacityFor(gear.tier)
        * (gear.type === 'oiler' ? OILER_CAPACITY_MULT : 1);
      nodes.set(id, { oil: gear.oil ?? 0, capacity, omega: gear.angularVelocity });
    }

    const deltas = diffuseOil(this.meshGraph.getAllEdges(), nodes, Math.min(dt, 1));
    for (const [id, delta] of deltas) {
      const gear = allGears.get(id);
      const node = nodes.get(id);
      if (!gear || !node) continue;
      gear.oil = Math.max(0, Math.min(node.capacity, (gear.oil ?? 0) + delta));
      this.world.updateGear(gear);
    }
  }

  private onFullRotation(gear: GearState, allGears: Map<string, GearState>): void {
    const chain = this.getChainForGear(gear.id);
    if (!chain) return;

    const rotationCount = (this.capacitorRotationCount.get(gear.id) ?? 0) + 1;
    this.capacitorRotationCount.set(gear.id, rotationCount);

    this.eventBus.emit('gear:full_rotation', {
      gearId: gear.id,
      owner: gear.owner,
      rotationCount,
    });

    if (gear.type === 'capacitor' && rotationCount % CAPACITOR_BURST_ROTATIONS === 0) {
      const burstYield = this.computeChainOutput(chain, allGears);
      // Declared synergy: a capacitor meshed to a live overclock gear bursts
      // harder. The constant existed but nothing read it.
      const synergy = this.hasActiveOverclockNeighbor(gear.id, allGears)
        ? CAPACITOR_OVERCLOCK_BURST_BONUS
        : 0;
      const goldEarned = burstYield * (this.capacitorBurstMultiplier(gear.owner) + synergy);
      // The capacitor's whole point: banking rotations and paying out on the
      // 8th. Previously this number went nowhere -- it fed an event nothing
      // consumed but VFX, so a chain with a capacitor gained nothing a
      // player could observe.
      this.economySystem?.earnGold(gear.owner, goldEarned);
      this.eventBus.emit('power:capacitor_burst', { gearId: gear.id, owner: gear.owner, goldEarned });
    }
  }

  /**
   * Sum of motor output in a chain, boosted by researched burst-yield tech --
   * this is the capacitor's "burst yield" per rotation. Amplifiers do not
   * factor in here: their job is the chain's torque (computeChainPhysics),
   * not this figure, so a chain benefits from an amplifier once, not twice.
   */
  computeChainOutput(chain: ChainInfo, allGears: Map<string, GearState>): number {
    if (!chain.hasMotor) return 0;

    let totalOutput = 0;

    for (const gearId of chain.gearIds) {
      const gear = allGears.get(gearId);
      if (!gear) continue;

      if (gear.type === 'motor' && !gear.isBurntOut) {
        totalOutput += motorOutput(gear.teeth);
      }
    }

    return totalOutput * (1 + this.powerBonusPct[chain.owner]);
  }

  /** Boost window length for a side, including researched extensions. */
  private overclockDuration(owner: 'player' | 'ai'): number {
    return OVERCLOCK_DURATION + this.overclockDurationBonus[owner];
  }

  /**
   * Open a boost window on an overclock gear, clearing any burnout.
   * This is the single writer of `overclockUntil`.
   */
  private startOverclock(gear: GearState, now: number): void {
    if (gear.type !== 'overclock') return;
    const duration = this.overclockDuration(gear.owner);
    gear.overclockUntil = now + duration;
    gear.isBurntOut = false;
    gear.burntOutAt = undefined;
    this.world.updateGear(gear);
    this.eventBus.emit('gear:overclock_started', { gearId: gear.id, duration });
  }

  /**
   * Advance every overclock gear through its cycle: boost for its duration,
   * burn out for OVERCLOCK_BURNOUT_DURATION, then spin back up and repeat.
   *
   * Returns the gears that burnt out on this tick.
   */
  checkOverclockBurnouts(now: number): string[] {
    const burntOut: string[] = [];
    // Torque is only recomputed when the mesh changes, so a gear starting or
    // ending its boost has to ask for a re-propagation — otherwise neighbours
    // keep spinning at the old speed, including while the gear is burnt out.
    let changed = false;

    for (const [, gear] of this.world.getAllGears()) {
      if (gear.type !== 'overclock') continue;

      // Recover from a previous burnout once the downtime has elapsed.
      if (gear.isBurntOut) {
        if (gear.burntOutAt === undefined) continue;
        if (now - gear.burntOutAt >= OVERCLOCK_BURNOUT_DURATION) {
          this.startOverclock(gear, now);
          changed = true;
        }
        continue;
      }

      if (gear.overclockUntil === undefined) continue;
      if (now < gear.overclockUntil) continue;

      // Overclock Mastery: refresh the window instead of burning out. Skipping
      // the burnout alone would leave the gear alive but past its window, so
      // it would stop boosting — the opposite of what the ability promises.
      const ownerAbilitySystem = gear.owner === 'player' ? this.abilitySystem : this.aiAbilitySystem;
      if (ownerAbilitySystem?.isUnlocked('overclock_no_burnout')) {
        this.startOverclock(gear, now);
        continue;
      }

      changed = true;

      burntOut.push(gear.id);
      gear.isBurntOut = true;
      gear.burntOutAt = now;
      gear.isSpinning = false;
      gear.angularVelocity = 0;
      this.world.updateGear(gear);
      this.eventBus.emit('gear:burnt_out', { gearId: gear.id });
    }

    if (changed) this.propagateTorque();
    return burntOut;
  }

  setOverclockDurationBonus(owner: 'player' | 'ai', bonusMs: number): void {
    this.overclockDurationBonus[owner] = bonusMs;
  }

  setAbilitySystem(abilitySystem: { isUnlocked: (id: 'power_surge' | 'counter_intel' | 'overclock_no_burnout') => boolean }): void {
    this.abilitySystem = abilitySystem;
  }

  setAiAbilitySystem(abilitySystem: { isUnlocked: (id: 'power_surge' | 'counter_intel' | 'overclock_no_burnout') => boolean }): void {
    this.aiAbilitySystem = abilitySystem;
  }

  setEconomySystem(economySystem: EconomySystem): void {
    this.economySystem = economySystem;
  }

  getChains(): Map<string, ChainInfo> {
    return this.chains;
  }

  getChainForGear(gearId: string): ChainInfo | undefined {
    for (const [, chain] of this.chains) {
      if (chain.gearIds.includes(gearId)) return chain;
    }
    return undefined;
  }

  destroy(): void {
    this.eventBus.off('gear:mesh_updated', this.onMeshUpdated);
    this.eventBus.off('gear:placed', this.onGearPlaced);
    this.eventBus.off('gear:removed', this.onGearRemoved);
  }
}
