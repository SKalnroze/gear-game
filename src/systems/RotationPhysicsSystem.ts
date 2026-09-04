import { GearState } from '../types/gear.types';
import { World } from '../world/World';
import { GearMeshGraph } from '../world/GearMeshGraph';
import { EventBus } from './EventBus';
import { GEAR_DEFINITIONS, INERTIA_DENSITY, gearRadius, motorTorque, motorOutput, crackLevelFor } from '../constants/gear.constants';
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

    // Clear jams from previous cycle
    for (const gearId of this.jammedPairs.keys()) {
      const gear = allGears.get(gearId);
      if (gear) {
        gear.isJammed = false;
        this.world.updateGear(gear);
        this.eventBus.emit('gear:jam_cleared', { gearId });
      }
    }
    this.jammedPairs.clear();
    this.jamStressMap.clear();

    // BFS from each motor
    for (const [, gear] of allGears) {
      if (gear.type !== 'motor' || gear.isBurntOut || visited.has(gear.id)) continue;

      // Pass 1: Compute chain physics for this motor's chain
      const chainGearIds = this.getChainGearIds(gear.id, visited);
      const chainGears = chainGearIds.map(id => allGears.get(id)).filter(Boolean) as GearState[];
      const correctedMotorOmega = this.computeChainPhysics(chainGearIds, chainGears, allGears, gear.owner);

      // Pass 2: Propagate torque with jam detection
      const mTorque = motorTorque(gear.teeth);
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
          if (!neighbor || neighbor.isBurntOut) continue;

          const neighborTeeth = neighbor.teeth;
          const neighborR = gearRadius(neighborTeeth);

          // Torque attenuation by gear ratio
          const neighborTorque = currentTorque * (currentTeeth / neighborTeeth);
          const inertiaNeighbor = Math.PI * neighborR * neighborR * INERTIA_DENSITY;
          void inertiaNeighbor; // computed but implicit in omega
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
        if (n && !n.isBurntOut && !localVisited.has(nId) && !visited.has(nId)) {
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

    // BFS to compute ratio for each gear relative to motor
    while (queue.length > 0) {
      const { id: currentId, ratio: currentRatio } = queue.shift()!;
      const current = allGears.get(currentId);
      if (!current) continue;

      for (const nId of this.meshGraph.getNeighbors(currentId)) {
        if (localVisited.has(nId)) continue;
        const neighbor = allGears.get(nId);
        if (!neighbor || !chainGearIds.includes(nId)) continue;

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
      const r = gearRadius(g.teeth);
      const inertia = Math.PI * r * r * INERTIA_DENSITY;
      chainEffectiveInertia += inertia * (ratio * ratio);
      totalFrictionLoad += g.frictionLoad;

      if (g.type === 'motor' && !g.isBurntOut) {
        // Motor torque is scaled by its omega ratio at the reference frame (power conservation: P = τ × ω)
        totalMotorTorque += motorTorque(g.teeth) * (omegaRatios.get(gId) ?? 1.0);
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
    gearA.isJammed = true;
    gearA.angularVelocity = 0;
    gearA.isSpinning = false;
    this.jamStressMap.set(gearA.id, torque * JAM_STRESS_MULTIPLIER);
    this.jammedPairs.set(gearA.id, gearB.id);
    this.world.updateGear(gearA);

    gearB.isJammed = true;
    gearB.angularVelocity = 0;
    gearB.isSpinning = false;
    this.jamStressMap.set(gearB.id, torque * JAM_STRESS_MULTIPLIER);
    this.jammedPairs.set(gearB.id, gearA.id);
    this.world.updateGear(gearB);

    this.eventBus.emit('gear:jammed', {
      gearId: gearA.id,
      conflictingGearId: gearB.id,
      torque,
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

    // Apply jam damage
    for (const [gearId, stress] of this.jamStressMap) {
      const gear = allGears.get(gearId);
      if (!gear?.isJammed) {
        this.jamStressMap.delete(gearId);
        continue;
      }

      const dmg = stress * JAM_DAMAGE_RATE * deltaSec;
      gear.hp = Math.max(0, gear.hp - dmg);
      gear.crackLevel = crackLevelFor(gear.hp, gear.maxHp);
      this.world.updateGear(gear);

      this.eventBus.emit('gear:damaged', {
        gearId,
        damage: dmg,
        remainingHp: gear.hp,
        source: 'jam',
      });

      if (gear.hp <= 0) {
        this.jamStressMap.delete(gearId);
        this.jammedPairs.delete(gearId);
        this.eventBus.emit('gear:destroyed', {
          gearId,
          owner: gear.owner,
          cause: 'jam',
        });
      }
    }

    this.checkOverclockBurnouts(now);
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
