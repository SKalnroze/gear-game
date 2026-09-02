/**
 * MusicEngine — procedural background music via Tone.js.
 *
 * Crossfade math:
 *   Layers use Tone.Gain (linear 0–1), not Tone.Volume (dB).
 *   A linear ramp gives old=0.5 + new=0.5 = 1.0 at the midpoint,
 *   so perceived volume stays constant throughout the transition.
 *   A dB ramp would give old=-40dB + new=-40dB ≈ -34dB (near-silence) at midpoint —
 *   that is why the previous version faded to silence.
 *
 * Transition feel:
 *   The transport BPM ramps to the new mood's tempo during the crossfade, so the
 *   existing sequences organically speed up or slow down rather than just fading.
 */
import * as Tone from 'tone';

export type MusicMood = 'menu' | 'build' | 'combat';
export type TransitionSpeed = 'quick' | 'normal' | 'slow';

const MOOD_BPM: Record<MusicMood, number> = { menu: 65, build: 72, combat: 80 };
const TRANS_BARS: Record<TransitionSpeed, number> = { quick: 2, normal: 6, slow: 12 };

// ── AudioLayer ───────────────────────────────────────────────────────────────

/** One logical voice (pad / arp / bass / perc / lead) with its own linear gain node. */
class AudioLayer {
  /** Linear gain, 0 = silent, 1 = full. Connect synths here. */
  readonly gain: Tone.Gain;
  private _seqs: Array<{ stop(): void; dispose(): void }> = [];
  private _nodes: Array<{ dispose(): void }> = [];

  constructor(sink: Tone.ToneAudioNode, initGain: number) {
    this.gain = new Tone.Gain(initGain);
    this.gain.connect(sink);
  }

  addSeq<T>(
    cb: (time: Tone.Unit.Time, val: T | null) => void,
    events: (T | null)[],
    subdiv: Tone.Unit.Time,
    startAt = '0',
  ): Tone.Sequence<T | null> {
    const s = new Tone.Sequence<T | null>(cb, events, subdiv);
    s.start(startAt);
    this._seqs.push(s as unknown as { stop(): void; dispose(): void });
    return s;
  }

  addNode<T extends { dispose(): void }>(n: T): T {
    this._nodes.push(n);
    return n;
  }

  /**
   * Linear-amplitude crossfade to `targetGain` (0–1) over `secs` seconds.
   * Because the ramp is linear in the gain domain, two layers crossing at the
   * midpoint sum to 1.0 — constant volume, no dip.
   */
  crossfadeTo(targetGain: number, secs: number): void {
    this.gain.gain.rampTo(targetGain, Math.max(0.05, secs));
  }

  dispose(): void {
    this._seqs.forEach(s => { try { s.stop(); s.dispose(); } catch { /* */ } });
    this._nodes.forEach(n => { try { n.dispose(); } catch { /* */ } });
    try { this.gain.dispose(); } catch { /* */ }
    this._seqs = [];
    this._nodes = [];
  }
}

// ── MusicEngine ──────────────────────────────────────────────────────────────

export class MusicEngine {
  private static _instance: MusicEngine;
  static get instance(): MusicEngine {
    if (!MusicEngine._instance) MusicEngine._instance = new MusicEngine();
    return MusicEngine._instance;
  }

  private _mood: MusicMood | null = null;
  private _playing = false;
  private _transitioning = false;
  private _volume = 0.6;
  private _masterVol: Tone.Volume | null = null;
  private _layers: AudioLayer[] = [];
  /** Outgoing layers mid-crossfade, still awaiting disposal. */
  private _fadingLayers: AudioLayer[] = [];
  private _timers: ReturnType<typeof setTimeout>[] = [];

  get playing(): boolean       { return this._playing; }
  get mood(): MusicMood | null { return this._mood; }
  get transitioning(): boolean { return this._transitioning; }

  // ── Public API ───────────────────────────────────────────────────────

