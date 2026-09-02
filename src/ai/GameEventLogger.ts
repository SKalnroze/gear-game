import type { EventBus } from '../systems/EventBus';

// ─── Colour palette (browser console %c styling) ──────────────────────────────

const S = {
  system:   'color:#aaffaa;font-weight:bold',
  critical: 'color:#ff4444;font-weight:bold',
  unit:     'color:#ffbb44',
  gear:     'color:#88ccff',
  tech:     'color:#66ff99',
  economy:  'color:#ffee55',
};

// ─── GameEventLogger ──────────────────────────────────────────────────────────

/**
 * Subscribes to all key EventBus events and prints colour-coded lines to the
 * browser console.  Enabled automatically in spectate and practice modes (same
 * toggle as AIDebugOverlay).
 *
 * Events covered (with rationale):
 *   CRITICAL  — game:started/over, combat:base_damaged, unit:reached_base
 *   UNIT      — spawned, died
 *   GEAR      — placed, destroyed, burnt_out, jammed
 *   TECH      — research_started, research_complete
 *   ECONOMY   — insufficient_funds  (too noisy for gold_changed)
 *
 * Deliberately omitted (too noisy / not actionable):
 *   unit:moved, gear:mesh_updated, gear:rotation_result,
 *   economy:gold_changed, economy:resources_changed,
 *   combat:damage_dealt, unit:damaged, gear:damaged,
 *   game:tick, projectile:*, ui:*, gear:snap_preview
 */
export class GameEventLogger {
  private enabled = false;
  private readonly startTime = Date.now();

  constructor(private readonly eventBus: EventBus) {
    this.attach();
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  setEnabled(v: boolean): void { this.enabled = v; }
  isEnabled(): boolean           { return this.enabled; }
  toggle(): void                 { this.setEnabled(!this.enabled); }

  /** No-op: EventBus.removeAllListeners() is called by GameScene on shutdown. */
  destroy(): void { /* nothing */ }

  // ─── Internal helpers ────────────────────────────────────────────────────────

  private ts(): string {
    return `T+${((Date.now() - this.startTime) / 1000).toFixed(1)}s`;
  }

  private emit(style: string, msg: string): void {
    if (!this.enabled) return;
    console.log(`%c[EVT|${this.ts()}] ${msg}`, style);
  }

  // ─── Event subscriptions ─────────────────────────────────────────────────────

  private attach(): void {
    const eb = this.eventBus;

    // ── Game flow ──────────────────────────────────────────────────────────────
    eb.on('game:started', () =>
      this.emit(S.system, 'GAME STARTED'));

    eb.on('game:paused', () =>
      this.emit(S.system, 'GAME PAUSED'));

    eb.on('game:resumed', () =>
      this.emit(S.system, 'GAME RESUMED'));

    eb.on('game:over', ({ winner, reason }) =>
      this.emit(S.critical, `GAME OVER  winner=${winner}  reason="${reason}"`));

    // ── Base damage ────────────────────────────────────────────────────────────
    eb.on('combat:base_damaged', ({ owner, damage, remainingHp }) =>
      this.emit(S.critical, `BASE HIT  owner=${owner}  -${damage.toFixed(0)}dmg  hp=${remainingHp.toFixed(0)}`));

    // ── Units ──────────────────────────────────────────────────────────────────

    eb.on('unit:spawned', ({ unit }) =>
      this.emit(S.unit, `unit:spawned  owner=${unit.owner}  type=${unit.type}  at=(${unit.x.toFixed(0)},${unit.y.toFixed(0)})`));

    eb.on('unit:died', ({ unitId, owner }) =>
      this.emit(S.unit, `unit:died  owner=${owner}  id=…${unitId.slice(-6)}`));

    eb.on('unit:reached_base', ({ unit }) =>
      this.emit(S.critical, `UNIT REACHED BASE  owner=${unit.owner}  type=${unit.type}`));

    // ── Gears ──────────────────────────────────────────────────────────────────
    eb.on('gear:placed', ({ gear }) =>
      this.emit(S.gear, `gear:placed  owner=${gear.owner}  ${gear.type}(${gear.teeth}t)  at=(${gear.x.toFixed(0)},${gear.y.toFixed(0)})  id=…${gear.id.slice(-6)}`));

    eb.on('gear:destroyed', ({ gearId, owner, cause }) =>
      this.emit(S.gear, `gear:DESTROYED  owner=${owner}  cause=${cause}  id=…${gearId.slice(-6)}`));

    eb.on('gear:burnt_out', ({ gearId }) =>
      this.emit(S.gear, `gear:burnt_out  id=…${gearId.slice(-6)}`));

    eb.on('gear:jammed', ({ gearId, torque }) =>
      this.emit(S.gear, `gear:jammed  id=…${gearId.slice(-6)}  torque=${torque.toFixed(1)}`));

    eb.on('gear:jam_cleared', ({ gearId }) =>
      this.emit(S.gear, `gear:jam_cleared  id=…${gearId.slice(-6)}`));

    eb.on('gear:repositioned', ({ gearId, oldX, oldY, newX, newY }) =>
      this.emit(S.gear, `gear:repositioned  id=…${gearId.slice(-6)}  (${oldX.toFixed(0)},${oldY.toFixed(0)}) → (${newX.toFixed(0)},${newY.toFixed(0)})`));

    // ── Tech ───────────────────────────────────────────────────────────────────
    eb.on('tech:research_started', ({ nodeId, owner }) =>
      this.emit(S.tech, `tech:research_started  owner=${owner}  node=${nodeId}`));

    eb.on('tech:research_complete', ({ nodeId, owner }) =>
      this.emit(S.tech, `tech:research_COMPLETE  owner=${owner}  node=${nodeId}`));

    // ── Economy ────────────────────────────────────────────────────────────────
    eb.on('economy:insufficient_funds', ({ owner, resource, needed }) =>
      this.emit(S.economy, `insufficient_funds  owner=${owner}  need=${needed}${resource}`));
  }
}
