import { NeonSceneBase } from '../ui/NeonSceneBase';
import { NeonUI } from '../ui/NeonUI';
import { neonBtn, neonSlider } from '../ui/NeonRex';
import { neonSection, neonLabelRow, VStack } from '../ui/NeonCompose';
import { NEON, NEON_STR, LAYOUT } from '../constants/ui.constants';
import { soundManager } from '../audio/SoundManager';
import { musicEngine, MusicMood, TransitionSpeed } from '../audio/MusicEngine';

// ── SFX button descriptor ─────────────────────────────────────────────────

interface SfxDef {
  label: string;
  color: number;
  colorStr: string;
  play: () => void;
}

const MUSIC_MOODS: { key: MusicMood; label: string; color: number; colorStr: string }[] = [
  { key: 'menu',   label: 'MENU',   color: NEON.blue,   colorStr: NEON_STR.blue   },
  { key: 'build',  label: 'BUILD',  color: NEON.green,  colorStr: NEON_STR.green  },
  { key: 'combat', label: 'COMBAT', color: NEON.orange, colorStr: NEON_STR.orange },
];

const TRANS_SPEEDS: { key: TransitionSpeed; label: string; desc: string }[] = [
  { key: 'quick',  label: 'QUICK',  desc: '2 bars'  },
  { key: 'normal', label: 'NORMAL', desc: '6 bars'  },
  { key: 'slow',   label: 'SLOW',   desc: '12 bars' },
];

export class AudioShowcaseScene extends NeonSceneBase {
  private _musicStatusTxt!: Phaser.GameObjects.Text;
  private _transStatusTxt!: Phaser.GameObjects.Text;
  private _statusTimer?: ReturnType<typeof setInterval>;

  constructor() { super({ key: 'AudioShowcaseScene' }); }

  create(): void {
    this.buildPage('AUDIO SHOWCASE', 'SettingsScene');
    this.events.on('shutdown', () => {
      if (this._statusTimer) clearInterval(this._statusTimer);
      musicEngine.stop();
    });

    const panelW = this.panelWidth(580);
    const px     = this.panelX(panelW);
    const stack  = new VStack(LAYOUT.CONTENT_TOP, LAYOUT.GAP);

    // ── Sound effects ─────────────────────────────────────────────────────
    const sfxH = neonSection(this, r => this.reg(r), h => this.h(h),
      px, stack.peek(), panelW, 'SOUND EFFECTS', NEON.cyan,
      (inner, ix, iw) => this._buildSFX(inner, ix, iw));
    stack.push(sfxH, LAYOUT.GAP);

    // ── Background music ──────────────────────────────────────────────────
    const musicH = neonSection(this, r => this.reg(r), h => this.h(h),
      px, stack.peek(), panelW, 'BACKGROUND MUSIC', NEON.magenta,
      (inner, ix, iw) => this._buildMusic(inner, ix, iw));
    stack.push(musicH, LAYOUT.GAP);

    // ── Mood transitions ──────────────────────────────────────────────────
    const transH = neonSection(this, r => this.reg(r), h => this.h(h),
      px, stack.peek(), panelW, 'MOOD TRANSITIONS', NEON.blue,
      (inner, ix, iw) => this._buildTransitions(inner, ix, iw));
    stack.push(transH, LAYOUT.GAP);

    this.enableScroll(stack.currentY);
    this._statusTimer = setInterval(() => this._refreshStatus(), 200);
  }

  // ── SFX section ───────────────────────────────────────────────────────────

