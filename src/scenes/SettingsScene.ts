import Phaser from 'phaser';
import { NeonUI } from '../ui/NeonUI';
import { neonBtn } from '../ui/NeonRex';
import { NeonSceneBase } from '../ui/NeonSceneBase';
import { neonSection } from '../ui/NeonCompose';
import { VStack } from '../ui/NeonStack';
import { NEON, NEON_STR, BG, GAME_SETTINGS, saveSettings, LAYOUT } from '../constants/ui.constants';

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
      (inner, ix) => {
        this.buildAudioContent(ix, inner);
      });
    stack.push(audioH, LAYOUT.GAP);

    // ── Gameplay speed ─────────────────────────────────────────────────
    const speedH = neonSection(this, r => this.reg(r), h => this.h(h),
      px, stack.peek(), panelW, 'GAMEPLAY', NEON.orange,
      (inner, ix, iw) => {
        this.buildSpeedContent(ix, iw, inner);
      });
    stack.push(speedH, LAYOUT.GAP);

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

  private buildAudioContent(ix: number, inner: VStack): void {
    const toggleW = 130, toggleH = 24;
    const btnY = inner.push(toggleH);
    const btnG = this.reg(this.add.graphics());
    const btnLabel = this.reg(this.add.text(ix + toggleW / 2, btnY + toggleH / 2, '', {
      fontSize: '12px', color: NEON_STR.cyan, fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5));

    const draw = () => {
      btnG.clear();
      if (GAME_SETTINGS.soundEnabled) {
        NeonUI.drawButton(btnG, ix, btnY, toggleW, toggleH, NEON.green, false);
        btnLabel.setText('SOUND: ON').setColor(NEON_STR.green);
      } else {
        NeonUI.drawButton(btnG, ix, btnY, toggleW, toggleH, NEON.red, false);
        btnLabel.setText('SOUND: OFF').setColor(NEON_STR.red);
      }
    };
    draw();

    const zone = this.reg(this.add.zone(ix + toggleW / 2, btnY + toggleH / 2, toggleW, toggleH)
      .setInteractive({ cursor: 'pointer' }));
    zone.on('pointerdown', () => { GAME_SETTINGS.soundEnabled = !GAME_SETTINGS.soundEnabled; saveSettings(); draw(); });
    zone.on('pointerover', () => { btnG.clear(); NeonUI.drawButton(btnG, ix, btnY, toggleW, toggleH, GAME_SETTINGS.soundEnabled ? NEON.green : NEON.red, true); });
    zone.on('pointerout',  () => draw());
  }

  private buildSpeedContent(ix: number, _iw: number, inner: VStack): void {
    const speeds = [{ label: '0.5x', value: 0.5 }, { label: '1x', value: 1 }, { label: '2x', value: 2 }];
    const btnW = 60, btnH = 24, btnGap = 8;
    const btnY = inner.push(btnH);
    const speedBtnGs: Phaser.GameObjects.Graphics[] = [];
    const speedLabels: Phaser.GameObjects.Text[]    = [];

    const draw = () => {
      speeds.forEach((s, i) => {
        const bx = ix + i * (btnW + btnGap);
        const isActive = GAME_SETTINGS.gameSpeed === s.value;
        speedBtnGs[i].clear();
        NeonUI.drawButton(speedBtnGs[i], bx, btnY, btnW, btnH, isActive ? NEON.yellow : NEON.orange, isActive);
        speedLabels[i].setColor(isActive ? NEON_STR.yellow : '#667788');
      });
    };

    speeds.forEach((s, i) => {
      const bx = ix + i * (btnW + btnGap);
      speedBtnGs[i] = this.reg(this.add.graphics());
      speedLabels[i] = this.reg(this.add.text(bx + btnW / 2, btnY + btnH / 2, s.label, {
        fontSize: '12px', color: '#667788', fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5));
      const zone = this.reg(this.add.zone(bx + btnW / 2, btnY + btnH / 2, btnW, btnH).setInteractive({ cursor: 'pointer' }));
      zone.on('pointerdown', () => { GAME_SETTINGS.gameSpeed = s.value; saveSettings(); draw(); });
    });
    draw();

  }

  private buildEdgeScrollContent(ix: number, _iw: number, inner: VStack): void {
    const btnH = 24;
    const btnY = inner.push(btnH);

    // Enable/disable toggle
    const toggleW = 100;
    const toggleBtnG = this.reg(this.add.graphics());
    const toggleLabel = this.reg(this.add.text(ix + toggleW / 2, btnY + btnH / 2, '', {
      fontSize: '11px', color: NEON_STR.magenta, fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5));

    const drawToggle = () => {
      toggleBtnG.clear();
      if (GAME_SETTINGS.edgeScrollEnabled) {
        NeonUI.drawButton(toggleBtnG, ix, btnY, toggleW, btnH, NEON.green, false);
        toggleLabel.setText('ON').setColor(NEON_STR.green);
      } else {
        NeonUI.drawButton(toggleBtnG, ix, btnY, toggleW, btnH, NEON.red, false);
        toggleLabel.setText('OFF').setColor(NEON_STR.red);
      }
    };
    drawToggle();
    const toggleZone = this.reg(this.add.zone(ix + toggleW / 2, btnY + btnH / 2, toggleW, btnH).setInteractive({ cursor: 'pointer' }));
    toggleZone.on('pointerdown', () => { GAME_SETTINGS.edgeScrollEnabled = !GAME_SETTINGS.edgeScrollEnabled; saveSettings(); drawToggle(); });

    // Speed buttons
    const speeds = [{ label: '150', value: 150 }, { label: '300', value: 300 }, { label: '600', value: 600 }];
    const speedBtnW = 46, speedGap = 6, speedStartX = ix + toggleW + 14;
    this.reg(this.add.text(speedStartX, btnY + btnH / 2, 'Speed:', { fontSize: '10px', color: '#667788', fontFamily: 'monospace' }).setOrigin(0, 0.5));
    const speedLabelX = speedStartX + 42;
    const speedBtnGs: Phaser.GameObjects.Graphics[] = [], speedBtnLabels: Phaser.GameObjects.Text[] = [];
    const drawSpeedBtns = () => speeds.forEach((s, i) => {
      const bx = speedLabelX + i * (speedBtnW + speedGap);
      const isActive = GAME_SETTINGS.edgeScrollSpeed === s.value;
      speedBtnGs[i].clear();
      NeonUI.drawButton(speedBtnGs[i], bx, btnY, speedBtnW, btnH, NEON.magenta, isActive);
      speedBtnLabels[i].setColor(isActive ? NEON_STR.magenta : '#556677');
    });
    speeds.forEach((s, i) => {
      const bx = speedLabelX + i * (speedBtnW + speedGap);
      speedBtnGs[i] = this.reg(this.add.graphics());
      speedBtnLabels[i] = this.reg(this.add.text(bx + speedBtnW / 2, btnY + btnH / 2, s.label, { fontSize: '10px', color: '#556677', fontFamily: 'monospace' }).setOrigin(0.5));
      const z = this.reg(this.add.zone(bx + speedBtnW / 2, btnY + btnH / 2, speedBtnW, btnH).setInteractive({ cursor: 'pointer' }));
      z.on('pointerdown', () => { GAME_SETTINGS.edgeScrollSpeed = s.value; saveSettings(); drawSpeedBtns(); });
    });
    drawSpeedBtns();

    // Zone percentage buttons
    const pcts = [{ label: '3%', value: 3 }, { label: '5%', value: 5 }, { label: '10%', value: 10 }];
    const pctBtnW = 36, pctStartX = speedLabelX + speeds.length * (speedBtnW + speedGap) + 14;
    this.reg(this.add.text(pctStartX, btnY + btnH / 2, 'Zone:', { fontSize: '10px', color: '#667788', fontFamily: 'monospace' }).setOrigin(0, 0.5));
    const pctLabelX = pctStartX + 38;
    const pctBtnGs: Phaser.GameObjects.Graphics[] = [], pctBtnLabels: Phaser.GameObjects.Text[] = [];
    const drawPctBtns = () => pcts.forEach((p, i) => {
      const bx = pctLabelX + i * (pctBtnW + speedGap);
      const isActive = GAME_SETTINGS.edgeScrollPercent === p.value;
      pctBtnGs[i].clear();
      NeonUI.drawButton(pctBtnGs[i], bx, btnY, pctBtnW, btnH, NEON.cyan, isActive);
      pctBtnLabels[i].setColor(isActive ? NEON_STR.cyan : '#556677');
    });
    pcts.forEach((p, i) => {
      const bx = pctLabelX + i * (pctBtnW + speedGap);
      pctBtnGs[i] = this.reg(this.add.graphics());
      pctBtnLabels[i] = this.reg(this.add.text(bx + pctBtnW / 2, btnY + btnH / 2, p.label, { fontSize: '10px', color: '#556677', fontFamily: 'monospace' }).setOrigin(0.5));
      const z = this.reg(this.add.zone(bx + pctBtnW / 2, btnY + btnH / 2, pctBtnW, btnH).setInteractive({ cursor: 'pointer' }));
      z.on('pointerdown', () => { GAME_SETTINGS.edgeScrollPercent = p.value; saveSettings(); drawPctBtns(); });
    });
    drawPctBtns();
  }

  private buildControlsContent(ix: number, inner: VStack): void {
    const controls = [
      'Click gear     Pick up / place',
      'R              Toggle remove mode',
      'ESC            Cancel action',
      'Scroll         Zoom in/out',
      'Middle-click   Pan camera',
      'Tab bar        Switch panels',
    ];
    controls.forEach(line => {
      const y = inner.push(13, 0);
      this.reg(this.add.text(ix, y, line, { fontSize: '10px', color: '#88aacc', fontFamily: 'monospace' }));
    });
  }
}
