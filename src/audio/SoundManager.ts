import type { UnitType } from '../types/unit.types';
import type { AbilityId } from '../types/ability.types';

/**
 * SoundManager — procedural SFX via Web Audio API.
 * No audio file loading. All sounds are synthesized on the fly.
 */
export class SoundManager {
  private static _instance: SoundManager;
  static get instance(): SoundManager {
    if (!SoundManager._instance) SoundManager._instance = new SoundManager();
    return SoundManager._instance;
  }

  private _ctx: AudioContext;
  private _master: GainNode;
  private _volume = 0.7;
  private _enabled = true;

  private constructor() {
    this._ctx = new AudioContext();
    this._master = this._ctx.createGain();
    this._master.gain.value = this._volume;
    this._master.connect(this._ctx.destination);
  }

  // ── Public API ───────────────────────────────────────────────────────────

  setVolume(v: number): void {
    this._volume = Math.max(0, Math.min(1, v));
    this._master.gain.value = this._volume;
  }

  setEnabled(v: boolean): void { this._enabled = v; }

  /** Resume AudioContext after user gesture. Call before first sound. */
  async resume(): Promise<void> {
    if (this._ctx.state === 'suspended') await this._ctx.resume();
  }

  // ── UI ───────────────────────────────────────────────────────────────────

  playUIClick():  void { this._go(() => this._osc('sine', 1200, 600, 0.06, 0.35)); }
  playUIHover():  void { this._go(() => this._osc('sine', 900, 900, 0.03, 0.12)); }

  // ── Gear sounds ──────────────────────────────────────────────────────────

  playGearPickup(): void { this._go(() => this._gearPickup()); }
  playGearPlace():  void { this._go(() => this._gearPlace()); }
  playGearMesh():   void { this._go(() => this._gearMesh()); }
  playGearTick():   void { this._go(() => this._gearTick()); }

  /**
   * Gear teeth jamming against another gear — harsh grinding stress.
   * `severity` (0-1, from RotationPhysicsSystem's jamSeverity) scales
   * volume and pitch so a light jam grinds quietly and a severe one is a
   * genuinely harsh crunch — the crush force made audible.
   */
  playGearJam(severity: number = 1): void {
    const s = Math.max(0, Math.min(1, severity));
    const vol = 0.5 + s * 0.5;       // quiet at low severity, full-bodied at high
    const pitchDrop = 1 + s * 0.4;   // harder jams grind lower
    this._go(() => {
      this._noise(0.60 * vol, 0.45, 95 / pitchDrop, 0.55);   // low grinding body
      this._osc('square', 68 / pitchDrop, 52 / pitchDrop, 0.40, 0.28 * vol); // buzzing strain
      this._noise(0.45 * vol, 0.12, 260, 1.4);                // initial crunch transient
    });
  }

  /** Gear destroyed by combat or overload. */
  playGearDestroyed(): void {
    this._go(() => {
      this._noise(0.70, 0.50, 180, 0.42);             // impact body
      this._osc('triangle', 480, 55, 0.60, 0.38);     // metallic ring dying away
      this._noise(0.55, 0.08, 720, 2.2);              // bright crack transient
      this._osc('sine', 120, 35, 0.40, 0.30, 0.05);  // deep resonance follows
    });
  }

  /** Overclock gear burns out — power-down whir. */
  playGearBurntOut(): void {
    this._go(() => {
      this._osc('sawtooth', 280, 28, 0.80, 0.33);    // motor slowing down
      this._noise(0.28, 0.80, 140, 0.75);             // mechanical friction fading
    });
  }

  /** Overclock gear activates — power surge. */
  playGearOverclock(): void {
    this._go(() => {
      this._osc('square', 220, 220, 0.25, 0.22, 0.00);
      this._osc('square', 440, 440, 0.22, 0.18, 0.06);
      this._osc('square', 880, 880, 0.20, 0.14, 0.12);
      this._noise(0.42, 0.12, 720, 3.2, 0.00);        // electrical burst
    });
  }

  /** Capacitor gear releases stored energy. */
  playCapacitorBurst(): void {
    this._go(() => {
      this._noise(0.65, 0.14, 720, 5.5);              // bright electrical discharge
      this._osc('sine', 880, 420, 0.20, 0.38);        // energy dissipation
      this._osc('sine', 2200, 800, 0.10, 0.18, 0.02); // high-freq zing
    });
  }