  async play(mood: MusicMood): Promise<void> {
    await Tone.start();
    if (this._playing && this._mood !== mood) {
      await this.transition(mood, 'normal');
      return;
    }
    this._hardStop();
    this._masterVol = new Tone.Volume(this._toDb(this._volume)).toDestination();
    Tone.getTransport().bpm.value = MOOD_BPM[mood];
    this._mood    = mood;
    this._playing = true;
    this._layers  = this._buildMood(mood, 1, '0');  // initGain=1: full volume
    Tone.getTransport().start();
  }

  /**
   * Seamless transition to `toMood`.
   *
   * Both the old and new layer sets crossfade simultaneously using a linear
   * gain ramp, so the summed volume stays constant (≈ unity) at all times.
   * The transport BPM also ramps to the new mood's tempo, making the existing
   * sequences literally morph their rhythm rather than just disappearing.
   */
  async transition(toMood: MusicMood, speed: TransitionSpeed = 'normal'): Promise<void> {
    if (!this._playing)        { await this.play(toMood); return; }
    if (this._mood === toMood) return;
    if (this._transitioning)   return;
    await Tone.start();

    this._transitioning = true;

    const bars     = TRANS_BARS[speed];
    const fromBpm  = Tone.getTransport().bpm.value;
    const fullSecs = (bars * 4 * 60) / fromBpm;

    // BPM morphs to new tempo — old sequences speed up / slow down organically
    Tone.getTransport().bpm.rampTo(MOOD_BPM[toMood], fullSecs * 0.8);

    // Old layers: fade from 1 → 0 over the full duration
    const oldLayers = this._layers;
    oldLayers.forEach(l => l.crossfadeTo(0, fullSecs));

    // New layers: start silent (gain=0), fade to 1 over the full duration simultaneously.
    // Linear crossfade: at midpoint old=0.5, new=0.5, sum=1.0 → constant volume.
    const newLayers = this._buildMood(toMood, 0, '0');
    newLayers.forEach(l => l.crossfadeTo(1, fullSecs));

    this._mood   = toMood;
    this._layers = newLayers;
    this._playing = true;

    // Dispose old layers once they are inaudible. Tracked on the instance so
    // a stop() landing mid-transition can dispose them too: stop() clears the
    // pending timers, which used to strand the whole outgoing layer set.
    this._fadingLayers = oldLayers;
    this._timer(() => {
      oldLayers.forEach(l => l.dispose());
      this._fadingLayers = [];
      this._transitioning = false;
    }, fullSecs * 1000 + 300);
  }

  stop(): void {
    this._timers.forEach(t => clearTimeout(t));
    this._timers = [];
    this._hardStop();
  }

  setVolume(v: number): void {
    this._volume = Math.max(0, Math.min(1, v));
    if (this._masterVol) this._masterVol.volume.value = this._toDb(this._volume);
  }

  // ── Internal helpers ─────────────────────────────────────────────────

  private _hardStop(): void {
    Tone.getTransport().stop();
    Tone.getTransport().cancel();
    this._layers.forEach(l => { try { l.dispose(); } catch { /* */ } });
    this._fadingLayers.forEach(l => { try { l.dispose(); } catch { /* */ } });
    this._fadingLayers = [];
    if (this._masterVol) { try { this._masterVol.dispose(); } catch { /* */ } this._masterVol = null; }
    this._layers        = [];
    this._playing       = false;
    this._mood          = null;
    this._transitioning = false;
  }

  private _toDb(v: number): number {
    return v <= 0 ? -Infinity : 20 * Math.log10(v);
  }

  private _timer(fn: () => void, ms: number): void {
    // Drop the id once it fires, otherwise the array grows for the life of the
    // page — every transition and every scheduled fade left an entry behind.
    const id = setTimeout(() => {
      const i = this._timers.indexOf(id);
      if (i !== -1) this._timers.splice(i, 1);
      fn();
    }, ms);
    this._timers.push(id);
  }

  private _vel(base: number, range = 0.1): number {
    return Math.max(0.05, Math.min(1, base + (Math.random() - 0.5) * 2 * range));
  }