  private _buildSFX(inner: VStack, ix: number, iw: number): void {
    const COLS = 4;
    const gap  = LAYOUT.GAP_SM;
    const btnW = Math.floor((iw - (COLS - 1) * gap) / COLS);
    const btnH = LAYOUT.BTN_H;

    // Status
    const statusY = inner.push(LAYOUT.LABEL_H, LAYOUT.GAP_XS);
    const statusTxt = this.reg(this.add.text(ix, statusY,
      'Click a button to preview a sound',
      { fontSize: `${LAYOUT.FONT_SMALL}px`, color: '#556677', fontFamily: 'monospace' }));

    const showPlayed = (label: string) => {
      statusTxt.setText(`▶  ${label}`).setColor(NEON_STR.cyan);
      this.time.delayedCall(1200, () => {
        if (statusTxt.active) statusTxt.setText('Click a button to preview a sound').setColor('#556677');
      });
    };

    const row = (defs: SfxDef[]) => {
      const y = inner.push(btnH);
      defs.forEach((def, col) => {
        this.h(neonBtn(this, ix + col * (btnW + gap), y, btnW, btnH,
          def.color, def.colorStr, def.label, 9, () => {
            showPlayed(def.label);
            def.play();
          }));
      });
    };

    const label = (text: string, color?: string) =>
      neonLabelRow(this, r => this.reg(r), ix, inner, text, color);

    // ── Gear ──────────────────────────────────────────────────────────────
    label('GEAR SOUNDS', NEON_STR.green);
    row([
      { label: 'PICKUP',    color: NEON.green,   colorStr: NEON_STR.green,   play: () => soundManager.playGearPickup() },
      { label: 'PLACE',     color: NEON.green,   colorStr: NEON_STR.green,   play: () => soundManager.playGearPlace() },
      { label: 'MESH',      color: NEON.green,   colorStr: NEON_STR.green,   play: () => soundManager.playGearMesh() },
      { label: 'TICK',      color: NEON.green,   colorStr: NEON_STR.green,   play: () => soundManager.playGearTick() },
    ]);
    row([
      { label: 'JAM',       color: NEON.red,     colorStr: NEON_STR.red,     play: () => soundManager.playGearJam() },
      { label: 'DESTROYED', color: NEON.red,     colorStr: NEON_STR.red,     play: () => soundManager.playGearDestroyed() },
      { label: 'BURNT OUT', color: NEON.orange,  colorStr: NEON_STR.orange,  play: () => soundManager.playGearBurntOut() },
      { label: 'OVERCLOCK', color: NEON.yellow,  colorStr: NEON_STR.yellow,  play: () => soundManager.playGearOverclock() },
    ]);
    row([
      { label: 'CAPACITOR', color: NEON.cyan,    colorStr: NEON_STR.cyan,    play: () => soundManager.playCapacitorBurst() },
      { label: 'WRN LATCH', color: NEON.magenta, colorStr: NEON_STR.magenta, play: () => soundManager.playWrenchLatch() },
      { label: 'HEALER',    color: NEON.blue,    colorStr: NEON_STR.blue,    play: () => soundManager.playHealerPulse() },
    ]);

    // ── Unit spawns ───────────────────────────────────────────────────────
    label('UNIT SPAWNS', NEON_STR.blue);
    row([
      { label: 'INFANTRY',  color: NEON.blue,    colorStr: NEON_STR.blue,    play: () => soundManager.playUnitSpawn('infantry') },
      { label: 'ELITE INF', color: NEON.blue,    colorStr: NEON_STR.blue,    play: () => soundManager.playUnitSpawn('elite_infantry') },
      { label: 'ARTILLERY', color: NEON.orange,  colorStr: NEON_STR.orange,  play: () => soundManager.playUnitSpawn('artillery') },
      { label: 'ELT ARTY',  color: NEON.orange,  colorStr: NEON_STR.orange,  play: () => soundManager.playUnitSpawn('elite_artillery') },
    ]);
    row([
      { label: 'CAVALRY',   color: NEON.yellow,  colorStr: NEON_STR.yellow,  play: () => soundManager.playUnitSpawn('cavalry') },
      { label: 'ELT CAVA',  color: NEON.yellow,  colorStr: NEON_STR.yellow,  play: () => soundManager.playUnitSpawn('elite_cavalry') },
      { label: 'IRON GARD', color: NEON.red,     colorStr: NEON_STR.red,     play: () => soundManager.playUnitSpawn('iron_guard') },
      { label: 'CRYSTAL',   color: NEON.cyan,    colorStr: NEON_STR.cyan,    play: () => soundManager.playUnitSpawn('crystal_sentinel') },
    ]);
    row([
      { label: 'PHANTOM',   color: NEON.magenta, colorStr: NEON_STR.magenta, play: () => soundManager.playUnitSpawn('aether_phantom') },
      { label: 'WRENCH',    color: NEON.green,   colorStr: NEON_STR.green,   play: () => soundManager.playUnitSpawn('wrench') },
    ]);

    // ── Unit deaths ───────────────────────────────────────────────────────
    label('UNIT DEATHS', NEON_STR.orange);
    row([
      { label: 'INFANTRY',  color: NEON.blue,    colorStr: NEON_STR.blue,    play: () => soundManager.playUnitDie('infantry') },
      { label: 'ELITE INF', color: NEON.blue,    colorStr: NEON_STR.blue,    play: () => soundManager.playUnitDie('elite_infantry') },
      { label: 'ARTILLERY', color: NEON.orange,  colorStr: NEON_STR.orange,  play: () => soundManager.playUnitDie('artillery') },
      { label: 'ELT ARTY',  color: NEON.orange,  colorStr: NEON_STR.orange,  play: () => soundManager.playUnitDie('elite_artillery') },
    ]);
    row([
      { label: 'CAVALRY',   color: NEON.yellow,  colorStr: NEON_STR.yellow,  play: () => soundManager.playUnitDie('cavalry') },
      { label: 'ELT CAVA',  color: NEON.yellow,  colorStr: NEON_STR.yellow,  play: () => soundManager.playUnitDie('elite_cavalry') },
      { label: 'IRON GARD', color: NEON.red,     colorStr: NEON_STR.red,     play: () => soundManager.playUnitDie('iron_guard') },
      { label: 'CRYSTAL',   color: NEON.cyan,    colorStr: NEON_STR.cyan,    play: () => soundManager.playUnitDie('crystal_sentinel') },
    ]);
    row([
      { label: 'PHANTOM',   color: NEON.magenta, colorStr: NEON_STR.magenta, play: () => soundManager.playUnitDie('aether_phantom') },
      { label: 'WRENCH',    color: NEON.green,   colorStr: NEON_STR.green,   play: () => soundManager.playUnitDie('wrench') },
    ]);

    // ── Unit attacks ──────────────────────────────────────────────────────
    label('UNIT ATTACKS (melee)', NEON_STR.red);
    row([
      { label: 'INFANTRY',  color: NEON.blue,    colorStr: NEON_STR.blue,    play: () => soundManager.playUnitAttack('infantry') },
      { label: 'CAVALRY',   color: NEON.yellow,  colorStr: NEON_STR.yellow,  play: () => soundManager.playUnitAttack('cavalry') },
      { label: 'IRON GARD', color: NEON.red,     colorStr: NEON_STR.red,     play: () => soundManager.playUnitAttack('iron_guard') },
      { label: 'PHANTOM',   color: NEON.magenta, colorStr: NEON_STR.magenta, play: () => soundManager.playUnitAttack('aether_phantom') },
    ]);
    row([
      { label: 'WRENCH',    color: NEON.green,   colorStr: NEON_STR.green,   play: () => soundManager.playUnitAttack('wrench') },
    ]);

    // ── Projectiles ───────────────────────────────────────────────────────
    label('PROJECTILES', NEON_STR.magenta);
    row([
      { label: 'CRYS FIRE', color: NEON.cyan,    colorStr: NEON_STR.cyan,    play: () => soundManager.playCrystalShardFire() },
      { label: 'CRYS HIT',  color: NEON.cyan,    colorStr: NEON_STR.cyan,    play: () => soundManager.playCrystalShardHit() },
      { label: 'CRYS SLOW', color: NEON.blue,    colorStr: NEON_STR.blue,    play: () => soundManager.playCrystalSlowApplied() },
    ]);
    row([
      { label: 'ARTY FIRE', color: NEON.orange,  colorStr: NEON_STR.orange,  play: () => soundManager.playArtilleryFire() },
      { label: 'ARTY HIT',  color: NEON.red,     colorStr: NEON_STR.red,     play: () => soundManager.playArtilleryHit() },
    ]);

    // ── Combat & abilities ────────────────────────────────────────────────
    label('COMBAT & ABILITIES', NEON_STR.red);
    row([
      { label: 'MELEE',     color: NEON.orange,  colorStr: NEON_STR.orange,  play: () => soundManager.playMeleeCombatStart() },
      { label: 'BASE HIT',  color: NEON.red,     colorStr: NEON_STR.red,     play: () => soundManager.playBaseDamaged() },
      { label: 'EXPLOSION', color: NEON.orange,  colorStr: NEON_STR.orange,  play: () => soundManager.playExplosion() },
    ]);
    row([
      { label: 'GOLD SURGE', color: NEON.yellow,  colorStr: NEON_STR.yellow,  play: () => soundManager.playAbility('power_surge') },
      { label: 'OVERCLOCK', color: NEON.magenta, colorStr: NEON_STR.magenta, play: () => soundManager.playAbility('overclock_no_burnout') },
      { label: 'ABILITY',   color: NEON.green,   colorStr: NEON_STR.green,   play: () => soundManager.playAbility('counter_intel') },
    ]);

    // ── Game flow ─────────────────────────────────────────────────────────
    label('GAME FLOW', NEON_STR.yellow);
    row([
      { label: 'VICTORY',   color: NEON.yellow,  colorStr: NEON_STR.yellow,  play: () => soundManager.playVictory() },
      { label: 'DEFEAT',    color: NEON.red,     colorStr: NEON_STR.red,     play: () => soundManager.playDefeat() },
    ]);
  }