  /** Slime unit latches onto a gear. */
  playSlimePop(): void {
    this._go(() => {
      this._noise(0.55, 0.09, 380, 4.2);              // metallic clang
      this._osc('square', 245, 98, 0.18, 0.22, 0.04); // resonant clank
    });
  }

  /** Healer gear pulses a healing wave. */
  playHealerPulse(): void {
    this._go(() => {
      this._bell(660, 0.60, 0.28);                    // bell fundamental
      this._bell(1320, 0.40, 0.13, 0.02);             // octave overtone
      this._bell(1980, 0.25, 0.06, 0.05);             // 2nd overtone
    });
  }

  // ── Unit sounds (type-specific) ──────────────────────────────────────────

  playUnitSpawn(type: UnitType = 'infantry'): void {
    this._go(() => {
      switch (type) {
        case 'infantry':        this._spawnInfantry();       break;
        case 'elite_infantry':  this._spawnEliteInfantry();  break;
        case 'artillery':       this._spawnArtillery();      break;
        case 'elite_artillery': this._spawnEliteArtillery(); break;
        case 'cavalry':         this._spawnCavalry();        break;
        case 'elite_cavalry':   this._spawnEliteCavalry();   break;
        case 'iron_guard':      this._spawnIronGuard();      break;
        case 'crystal_sentinel':this._spawnCrystalSentinel();break;
        case 'aether_phantom':  this._spawnAetherPhantom();  break;
        case 'slime':          this._spawnSlime();         break;
        default:                this._spawnInfantry();
      }
    });
  }

  playUnitDie(type: UnitType = 'infantry'): void {
    this._go(() => {
      switch (type) {
        case 'infantry':        this._dieInfantry();       break;
        case 'elite_infantry':  this._dieEliteInfantry();  break;
        case 'artillery':       this._dieArtillery();      break;
        case 'elite_artillery': this._dieEliteArtillery(); break;
        case 'cavalry':         this._dieCavalry();        break;
        case 'elite_cavalry':   this._dieEliteCavalry();   break;
        case 'iron_guard':      this._dieIronGuard();      break;
        case 'crystal_sentinel':this._dieCrystalSentinel();break;
        case 'aether_phantom':  this._dieAetherPhantom();  break;
        case 'slime':          this._dieSlime();         break;
        default:                this._dieInfantry();
      }
    });
  }

  /** Play a melee attack sound for the given unit type. Ranged units use projectile sounds. */
  playUnitAttack(type: UnitType = 'infantry'): void {
    this._go(() => {
      switch (type) {
        case 'infantry':
        case 'elite_infantry':
        case 'mixed':           this._attackMelee();        break;
        case 'cavalry':
        case 'elite_cavalry':   this._attackCavalry();      break;
        case 'iron_guard':      this._attackIronGuard();    break;
        case 'aether_phantom':  this._attackAetherPhantom();break;
        case 'slime':          this._attackSlime();       break;
        // Ranged types play projectile sounds instead
        default: break;
      }
    });
  }

  // ── Projectile sounds ────────────────────────────────────────────────────

  /** Crystal shard leaves the barrel — crystalline ping. */
  playCrystalShardFire(): void {
    this._go(() => {
      this._osc('sine', 1100, 2600, 0.12, 0.28);
      this._noise(0.18, 0.06, 2400, 4.5);
    });
  }

  /** Crystal shard strikes a target — glass crack. */
  playCrystalShardHit(): void {
    this._go(() => {
      this._noise(0.48, 0.20, 1900, 1.9);
      this._osc('sine', 1500, 260, 0.30, 0.24);
    });
  }

  /** Crystal slow debuff applied — cold shiver. */
  playCrystalSlowApplied(): void {
    this._go(() => {
      this._osc('sine', 820, 370, 0.40, 0.18);
      this._osc('sine', 1120, 510, 0.35, 0.15, 0.04);
    });
  }

  /** Artillery shell launched — deep cannon boom. */
  playArtilleryFire(): void {
    this._go(() => {
      this._noise(0.72, 0.50, 72, 0.24);              // cannon body
      this._osc('sine', 52, 16, 0.45, 0.55);          // deep sub-rumble
      this._noise(0.42, 0.06, 320, 1.6, 0.00);        // muzzle crack
    });
  }