  private _skip(prob = 0.08): boolean {
    return Math.random() < prob;
  }

  private _buildMood(mood: MusicMood, initGain: number, startAt: string): AudioLayer[] {
    switch (mood) {
      case 'menu':   return this._menu(initGain, startAt);
      case 'build':  return this._build(initGain, startAt);
      case 'combat': return this._combat(initGain, startAt);
    }
  }

  // ── MENU — 65 BPM, slow ambient, Cm chord cycle ──────────────────────────

  private _menu(initGain: number, startAt: string): AudioLayer[] {
    const layers: AudioLayer[] = [];
    const sink = this._masterVol!;

    // Pad: FM synth + reverb
    const padLayer  = new AudioLayer(sink, initGain);
    const padReverb = padLayer.addNode(new Tone.Reverb({ decay: 5, wet: 0.65 }));
    const pad       = padLayer.addNode(new Tone.PolySynth(Tone.FMSynth, {
      volume: -6,
      envelope:           { attack: 1.8, decay: 0.5, sustain: 0.75, release: 3.5 },
      modulationEnvelope: { attack: 0.8, decay: 0,   sustain: 1,    release: 2   },
      harmonicity: 1.5, modulationIndex: 2,
    }));
    pad.connect(padReverb);
    padReverb.connect(padLayer.gain);
    const chords = [
      ['C3', 'Eb3', 'G3'],
      ['G2', 'D3',  'G3'],
      ['Ab2', 'C3', 'Eb3'],
      ['Bb2', 'D3', 'F3'],
    ];
    let ci = 0;
    padLayer.addSeq<number>((time) => {
      pad.triggerAttackRelease(chords[ci % chords.length], '2n', time, this._vel(0.38, 0.05));
      ci++;
    }, [0], '2m', startAt);
    layers.push(padLayer);

    // Arp: bell + ping-pong delay, generative walk
    const arpLayer = new AudioLayer(sink, initGain);
    const pp       = arpLayer.addNode(new Tone.PingPongDelay({ delayTime: '8n.', feedback: 0.28, wet: 0.32 }));
    const arp      = arpLayer.addNode(new Tone.Synth({
      volume: -10,
      oscillator: { type: 'triangle' },
      envelope:   { attack: 0.01, decay: 0.45, sustain: 0, release: 0.6 },
    }));
    arp.connect(pp);
    pp.connect(arpLayer.gain);
    const arpScale = ['C4', 'Eb4', 'F4', 'G4', 'Bb4', 'C5', 'Eb5', 'F5'];
    let si = 0;
    arpLayer.addSeq<number>((time) => {
      if (!this._skip(0.15)) {
        arp.triggerAttackRelease(arpScale[si % arpScale.length], '16n', time, this._vel(0.22, 0.12));
      }
      const r = Math.random();
      si = (si + (r > 0.7 ? 2 : r < 0.08 ? -1 : 1) + arpScale.length) % arpScale.length;
    }, [0, 1, 2, 3], '4n', startAt);
    layers.push(arpLayer);

    return layers;
  }

  // ── BUILD — Ambient industrial drone (no discrete rhythm) ────────────────
  //
  //  Three continuous textures that sit under game SFX without competing:
  //    1. Gear drone: sine oscillator at C2 through a low-pass filter driven
  //       by a very slow LFO (0.07 Hz). The filter sweep gives the sensation
  //       of a heavy flywheel slowly changing speed. Pure sine = no harsh
  //       harmonics that could clash with transient SFX.
  //    2. Harmonic pad: PolySynth playing open sus2 / perfect-5th voicings
  //       with a 2.5 s attack and 9 s reverb. Chord changes every 4 bars
  //       (~9 s at 100 BPM) are imperceptible as events — the pad just drifts.
  //    3. Mechanical breath: pink noise through a low bandpass (centre ~300 Hz)
  //       with its own LFO (0.04 Hz) sweeping the cutoff. Provides factory-floor
  //       texture in the low-mid band, well below most SFX content.

