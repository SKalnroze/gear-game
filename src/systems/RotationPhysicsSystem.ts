import { GearState } from '../types/gear.types';
import { World } from '../world/World';
import { GearMeshGraph } from '../world/GearMeshGraph';
import { EventBus } from './EventBus';
import { GEAR_DEFINITIONS, INERTIA_DENSITY, gearRadius, motorTorque, motorOutput, crackLevelFor } from '../constants/gear.constants';
import {
  AMPLIFIER_CHAIN_MULTIPLIER,
  OVERCLOCK_SPEED_BONUS,
  CAPACITOR_BURST_MULTIPLIER,
  CAPACITOR_BURST_ROTATIONS,
  JAM_DAMAGE_RATE,
  JAM_STRESS_MULTIPLIER,
} from '../constants/balance.constants';
import { meshOmega } from '../utils/MathUtils';
import { GameClock } from './GameClock';

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
  private capacitorBurstMultiplier: Record<'player' | 'ai', number> = {
    player: CAPACITOR_BURST_MULTIPLIER,
    ai: CAPACITOR_BURST_MULTIPLIER,
  };

  // Optional ability system ref (set after construction)
  private abilitySystem: { isUnlocked: (id: 'power_surge' | 'counter_intel' | 'overclock_no_burnout') => boolean } | null = null;

  private readonly onMeshUpdated = () => this.rebuildChains();
  private readonly onGearPlaced = () => this.rebuildChains();
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

  setCapacitorBurstMultiplier(owner: 'player' | 'ai', multiplier: number): void {
    this.capacitorBurstMultiplier[owner] = multiplier;
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
      const owner = gears[0]?.owner ?? 'player';

      this.chains.set(chainId, {
        id: chainId,
        gearIds: component,
        owner,
        hasMotor,
        hasAmplifier,
        hasConverter: false,
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
      const correctedMotorOmega = this.computeChainPhysics(chainGearIds, chainGears, allGears);

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
    allGears: Map<string, GearState>
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
      const chainOutput = this.computeChainOutput(chain, allGears);
      const burstPower = chainOutput * this.capacitorBurstMultiplier[gear.owner];
      this.eventBus.emit('power:capacitor_burst', { gearId: gear.id, owner: gear.owner, powerReleased: burstPower });
    }
  }

  /**
   * Compute the resource output for a chain per motor full rotation.
   */
  computeChainOutput(chain: ChainInfo, allGears: Map<string, GearState>): number {
    if (!chain.hasMotor) return 0;

    let totalOutput = 0;
    let multiplier = 1.0;

    for (const gearId of chain.gearIds) {
      const gear = allGears.get(gearId);
      if (!gear) continue;

      if (gear.type === 'motor' && !gear.isBurntOut) {
        totalOutput += motorOutput(gear.teeth);
      }
      if (gear.type === 'amplifier' && !gear.isBurntOut) {
        multiplier *= AMPLIFIER_CHAIN_MULTIPLIER;
      }
    }

    return totalOutput * multiplier * (1 + this.powerBonusPct[chain.owner]);
  }

  checkOverclockBurnouts(now: number): string[] {
    const burntOut: string[] = [];
    for (const [, gear] of this.world.getAllGears()) {
      if (gear.type !== 'overclock') continue;
      if (gear.isBurntOut) continue;
      if (!gear.overclockUntil) continue;
      if (now >= gear.overclockUntil) {
        if (this.abilitySystem?.isUnlocked('overclock_no_burnout') && gear.owner === 'player') {
          continue;
        }
        burntOut.push(gear.id);
        gear.isBurntOut = true;
        gear.burntOutAt = now;
        gear.isSpinning = false;
        gear.angularVelocity = 0;
        this.world.updateGear(gear);
        this.eventBus.emit('gear:burnt_out', { gearId: gear.id });
      }
    }
    return burntOut;
  }

  setAbilitySystem(abilitySystem: { isUnlocked: (id: 'power_surge' | 'counter_intel' | 'overclock_no_burnout') => boolean }): void {
    this.abilitySystem = abilitySystem;
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
