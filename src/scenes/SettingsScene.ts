import Phaser from 'phaser';
import { neonBtn, neonSlider } from '../ui/NeonRex';
import { neonToggle, neonLabeledToggle, neonKeybindInput, neonBtnGroup } from '../ui/NeonForm';
import { NeonSceneBase } from '../ui/NeonSceneBase';
import { neonSection } from '../ui/NeonCompose';
import { VStack } from '../ui/NeonStack';
import { NEON, NEON_STR, BG, GAME_SETTINGS, saveSettings, LAYOUT } from '../constants/ui.constants';
import { soundManager } from '../audio/SoundManager';
import { musicEngine } from '../audio/MusicEngine';

/**
 * SettingsScene — audio, speed, edge scroll, controls.
 * Reference implementation using NeonSceneBase + VStack + neonSection.
 */
export class SettingsScene extends NeonSceneBase {
  constructor() {
    super({ key: 'SettingsScene' });
  }

  create(): void {
    this.buildPage('SETTINGS', 'MenuScene');

    const panelW = this.panelWidth(520);
    const px     = this.panelX(panelW);
    const stack  = new VStack(LAYOUT.CONTENT_TOP, LAYOUT.GAP);

    // ── Audio ──────────────────────────────────────────────────────────
    const audioH = neonSection(this, r => this.reg(r), h => this.h(h),
      px, stack.peek(), panelW, 'AUDIO', NEON.cyan,
      (inner, ix, iw) => {
        this.buildAudioContent(ix, iw, inner);
      });
    stack.push(audioH, LAYOUT.GAP);

    // ── Gameplay speed ─────────────────────────────────────────────────
    const speedH = neonSection(this, r => this.reg(r), h => this.h(h),
      px, stack.peek(), panelW, 'GAMEPLAY', NEON.orange,
      (inner, ix, iw) => {
        this.buildSpeedContent(ix, iw, inner);
      });
    stack.push(speedH, LAYOUT.GAP);

    // ── Display ────────────────────────────────────────────────────────
    const displayH = neonSection(this, r => this.reg(r), h => this.h(h),
      px, stack.peek(), panelW, 'DISPLAY', NEON.cyan,
      (inner, ix) => {
        this.buildDisplayContent(ix, inner);
      });
    stack.push(displayH, LAYOUT.GAP);

    // ── Edge scrolling ─────────────────────────────────────────────────
    const edgeH = neonSection(this, r => this.reg(r), h => this.h(h),
      px, stack.peek(), panelW, 'EDGE SCROLLING', NEON.magenta,
      (inner, ix, iw) => {
        this.buildEdgeScrollContent(ix, iw, inner);
      });
    stack.push(edgeH, LAYOUT.GAP);

    // ── Controls ───────────────────────────────────────────────────────
    const ctrlH = neonSection(this, r => this.reg(r), h => this.h(h),
      px, stack.peek(), panelW, 'CONTROLS', NEON.blue,
      (inner, ix) => {
        this.buildControlsContent(ix, inner);
      });
    stack.push(ctrlH, LAYOUT.GAP_LG);

    // ── Showcase buttons ───────────────────────────────────────────────
    const showcaseY = stack.push(LAYOUT.BTN_H, LAYOUT.GAP);
    const btnW = 200, gap = 14;
    const totalW = btnW * 2 + gap;
    this.h(neonBtn(this, this.cx - totalW / 2, showcaseY, btnW, LAYOUT.BTN_H,
      NEON.green, NEON_STR.green, 'UI SHOWCASE', 14,
      () => this.scene.start('UIShowcaseScene')));
    this.h(neonBtn(this, this.cx - totalW / 2 + btnW + gap, showcaseY, btnW, LAYOUT.BTN_H,
      NEON.magenta, NEON_STR.magenta, 'AUDIO SHOWCASE', 14,
      () => this.scene.start('AudioShowcaseScene')));

    this.enableScroll(stack.currentY);
  }

  // ── Section content builders ─────────────────────────────────────────

