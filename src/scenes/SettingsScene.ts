import Phaser from 'phaser';
import { NeonUI } from '../ui/NeonUI';
import { NEON, NEON_STR, BG, GAME_SETTINGS, saveSettings } from '../constants/ui.constants';

/**
 * SettingsScene: audio mute, game speed, and controls reference.
 */
export class SettingsScene extends Phaser.Scene {
  constructor() {
    super({ key: 'SettingsScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    const cx = width / 2;

    // Background
    const bg = this.add.graphics();
    bg.fillGradientStyle(BG.deep, BG.deep, BG.mid, BG.mid, 1);
    bg.fillRect(0, 0, width, height);

    // Title
    this.add.text(cx, 50, 'SETTINGS', NeonUI.neonTextStyle(NEON_STR.cyan, 28, true))
      .setOrigin(0.5);

    const panelW = Math.min(500, width - 60);
    const panelH = 70;
    const gap = 14;
    const startY = 110;

    // ── Audio Section ──
    this.buildAudioSection(cx, panelW, startY);

    // ── Game Speed Section ──
    this.buildSpeedSection(cx, panelW, startY + panelH + gap);

    // ── Edge Scroll Section ──
    this.buildEdgeScrollSection(cx, panelW, startY + (panelH + gap) * 2);

    // ── Controls Reference ──
    this.buildControlsSection(cx, panelW, startY + (panelH + gap) * 3);

    // Back button
    this.createBackButton();
  }

  private buildAudioSection(cx: number, panelW: number, py: number): void {
    const px = cx - panelW / 2;
    const g = this.add.graphics();
    NeonUI.drawPanel(g, px, py, panelW, 70, NEON.cyan);

    this.add.text(px + 14, py + 10, 'AUDIO', NeonUI.neonTextStyle(NEON_STR.cyan, 13, true));

    const lineG = this.add.graphics();
    NeonUI.drawDivider(lineG, px + 14, py + 28, px + 80, py + 28, NEON.cyan);

    // Mute toggle button
    const toggleX = px + 14;
    const toggleY = py + 38;
    const toggleW = 120;
    const toggleH = 24;

    const btnG = this.add.graphics();
    const btnLabel = this.add.text(toggleX + toggleW / 2, toggleY + toggleH / 2, '', {
      fontSize: '12px', color: NEON_STR.cyan, fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);

    const drawToggle = () => {
      btnG.clear();
      if (GAME_SETTINGS.soundEnabled) {
        NeonUI.drawButton(btnG, toggleX, toggleY, toggleW, toggleH, NEON.green, false);
        btnLabel.setText('SOUND: ON');
        btnLabel.setColor(NEON_STR.green);
      } else {
        NeonUI.drawButton(btnG, toggleX, toggleY, toggleW, toggleH, NEON.red, false);
        btnLabel.setText('SOUND: OFF');
        btnLabel.setColor(NEON_STR.red);
      }
    };
    drawToggle();

    const zone = this.add.zone(toggleX + toggleW / 2, toggleY + toggleH / 2, toggleW, toggleH)
      .setInteractive({ cursor: 'pointer' });
    zone.on('pointerdown', () => {
      GAME_SETTINGS.soundEnabled = !GAME_SETTINGS.soundEnabled;
      saveSettings();
      drawToggle();
    });
    zone.on('pointerover', () => {
      btnG.clear();
      const col = GAME_SETTINGS.soundEnabled ? NEON.green : NEON.red;
      NeonUI.drawButton(btnG, toggleX, toggleY, toggleW, toggleH, col, true);
    });
    zone.on('pointerout', () => drawToggle());
  }

  private buildSpeedSection(cx: number, panelW: number, py: number): void {
    const px = cx - panelW / 2;
    const g = this.add.graphics();
    NeonUI.drawPanel(g, px, py, panelW, 70, NEON.orange);

    this.add.text(px + 14, py + 10, 'GAMEPLAY', NeonUI.neonTextStyle(NEON_STR.orange, 13, true));

    const lineG = this.add.graphics();
    NeonUI.drawDivider(lineG, px + 14, py + 28, px + 100, py + 28, NEON.orange);

    const speeds = [
      { label: '0.5x', value: 0.5 },
      { label: '1x', value: 1 },
      { label: '2x', value: 2 },
    ];

    const btnW = 60;
    const btnH = 24;
    const btnGap = 8;
    const startX = px + 14;
    const btnY = py + 38;

    const speedBtnGs: Phaser.GameObjects.Graphics[] = [];
    const speedLabels: Phaser.GameObjects.Text[] = [];

    const drawSpeedButtons = () => {
      speeds.forEach((s, i) => {
        const bx = startX + i * (btnW + btnGap);
        const isActive = GAME_SETTINGS.gameSpeed === s.value;
        speedBtnGs[i].clear();
        NeonUI.drawButton(speedBtnGs[i], bx, btnY, btnW, btnH,
          isActive ? NEON.yellow : NEON.orange, isActive);
        speedLabels[i].setColor(isActive ? NEON_STR.yellow : '#667788');
      });
    };

    speeds.forEach((s, i) => {
      const bx = startX + i * (btnW + btnGap);
      speedBtnGs[i] = this.add.graphics();
      speedLabels[i] = this.add.text(bx + btnW / 2, btnY + btnH / 2, s.label, {
        fontSize: '12px', color: '#667788', fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5);

      const zone = this.add.zone(bx + btnW / 2, btnY + btnH / 2, btnW, btnH)
        .setInteractive({ cursor: 'pointer' });
      zone.on('pointerdown', () => {
        GAME_SETTINGS.gameSpeed = s.value;
        saveSettings();
        drawSpeedButtons();
      });
    });

    drawSpeedButtons();

    // Note about Date.now() cooldowns
    this.add.text(startX + speeds.length * (btnW + btnGap) + 10, btnY + 4, 'Note: ability cooldowns use real time', {
      fontSize: '9px', color: '#445566', fontFamily: 'monospace',
    });
  }

  private buildEdgeScrollSection(cx: number, panelW: number, py: number): void {
    const px = cx - panelW / 2;
    const g = this.add.graphics();
    NeonUI.drawPanel(g, px, py, panelW, 70, NEON.magenta);

    this.add.text(px + 14, py + 10, 'EDGE SCROLLING', NeonUI.neonTextStyle(NEON_STR.magenta, 13, true));

    const lineG = this.add.graphics();
    NeonUI.drawDivider(lineG, px + 14, py + 28, px + 150, py + 28, NEON.magenta);

    const btnY = py + 38;
    const btnH = 24;

    // Toggle button
    const toggleW = 100;
    const toggleX = px + 14;
    const toggleBtnG = this.add.graphics();
    const toggleLabel = this.add.text(toggleX + toggleW / 2, btnY + btnH / 2, '', {
      fontSize: '11px', color: NEON_STR.magenta, fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);

    const drawToggle = () => {
      toggleBtnG.clear();
      if (GAME_SETTINGS.edgeScrollEnabled) {
        NeonUI.drawButton(toggleBtnG, toggleX, btnY, toggleW, btnH, NEON.green, false);
        toggleLabel.setText('ON').setColor(NEON_STR.green);
      } else {
        NeonUI.drawButton(toggleBtnG, toggleX, btnY, toggleW, btnH, NEON.red, false);
        toggleLabel.setText('OFF').setColor(NEON_STR.red);
      }
    };
    drawToggle();

    const toggleZone = this.add.zone(toggleX + toggleW / 2, btnY + btnH / 2, toggleW, btnH)
      .setInteractive({ cursor: 'pointer' });
    toggleZone.on('pointerdown', () => {
      GAME_SETTINGS.edgeScrollEnabled = !GAME_SETTINGS.edgeScrollEnabled;
      saveSettings();
      drawToggle();
    });

    // Speed buttons
    const speeds = [
      { label: '150', value: 150 },
      { label: '300', value: 300 },
      { label: '600', value: 600 },
    ];
    const speedBtnW = 46;
    const speedGap = 6;
    const speedStartX = toggleX + toggleW + 14;

    this.add.text(speedStartX, btnY - 1, 'Speed:', {
      fontSize: '10px', color: '#667788', fontFamily: 'monospace',
    }).setOrigin(0, 0.5).setY(btnY + btnH / 2);

    const speedLabelX = speedStartX + 42;
    const speedBtnGs: Phaser.GameObjects.Graphics[] = [];
    const speedBtnLabels: Phaser.GameObjects.Text[] = [];

    const drawSpeedBtns = () => {
      speeds.forEach((s, i) => {
        const bx = speedLabelX + i * (speedBtnW + speedGap);
        const isActive = GAME_SETTINGS.edgeScrollSpeed === s.value;
        speedBtnGs[i].clear();
        NeonUI.drawButton(speedBtnGs[i], bx, btnY, speedBtnW, btnH, NEON.magenta, isActive);
        speedBtnLabels[i].setColor(isActive ? NEON_STR.magenta : '#556677');
      });
    };

    speeds.forEach((s, i) => {
      const bx = speedLabelX + i * (speedBtnW + speedGap);
      speedBtnGs[i] = this.add.graphics();
      speedBtnLabels[i] = this.add.text(bx + speedBtnW / 2, btnY + btnH / 2, s.label, {
        fontSize: '10px', color: '#556677', fontFamily: 'monospace',
      }).setOrigin(0.5);
      const z = this.add.zone(bx + speedBtnW / 2, btnY + btnH / 2, speedBtnW, btnH)
        .setInteractive({ cursor: 'pointer' });
      z.on('pointerdown', () => {
        GAME_SETTINGS.edgeScrollSpeed = s.value;
        saveSettings();
        drawSpeedBtns();
      });
    });
    drawSpeedBtns();

    // Zone % buttons
    const pcts = [
      { label: '3%', value: 3 },
      { label: '5%', value: 5 },
      { label: '10%', value: 10 },
    ];
    const pctBtnW = 36;
    const pctStartX = speedLabelX + speeds.length * (speedBtnW + speedGap) + 14;

    this.add.text(pctStartX, btnY + btnH / 2, 'Zone:', {
      fontSize: '10px', color: '#667788', fontFamily: 'monospace',
    }).setOrigin(0, 0.5);

    const pctLabelX = pctStartX + 38;
    const pctBtnGs: Phaser.GameObjects.Graphics[] = [];
    const pctBtnLabels: Phaser.GameObjects.Text[] = [];

    const drawPctBtns = () => {
      pcts.forEach((p, i) => {
        const bx = pctLabelX + i * (pctBtnW + speedGap);
        const isActive = GAME_SETTINGS.edgeScrollPercent === p.value;
        pctBtnGs[i].clear();
        NeonUI.drawButton(pctBtnGs[i], bx, btnY, pctBtnW, btnH, NEON.cyan, isActive);
        pctBtnLabels[i].setColor(isActive ? NEON_STR.cyan : '#556677');
      });
    };

    pcts.forEach((p, i) => {
      const bx = pctLabelX + i * (pctBtnW + speedGap);
      pctBtnGs[i] = this.add.graphics();
      pctBtnLabels[i] = this.add.text(bx + pctBtnW / 2, btnY + btnH / 2, p.label, {
        fontSize: '10px', color: '#556677', fontFamily: 'monospace',
      }).setOrigin(0.5);
      const z = this.add.zone(bx + pctBtnW / 2, btnY + btnH / 2, pctBtnW, btnH)
        .setInteractive({ cursor: 'pointer' });
      z.on('pointerdown', () => {
        GAME_SETTINGS.edgeScrollPercent = p.value;
        saveSettings();
        drawPctBtns();
      });
    });
    drawPctBtns();
  }

  private buildControlsSection(cx: number, panelW: number, py: number): void {
    const px = cx - panelW / 2;
    const g = this.add.graphics();
    NeonUI.drawPanel(g, px, py, panelW, 120, NEON.blue);

    this.add.text(px + 14, py + 10, 'CONTROLS', NeonUI.neonTextStyle(NEON_STR.blue, 13, true));

    const lineG = this.add.graphics();
    NeonUI.drawDivider(lineG, px + 14, py + 28, px + 100, py + 28, NEON.blue);

    const controls = [
      'Click gear     Pick up / place',
      'R              Toggle remove mode',
      'ESC            Cancel action',
      'Scroll         Zoom in/out',
      'Middle-click   Pan camera',
      'Tab bar        Switch panels',
    ];

    controls.forEach((line, i) => {
      this.add.text(px + 14, py + 36 + i * 13, line, {
        fontSize: '10px', color: '#88aacc', fontFamily: 'monospace',
      });
    });
  }

  private createBackButton(): void {
    const btnW = 100;
    const btnH = 36;
    const container = this.add.container(16, 16);
    const g = this.add.graphics();
    NeonUI.drawButton(g, 0, 0, btnW, btnH, NEON.cyan, false);
    container.add(g);

    const label = this.add.text(btnW / 2, btnH / 2, '< BACK', {
      fontSize: '12px', color: NEON_STR.cyan, fontFamily: 'monospace',
    }).setOrigin(0.5);
    container.add(label);

    container.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, btnW, btnH),
      Phaser.Geom.Rectangle.Contains,
    );
    container.on('pointerover', () => {
      g.clear();
      NeonUI.drawButton(g, 0, 0, btnW, btnH, NEON.cyan, true);
    });
    container.on('pointerout', () => {
      g.clear();
      NeonUI.drawButton(g, 0, 0, btnW, btnH, NEON.cyan, false);
    });
    container.on('pointerdown', () => {
      this.scene.start('MenuScene');
    });
  }
}