  /** Artillery shell explodes on impact — large AOE explosion. */
  playArtilleryHit(): void {
    this._go(() => {
      this._noise(0.85, 0.65, 95, 0.28);              // main explosion
      this._osc('sine', 70, 18, 0.65, 0.65);          // deep rumble
      this._noise(0.55, 0.15, 260, 1.1, 0.05);        // secondary crumble
    });
  }

  // ── Combat sounds ────────────────────────────────────────────────────────

  /** Triggered when two units first enter melee combat with each other. */
  playMeleeCombatStart(): void {
    this._go(() => {
      this._noise(0.38, 0.10, 440, 1.7);
      this._osc('square', 185, 145, 0.07, 0.18);
    });
  }

  /** Player base takes damage — heavy impact + alarm. */
  playBaseDamaged(): void {
    this._go(() => {
      this._noise(0.72, 0.55, 88, 0.34);              // impact body
      this._osc('triangle', 220, 220, 0.15, 0.38);    // alarm pulse 1
      this._osc('triangle', 220, 220, 0.15, 0.38, 0.28); // alarm pulse 2
    });
  }

  // ── Ability sounds ───────────────────────────────────────────────────────

  playAbility(id: AbilityId): void {
    this._go(() => {
      switch (id) {
        case 'power_surge':          this._abilityPowerSurge();  break;
        default:                     this._abilityGeneric();     break;
      }
    });
  }

  // ── Game flow ────────────────────────────────────────────────────────────

  playExplosion(): void {
    this._go(() => {
      this._noise(0.75, 0.50, 140, 0.40);
      this._osc('sine', 75, 28, 0.50, 0.55);
    });
  }

  playVictory(): void {
    this._go(() => {
      // C4 E4 G4 C5 ascending arpeggio
      [261.63, 329.63, 392.00, 523.25].forEach((freq, i) =>
        this._osc('triangle', freq, freq, 0.28, 0.38, i * 0.13));
    });
  }

  playDefeat(): void {
    this._go(() => {
      // C5 Ab4 Eb4 C4 descending diminished
      [523.25, 415.30, 311.13, 261.63].forEach((freq, i) =>
        this._osc('sine', freq, freq, 0.38, 0.32, i * 0.15));
    });
  }

  // ── Internal helpers ─────────────────────────────────────────────────────

  private _go(fn: () => void): void {
    if (!this._enabled) return;
    this.resume().then(fn);
  }