  private buildAudioContent(ix: number, iw: number, inner: VStack): void {
    const toggleH = 20;
    const btnY = inner.push(toggleH);
    this.h(neonLabeledToggle(this, ix, btnY, 40, toggleH, 'SOUND', GAME_SETTINGS.soundEnabled, NEON.green,
      v => { GAME_SETTINGS.soundEnabled = v; saveSettings(); },
      { labelPos: 'left', fontSize: 11 }));

    // Music / SFX volume sliders
    const sliderW = Math.min(220, iw - 90);
    const musicY = inner.push(30);
    this.reg(this.add.text(ix, musicY + 8, 'Music', { fontSize: '11px', color: '#889aaa', fontFamily: 'monospace' }));
    this.h(neonSlider(this, ix + 60, musicY - 8, sliderW, 0, 1, GAME_SETTINGS.musicVolume, NEON.magenta, NEON_STR.magenta,
      v => { GAME_SETTINGS.musicVolume = v; saveSettings(); musicEngine.setVolume(v); }));

    const sfxY = inner.push(30);
    this.reg(this.add.text(ix, sfxY + 8, 'SFX', { fontSize: '11px', color: '#889aaa', fontFamily: 'monospace' }));
    this.h(neonSlider(this, ix + 60, sfxY - 8, sliderW, 0, 1, GAME_SETTINGS.sfxVolume, NEON.cyan, NEON_STR.cyan,
      v => { GAME_SETTINGS.sfxVolume = v; saveSettings(); soundManager.setVolume(v); }));
  }

  private buildDisplayContent(ix: number, inner: VStack): void {
    const sizes = [
      { key: 'small', label: 'SMALL', value: 0.85 },
      { key: 'normal', label: 'NORMAL', value: 1 },
      { key: 'large', label: 'LARGE', value: 1.25 },
      { key: 'xl', label: 'XL', value: 1.5 },
    ];
    const btnW = 84, btnH = 24;
    const btnY = inner.push(btnH);
    const selectedKey = sizes.find(s => s.value === GAME_SETTINGS.uiScale)?.key ?? 'normal';
    this.h(neonBtnGroup(this, ix, btnY, btnW, btnH, sizes.map(s => ({ key: s.key, label: s.label })), selectedKey, NEON.yellow,
      key => {
        GAME_SETTINGS.uiScale = sizes.find(s => s.key === key)!.value;
        saveSettings();
        // Text size is read once at scene construction, not live-updated. A
        // camera-zoom based live preview was tried and reverted: zoom scales
        // around the viewport centre, which pushes edge-anchored HUD elements
        // (the sliding panel, health bars, this scene's own back button and
        // scroll hint) off-screen entirely rather than just resizing them.
        // Restarting this scene previews the new scale immediately; other
        // scenes (menus, the next match) pick it up next time they're
        // built -- deliberately not forced mid-match, which would mean
        // rebuilding the whole HUD out from under a running game.
        this.scene.restart();
      }));

    // Colorblind mode
    const cbY = inner.push(24);
    this.reg(this.add.text(ix, cbY + 4, 'Colorblind mode', {
      fontSize: '11px', color: '#889aaa', fontFamily: 'monospace',
    }));
    this.h(neonToggle(this, ix + 150, cbY, 36, 18, GAME_SETTINGS.colorblindMode, NEON.yellow,
      v => { GAME_SETTINGS.colorblindMode = v; saveSettings(); }));
  }

  private buildSpeedContent(ix: number, _iw: number, inner: VStack): void {
    const speeds = [
      { key: '0.5x', label: '0.5x', value: 0.5 },
      { key: '1x', label: '1x', value: 1 },
      { key: '2x', label: '2x', value: 2 },
    ];
    const btnW = 60, btnH = 24;
    const btnY = inner.push(btnH);
    const selectedKey = speeds.find(s => s.value === GAME_SETTINGS.gameSpeed)?.key ?? '1x';
    this.h(neonBtnGroup(this, ix, btnY, btnW, btnH, speeds.map(s => ({ key: s.key, label: s.label })), selectedKey, NEON.orange,
      key => { GAME_SETTINGS.gameSpeed = speeds.find(s => s.key === key)!.value; saveSettings(); }));
  }