  // ── Music section ─────────────────────────────────────────────────────────

  private _buildMusic(inner: VStack, ix: number, iw: number): void {
    const btnH = LAYOUT.BTN_H;
    const gap  = LAYOUT.GAP_SM;

    const statusY = inner.push(LAYOUT.LABEL_H, LAYOUT.GAP_XS);
    this._musicStatusTxt = this.reg(this.add.text(ix, statusY, 'Stopped',
      { fontSize: `${LAYOUT.FONT_SMALL}px`, color: '#556677', fontFamily: 'monospace' }));

    const moodLabelY = inner.push(LAYOUT.LABEL_H, LAYOUT.GAP_XS);
    this.reg(this.add.text(ix, moodLabelY, 'Mood:',
      { fontSize: `${LAYOUT.FONT_LABEL}px`, color: '#889aaa', fontFamily: 'monospace', fontStyle: 'bold' }));

    let selectedMood: MusicMood = 'menu';
    const moodBtnGs: Phaser.GameObjects.Graphics[] = [];
    const moodLabels: Phaser.GameObjects.Text[]    = [];
    const moodBtnW = Math.floor((iw - (MUSIC_MOODS.length - 1) * gap) / MUSIC_MOODS.length);
    const moodBtnY = inner.push(btnH);

    const drawMoodBtns = () => MUSIC_MOODS.forEach((m, i) => {
      const bx = ix + i * (moodBtnW + gap);
      moodBtnGs[i].clear();
      NeonUI.drawButton(moodBtnGs[i], bx, moodBtnY, moodBtnW, btnH, m.color, selectedMood === m.key);
      moodLabels[i].setColor(selectedMood === m.key ? m.colorStr : '#445566');
    });

    MUSIC_MOODS.forEach((m, i) => {
      const bx = ix + i * (moodBtnW + gap);
      moodBtnGs[i]  = this.reg(this.add.graphics());
      moodLabels[i] = this.reg(this.add.text(
        bx + moodBtnW / 2, moodBtnY + btnH / 2, m.label,
        { fontSize: '11px', color: '#445566', fontFamily: 'monospace', fontStyle: 'bold' },
      ).setOrigin(0.5));
      const z = this.reg(this.add.zone(bx + moodBtnW / 2, moodBtnY + btnH / 2, moodBtnW, btnH)
        .setInteractive({ cursor: 'pointer' }));
      z.on('pointerdown', () => { selectedMood = m.key; drawMoodBtns(); });
    });
    drawMoodBtns();

    const volLabelY = inner.push(LAYOUT.LABEL_H);
    this.reg(this.add.text(ix, volLabelY, 'Volume:',
      { fontSize: `${LAYOUT.FONT_LABEL}px`, color: '#889aaa', fontFamily: 'monospace', fontStyle: 'bold' }));
    const volPct = this.reg(this.add.text(ix + iw, volLabelY, '60%',
      { fontSize: `${LAYOUT.FONT_LABEL}px`, color: NEON_STR.magenta, fontFamily: 'monospace', fontStyle: 'bold' },
    ).setOrigin(1, 0));
    const sliderY = inner.push(LAYOUT.SLIDER_H);
    this.h(neonSlider(this, ix, sliderY, iw, 0, 1, 0.6, NEON.magenta, NEON_STR.magenta,
      v => { musicEngine.setVolume(v); volPct.setText(`${Math.round(v * 100)}%`); }));

    const ctrlY = inner.push(btnH);
    const ctrlW = Math.floor((iw - gap) / 2);
    this.h(neonBtn(this, ix, ctrlY, ctrlW, btnH, NEON.magenta, NEON_STR.magenta, '▶  PLAY', 12,
      async () => { await musicEngine.play(selectedMood); }));
    this.h(neonBtn(this, ix + ctrlW + gap, ctrlY, ctrlW, btnH, NEON.red, NEON_STR.red, '■  STOP', 12,
      () => musicEngine.stop()));

    const noteY = inner.push(LAYOUT.LABEL_H, LAYOUT.GAP_SM);
    this.reg(this.add.text(ix, noteY, 'Music is procedurally generated — no audio files required.',
      { fontSize: '9px', color: '#334455', fontFamily: 'monospace' }));
  }