  private _osc(
    type: OscillatorType, startFreq: number, endFreq: number,
    dur: number, vol: number, delay = 0,
  ): void {
    const now  = this._ctx.currentTime + delay;
    const osc  = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, now);
    if (endFreq !== startFreq)
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + dur);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain);
    gain.connect(this._master);
    osc.start(now);
    osc.stop(now + dur + 0.01);
  }

  private _noise(
    vol: number, dur: number, freq: number, q: number,
    delay = 0, filterType: BiquadFilterType = 'bandpass',
  ): void {
    const now  = this._ctx.currentTime + delay;
    const len  = Math.ceil(this._ctx.sampleRate * (dur + 0.05));
    const buf  = this._ctx.createBuffer(1, len, this._ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src  = this._ctx.createBufferSource();
    src.buffer = buf;
    const filt = this._ctx.createBiquadFilter();
    filt.type  = filterType;
    filt.frequency.value = freq;
    filt.Q.value = q;
    const gain = this._ctx.createGain();
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(filt);
    filt.connect(gain);
    gain.connect(this._master);
    src.start(now);
  }

  /** Bell-like tone: soft attack, long exponential decay. */
  private _bell(freq: number, dur: number, vol: number, delay = 0): void {
    const now  = this._ctx.currentTime + delay;
    const osc  = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain);
    gain.connect(this._master);
    osc.start(now);
    osc.stop(now + dur + 0.01);
  }

  // ── Gear sound defs ──────────────────────────────────────────────────────

  private _gearPickup(): void {
    const now  = this._ctx.currentTime;
    const osc  = this._ctx.createOscillator();
    const filt = this._ctx.createBiquadFilter();
    const gain = this._ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(420, now + 0.14);
    filt.type = 'bandpass';
    filt.frequency.value = 320;
    filt.Q.value = 2.5;
    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    osc.connect(filt); filt.connect(gain); gain.connect(this._master);
    osc.start(now); osc.stop(now + 0.2);
  }

  private _gearPlace(): void {
    this._osc('square', 320, 300, 0.12, 0.22);
    this._osc('square', 640, 620, 0.08, 0.14);
    this._noise(0.45, 0.04, 900, 2);
  }

  private _gearMesh(): void {
    for (const [f, vol] of [[440, 0.16], [447, 0.14], [880, 0.08]] as [number, number][])
      this._osc('sawtooth', f, f, 0.22, vol);
    this._noise(0.32, 0.05, 650, 1.2);
  }

  private _gearTick(): void {
    const now  = this._ctx.currentTime;
    const osc  = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(2200, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.018);
    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.022);
    osc.connect(gain); gain.connect(this._master);
    osc.start(now); osc.stop(now + 0.03);
  }

  // ── Unit spawn defs ──────────────────────────────────────────────────────

  private _spawnInfantry(): void {
    // Standard military chirp — triangle sweep up
    const now  = this._ctx.currentTime;
    const osc  = this._ctx.createOscillator();
    const gain = this._ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(820, now + 0.16);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.36, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(gain); gain.connect(this._master);
    osc.start(now); osc.stop(now + 0.25);
  }

  private _spawnEliteInfantry(): void {
    // Double harmonic — same chirp but with an octave above
    this._spawnInfantry();
    this._osc('triangle', 360, 1640, 0.14, 0.18, 0.02);
  }

  private _spawnArtillery(): void {
    // Low mechanical womp + delayed metallic ring
    this._osc('sine', 65, 22, 0.35, 0.44);            // deep womp
    this._noise(0.40, 0.10, 200, 1.2);                 // impact transient
    this._osc('triangle', 440, 330, 0.22, 0.26, 0.16); // metallic ring
  }

  private _spawnEliteArtillery(): void {
    // Deeper, heavier womp
    this._osc('sine', 50, 17, 0.46, 0.55);
    this._noise(0.50, 0.13, 150, 0.85);
    this._osc('triangle', 360, 240, 0.28, 0.32, 0.20);
  }

  private _spawnCavalry(): void {
    // 3 rapid gallop chirps
    for (let i = 0; i < 3; i++)
      this._osc('square', 140, 580, 0.042, 0.28, i * 0.065);
  }

  private _spawnEliteCavalry(): void {
    // Louder gallop + low undertone
    for (let i = 0; i < 3; i++)
      this._osc('square', 115, 500, 0.052, 0.36, i * 0.075);
    this._osc('sine', 80, 40, 0.30, 0.28);
  }

  private _spawnIronGuard(): void {
    // Heavy metallic clang + deep thud
    this._noise(0.62, 0.14, 200, 1.9);                // metallic clang
    this._osc('sine', 75, 30, 0.40, 0.50);            // heavy thud
    this._osc('triangle', 520, 175, 0.32, 0.30, 0.06);// metallic ring
  }

  private _spawnCrystalSentinel(): void {
    // Shimmering crystalline ascent
    this._osc('sine', 600, 2800, 0.30, 0.28);
    this._noise(0.35, 0.25, 1900, 3.2);
    this._osc('sine', 900, 1400, 0.20, 0.20, 0.10);
  }

  private _spawnAetherPhantom(): void {
    // Ghostly ascending tone, very quiet
    this._osc('triangle', 280, 1600, 0.35, 0.18);
    this._osc('sine', 420, 2400, 0.25, 0.10, 0.10);
  }

  private _spawnSlime(): void {
    // Mechanical click + clank
    this._noise(0.46, 0.06, 870, 6.2);                // sharp click
    this._osc('square', 365, 185, 0.15, 0.24, 0.04);  // resonant clank
  }

  // ── Unit death defs ──────────────────────────────────────────────────────

  private _dieInfantry(): void {
    this._osc('sawtooth', 580, 70, 0.32, 0.33);
    const now  = this._ctx.currentTime;
    const osc  = this._ctx.createOscillator();
    const filt = this._ctx.createBiquadFilter();
    const gain = this._ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(580, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.32);
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(900, now);
    filt.frequency.exponentialRampToValueAtTime(90, now + 0.32);
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
    osc.connect(filt); filt.connect(gain); gain.connect(this._master);
    osc.start(now); osc.stop(now + 0.4);
    this._noise(0.38, 0.12, 280, 0.65);
  }

  private _dieEliteInfantry(): void {
    // Same but bigger
    this._noise(0.50, 0.18, 280, 0.55);
    this._osc('sawtooth', 520, 60, 0.42, 0.38);
  }

  private _dieArtillery(): void {
    // Small explosion + metallic ring
    this._noise(0.60, 0.40, 105, 0.32);
    this._osc('triangle', 480, 48, 0.55, 0.35);
  }

  private _dieEliteArtillery(): void {
    // Bigger explosion
    this._noise(0.72, 0.52, 95, 0.26);
    this._osc('sine', 62, 20, 0.40, 0.42);
    this._osc('triangle', 420, 42, 0.62, 0.28);
  }

  private _dieCavalry(): void {
    // Fast descend + 3 impact thumps
    this._osc('triangle', 800, 48, 0.42, 0.38);
    this._noise(0.50, 0.08, 300, 0.85, 0.00);
    this._noise(0.40, 0.08, 250, 0.85, 0.12);
    this._noise(0.30, 0.08, 200, 0.85, 0.22);
  }

  private _dieEliteCavalry(): void {
    this._osc('triangle', 920, 44, 0.46, 0.46);
    this._noise(0.62, 0.10, 280, 0.75, 0.00);
    this._noise(0.52, 0.10, 225, 0.75, 0.13);
    this._noise(0.40, 0.10, 180, 0.75, 0.26);
  }

  private _dieIronGuard(): void {
    // BIG EXPLOSION — their special death triggers this
    this._noise(0.90, 0.70, 98, 0.28);               // main explosion
    this._osc('sine', 80, 18, 0.65, 0.70);           // deep sub-rumble
    this._noise(0.72, 0.16, 210, 0.85, 0.04);        // impact crack
    this._noise(0.52, 0.28, 420, 1.6, 0.12);         // secondary burst
  }

  private _dieCrystalSentinel(): void {
    // High-pitched glass shatter
    this._noise(0.52, 0.25, 1900, 1.6);
    this._osc('sine', 1600, 200, 0.40, 0.28);
    this._noise(0.32, 0.08, 3200, 4.5);
  }

  private _dieAetherPhantom(): void {
    // Ghostly dissipation — very quiet
    this._osc('triangle', 600, 58, 0.46, 0.14);
    this._osc('sine', 1200, 145, 0.30, 0.10, 0.06);
  }

  private _dieSlime(): void {
    // Parts scattering — 3 metallic pops
    this._noise(0.42, 0.08, 520, 2.6, 0.00);
    this._noise(0.36, 0.08, 740, 2.6, 0.07);
    this._noise(0.28, 0.08, 960, 2.6, 0.14);
    this._osc('square', 285, 118, 0.14, 0.18);       // spring bounce
  }

  // ── Unit attack defs ─────────────────────────────────────────────────────

  private _attackMelee(): void {
    // Standard melee clash
    this._noise(0.36, 0.11, 480, 1.75);
    this._osc('square', 200, 148, 0.07, 0.16);
  }

  private _attackCavalry(): void {
    // Heavy charge impact
    this._noise(0.46, 0.17, 285, 0.90);
    this._osc('sine', 105, 52, 0.20, 0.34);
  }

  private _attackIronGuard(): void {
    // Armored heavy thud
    this._noise(0.52, 0.22, 138, 0.48);
    this._osc('sine', 55, 20, 0.25, 0.44);
  }

  private _attackAetherPhantom(): void {
    // Ethereal phase hit — barely audible
    this._osc('triangle', 500, 175, 0.20, 0.14);
    this._osc('sine', 900, 300, 0.15, 0.09, 0.05);
  }

  private _attackSlime(): void {
    // Gear friction grind
    this._noise(0.40, 0.25, 325, 3.6);
    this._osc('sawtooth', 82, 62, 0.20, 0.18);
  }

  // ── Ability defs ─────────────────────────────────────────────────────────

  private _abilityPowerSurge(): void {
    // Gold surge — ascending G major arpeggio + shimmer
    [392, 494, 587, 784].forEach((freq, i) =>
      this._osc('triangle', freq, freq, 0.28, 0.35, i * 0.08));
    this._noise(0.32, 0.38, 1250, 2.6);
  }

  private _abilityGeneric(): void {
    this._noise(0.40, 0.12, 500, 2.0);
    this._osc('sine', 400, 1250, 0.30, 0.34);
  }
}

export const soundManager = SoundManager.instance;