  private buildEdgeScrollContent(ix: number, _iw: number, inner: VStack): void {
    const btnH = 24;
    const btnY = inner.push(btnH);

    // Enable/disable toggle
    const toggleW = 40, toggleH = 18;
    this.h(neonLabeledToggle(this, ix, btnY + (btnH - toggleH) / 2, toggleW, toggleH, 'ENABLED',
      GAME_SETTINGS.edgeScrollEnabled, NEON.magenta,
      v => { GAME_SETTINGS.edgeScrollEnabled = v; saveSettings(); },
      { labelPos: 'left', fontSize: 10 }));

    // Speed buttons
    const speeds = [{ key: '150', label: '150', value: 150 }, { key: '300', label: '300', value: 300 }, { key: '600', label: '600', value: 600 }];
    const speedBtnW = 46, speedStartX = ix + 150;
    this.reg(this.add.text(speedStartX, btnY + btnH / 2, 'Speed:', { fontSize: '10px', color: '#667788', fontFamily: 'monospace' }).setOrigin(0, 0.5));
    const speedLabelX = speedStartX + 42;
    const speedSelected = speeds.find(s => s.value === GAME_SETTINGS.edgeScrollSpeed)?.key ?? '300';
    this.h(neonBtnGroup(this, speedLabelX, btnY, speedBtnW, btnH, speeds.map(s => ({ key: s.key, label: s.label })), speedSelected, NEON.magenta,
      key => { GAME_SETTINGS.edgeScrollSpeed = speeds.find(s => s.key === key)!.value; saveSettings(); }));

    // Zone percentage buttons
    const pcts = [{ key: '3', label: '3%', value: 3 }, { key: '5', label: '5%', value: 5 }, { key: '10', label: '10%', value: 10 }];
    const pctBtnW = 36, pctStartX = speedLabelX + speeds.length * speedBtnW + 14;
    this.reg(this.add.text(pctStartX, btnY + btnH / 2, 'Zone:', { fontSize: '10px', color: '#667788', fontFamily: 'monospace' }).setOrigin(0, 0.5));
    const pctLabelX = pctStartX + 38;
    const pctSelected = pcts.find(p => p.value === GAME_SETTINGS.edgeScrollPercent)?.key ?? '5';
    this.h(neonBtnGroup(this, pctLabelX, btnY, pctBtnW, btnH, pcts.map(p => ({ key: p.key, label: p.label })), pctSelected, NEON.cyan,
      key => { GAME_SETTINGS.edgeScrollPercent = pcts.find(p => p.key === key)!.value; saveSettings(); }));
  }

  private buildControlsContent(ix: number, inner: VStack): void {
    // Fixed, non-rebindable controls
    const fixed = [
      'Click gear     Pick up / place',
      'Scroll         Zoom in/out',
      'Middle-click   Pan camera',
      'Tab bar        Switch panels',
    ];
    fixed.forEach(line => {
      const y = inner.push(13, 0);
      this.reg(this.add.text(ix, y, line, { fontSize: '10px', color: '#88aacc', fontFamily: 'monospace' }));
    });

    inner.addGap(LAYOUT.GAP_SM);

    // Rebindable keys
    const kbW = 60, kbH = LAYOUT.KEYBIND_H;
    const removeY = inner.push(kbH);
    this.reg(this.add.text(ix, removeY + kbH / 2 - 6, 'Toggle remove mode', {
      fontSize: '11px', color: '#889aaa', fontFamily: 'monospace',
    }));
    this.h(neonKeybindInput(this, ix + 200, removeY, kbW, kbH, GAME_SETTINGS.keybinds.removeMode, NEON.blue,
      key => { GAME_SETTINGS.keybinds.removeMode = key; saveSettings(); }));

    const cancelY = inner.push(kbH);
    this.reg(this.add.text(ix, cancelY + kbH / 2 - 6, 'Cancel action', {
      fontSize: '11px', color: '#889aaa', fontFamily: 'monospace',
    }));
    this.h(neonKeybindInput(this, ix + 200, cancelY, kbW, kbH, GAME_SETTINGS.keybinds.cancel, NEON.blue,
      key => { GAME_SETTINGS.keybinds.cancel = key; saveSettings(); }));

    inner.addGap(LAYOUT.GAP_SM);
    this.reg(this.add.text(ix, inner.push(13, 0), 'Keybind changes take effect on the next match.', {
      fontSize: '9px', color: '#556677', fontFamily: 'monospace',
    }));
  }
}