  private _build(initGain: number, startAt: string): AudioLayer[] {
    const layers: AudioLayer[] = [];
    const sink = this._masterVol!;

    // ── Layer 1: continuous gear drone — sine + slow filter sweep
    const droneLayer = new AudioLayer(sink, initGain);
    const droneRev   = droneLayer.addNode(new Tone.Reverb({ decay: 7, wet: 0.75 }));
    const droneFilt  = droneLayer.addNode(new Tone.Filter({ type: 'lowpass', frequency: 500, rolloff: -24 }));
    const droneLFO   = droneLayer.addNode(new Tone.LFO({ frequency: 0.07, min: 200, max: 900 }));
    const droneOsc   = droneLayer.addNode(new Tone.Oscillator({ type: 'sine', frequency: 'C2', volume: -10 }));

    droneLFO.connect(droneFilt.frequency);
    droneOsc.connect(droneFilt);
    droneFilt.connect(droneRev);
    droneRev.connect(droneLayer.gain);

    (droneLFO as unknown as { start(): void }).start();
    (droneOsc as unknown as { start(): void }).start();
    layers.push(droneLayer);

    // ── Layer 2: harmonic pad — long-attack sus chords, blurred by reverb
    const padLayer = new AudioLayer(sink, initGain);
    const padRev   = padLayer.addNode(new Tone.Reverb({ decay: 9, wet: 0.82 }));
    const padSynth = padLayer.addNode(new Tone.PolySynth(Tone.Synth, {
      volume: -15,
      oscillator: { type: 'triangle' },
      envelope:   { attack: 2.5, decay: 1.5, sustain: 0.8, release: 6 },
    }));
    padSynth.connect(padRev);
    padRev.connect(padLayer.gain);
    // Open voicings — no thirds → neutral / industrial, not "music"
    const buildChords = [
      ['C3', 'G3', 'D4'],
      ['F3', 'C4', 'G3'],
      ['Bb2', 'F3', 'C4'],
      ['G2', 'D3', 'A3'],
    ];
    let bci = 0;
    padLayer.addSeq<number>((time) => {
      padSynth.triggerAttackRelease(buildChords[bci % buildChords.length], '3m', time, this._vel(0.28, 0.05));
      bci++;
    }, [0], '4m', startAt);
    layers.push(padLayer);

    // ── Layer 3: mechanical breath — pink noise + low bandpass + slow LFO
    const breathLayer = new AudioLayer(sink, initGain);
    const breathFilt  = breathLayer.addNode(new Tone.Filter({ type: 'bandpass', frequency: 300, Q: 0.8 }));
    const breathLFO   = breathLayer.addNode(new Tone.LFO({ frequency: 0.04, min: 150, max: 450 }));
    const breathNoise = breathLayer.addNode(new Tone.Noise({ type: 'pink', volume: -25 }));

    breathLFO.connect(breathFilt.frequency);
    breathNoise.connect(breathFilt);
    breathFilt.connect(breathLayer.gain);

    (breathLFO as unknown as { start(): void }).start();
    (breathNoise as unknown as { start(): void }).start();
    layers.push(breathLayer);

    return layers;
  }

  // ── COMBAT — Dark tension ambience (no discrete rhythm) ───────────────────
  //
  //  Three textures designed to feel tense without adding any transient events
  //  that compete with combat SFX:
  //    1. Tritone drone: two sine oscillators a tritone apart (C2 + Gb2), one
  //       detuned by +14 cents so they beat slowly against each other (~1.7 Hz).
  //       Both share one slow-sweeping low-pass filter (LFO at 0.05 Hz).
  //       Tritone = maximum harmonic tension; sine = no harsh overtones.
  //    2. Trembling pad: PolySynth holding diminished chords (Cdim, Gdim…) with
  //       a 3.5 s attack and Tremolo at 6 Hz depth 0.55. The trembling gives
  //       urgency; the long attack blurs any sense of a discrete hit.
  //       Heavy reverb (decay 8 s) washes everything into an ambient bed.
  //    3. Sub rumble: pink noise through a steep low-pass at 150 Hz + very slow
  //       LFO (0.03 Hz). Sits entirely below most SFX content, adds physical
  //       weight to the atmosphere.