  // ── Transitions section ───────────────────────────────────────────────────

  private _buildTransitions(inner: VStack, ix: number, iw: number): void {
    const btnH = LAYOUT.BTN_H;
    const gap  = LAYOUT.GAP_SM;

    const descY = inner.push(LAYOUT.LABEL_H * 2, LAYOUT.GAP_XS);
    this.reg(this.add.text(ix, descY,
      'While music plays, transition to another mood.\nThe BPM morphs and layers blend algorithmically — not just a crossfade.',
      { fontSize: '9px', color: '#667788', fontFamily: 'monospace', lineSpacing: 4 }));

    const statusY = inner.push(LAYOUT.LABEL_H, LAYOUT.GAP_XS);
    this._transStatusTxt = this.reg(this.add.text(ix, statusY, 'Play music above first.',
      { fontSize: `${LAYOUT.FONT_SMALL}px`, color: '#445566', fontFamily: 'monospace' }));

    const speedLabelY = inner.push(LAYOUT.LABEL_H, LAYOUT.GAP_XS);
    this.reg(this.add.text(ix, speedLabelY, 'Transition speed:',
      { fontSize: `${LAYOUT.FONT_LABEL}px`, color: '#889aaa', fontFamily: 'monospace', fontStyle: 'bold' }));

    let selectedSpeed: TransitionSpeed = 'normal';
    const speedBtnGs: Phaser.GameObjects.Graphics[] = [];
    const speedLabels: Phaser.GameObjects.Text[]    = [];
    const speedBtnW = Math.floor((iw - (TRANS_SPEEDS.length - 1) * gap) / TRANS_SPEEDS.length);
    const speedBtnY = inner.push(btnH);

    const drawSpeedBtns = () => TRANS_SPEEDS.forEach((s, i) => {
      const bx = ix + i * (speedBtnW + gap);
      speedBtnGs[i].clear();
      NeonUI.drawButton(speedBtnGs[i], bx, speedBtnY, speedBtnW, btnH, NEON.blue, selectedSpeed === s.key);
      speedLabels[i].setColor(selectedSpeed === s.key ? NEON_STR.blue : '#445566');
    });

    TRANS_SPEEDS.forEach((s, i) => {
      const bx = ix + i * (speedBtnW + gap);
      speedBtnGs[i]  = this.reg(this.add.graphics());
      speedLabels[i] = this.reg(this.add.text(
        bx + speedBtnW / 2, speedBtnY + btnH / 2,
        `${s.label}\n${s.desc}`,
        { fontSize: '9px', color: '#445566', fontFamily: 'monospace', fontStyle: 'bold', align: 'center', lineSpacing: 2 },
      ).setOrigin(0.5));
      const z = this.reg(this.add.zone(bx + speedBtnW / 2, speedBtnY + btnH / 2, speedBtnW, btnH)
        .setInteractive({ cursor: 'pointer' }));
      z.on('pointerdown', () => { selectedSpeed = s.key; drawSpeedBtns(); });
    });
    drawSpeedBtns();

    const toMoodLabelY = inner.push(LAYOUT.LABEL_H, LAYOUT.GAP_XS);
    this.reg(this.add.text(ix, toMoodLabelY, 'Transition to:',
      { fontSize: `${LAYOUT.FONT_LABEL}px`, color: '#889aaa', fontFamily: 'monospace', fontStyle: 'bold' }));

    const transBtnW = Math.floor((iw - (MUSIC_MOODS.length - 1) * gap) / MUSIC_MOODS.length);
    const transBtnY = inner.push(btnH);
    MUSIC_MOODS.forEach((m, i) => {
      this.h(neonBtn(
        this, ix + i * (transBtnW + gap), transBtnY, transBtnW, btnH,
        m.color, m.colorStr, `→ ${m.label}`, 11,
        async () => {
          if (!musicEngine.playing) {
            this._transStatusTxt?.setText('▲ Start music first.').setColor(NEON_STR.red);
            return;
          }
          await musicEngine.transition(m.key, selectedSpeed);
        },
      ));
    });

    const hintY = inner.push(LAYOUT.LABEL_H, LAYOUT.GAP_SM);
    this.reg(this.add.text(ix, hintY,
      'Tip: slow transitions (12 bars) let you hear the BPM morph clearly.',
      { fontSize: '9px', color: '#334455', fontFamily: 'monospace' }));
  }

  // ── Status polling ────────────────────────────────────────────────────────

  private _refreshStatus(): void {
    if (!this.scene.isActive('AudioShowcaseScene')) return;

    const ms = this._musicStatusTxt;
    if (ms?.active) {
      if (musicEngine.playing && musicEngine.mood) {
        const transLabel = musicEngine.transitioning ? '  (transitioning…)' : '';
        ms.setText(`♪  Playing: ${musicEngine.mood.toUpperCase()}${transLabel}`).setColor(NEON_STR.magenta);
      } else {
        ms.setText('Stopped').setColor('#556677');
      }
    }

    const ts = this._transStatusTxt;
    if (ts?.active) {
      if (!musicEngine.playing) {
        ts.setText('Play music above first.').setColor('#445566');
      } else if (musicEngine.transitioning) {
        ts.setText(`Transitioning → ${(musicEngine.mood ?? '').toUpperCase()}…`).setColor(NEON_STR.blue);
      } else {
        ts.setText(`Now playing: ${(musicEngine.mood ?? '').toUpperCase()}  — click a target to transition.`)
          .setColor(NEON_STR.green);
      }
    }
  }
}