  private _combat(initGain: number, startAt: string): AudioLayer[] {
    const layers: AudioLayer[] = [];
    const sink = this._masterVol!;

    // ── Layer 1: tritone drone — C2 + Gb2, beating, slow filter sweep
    const droneLayer = new AudioLayer(sink, initGain);
    const droneRev   = droneLayer.addNode(new Tone.Reverb({ decay: 10, wet: 0.85 }));
    const droneFilt  = droneLayer.addNode(new Tone.Filter({ type: 'lowpass', frequency: 700, rolloff: -24 }));
    const droneLFO   = droneLayer.addNode(new Tone.LFO({ frequency: 0.05, min: 250, max: 1400 }));
    const droneOscC  = droneLayer.addNode(new Tone.Oscillator({ type: 'sine', frequency: 'C2',  volume: -13 }));
    const droneOscGb = droneLayer.addNode(new Tone.Oscillator({ type: 'sine', frequency: 'Gb2', volume: -15 }));
    droneOscGb.detune.value = 14; // slow beating against droneOscC for unease

    droneLFO.connect(droneFilt.frequency);
    droneOscC.connect(droneFilt);
    droneOscGb.connect(droneFilt);
    droneFilt.connect(droneRev);
    droneRev.connect(droneLayer.gain);

    (droneLFO  as unknown as { start(): void }).start();
    (droneOscC  as unknown as { start(): void }).start();
    (droneOscGb as unknown as { start(): void }).start();
    layers.push(droneLayer);

    // ── Layer 2: trembling diminished pad
    const tremLayer = new AudioLayer(sink, initGain);
    const tremRev   = tremLayer.addNode(new Tone.Reverb({ decay: 8, wet: 0.8 }));
    const tremolo   = tremLayer.addNode(new Tone.Tremolo({ frequency: 6, depth: 0.55, wet: 1 }));
    (tremolo as unknown as { start(): void }).start();
    const tremSynth = tremLayer.addNode(new Tone.PolySynth(Tone.Synth, {
      volume: -17,
      oscillator: { type: 'triangle' },
      envelope:   { attack: 3.5, decay: 1, sustain: 0.7, release: 8 },
    }));
    tremSynth.connect(tremolo);
    tremolo.connect(tremRev);
    tremRev.connect(tremLayer.gain);
    // Diminished / minor chords — unresolved, dark
    const combatChords = [
      ['C3', 'Eb3', 'Gb3'],   // Cdim
      ['Ab2', 'C3', 'Eb3'],   // Abm
      ['G2', 'Bb2', 'Db3'],   // Gdim
      ['Bb2', 'Db3', 'F3'],   // Bbm
    ];
    let cci = 0;
    tremLayer.addSeq<number>((time) => {
      tremSynth.triggerAttackRelease(combatChords[cci % combatChords.length], '5m', time, this._vel(0.23, 0.04));
      cci++;
    }, [0], '6m', startAt);
    layers.push(tremLayer);

    // ── Layer 3: sub rumble — pink noise hard low-passed, barely audible
    const rumbleLayer = new AudioLayer(sink, initGain);
    const rumbleFilt  = rumbleLayer.addNode(new Tone.Filter({ type: 'lowpass', frequency: 150, rolloff: -48 }));
    const rumbleLFO   = rumbleLayer.addNode(new Tone.LFO({ frequency: 0.03, min: 80, max: 220 }));
    const rumbleNoise = rumbleLayer.addNode(new Tone.Noise({ type: 'pink', volume: -20 }));

    rumbleLFO.connect(rumbleFilt.frequency);
    rumbleNoise.connect(rumbleFilt);
    rumbleFilt.connect(rumbleLayer.gain);

    (rumbleLFO   as unknown as { start(): void }).start();
    (rumbleNoise as unknown as { start(): void }).start();
    layers.push(rumbleLayer);

    return layers;
  }
}

export const musicEngine = MusicEngine.instance;
