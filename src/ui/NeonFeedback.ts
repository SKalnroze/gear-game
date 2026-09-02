import Phaser from 'phaser';
import { NeonUI } from './NeonUI';
import { NEON, NEON_STR } from '../constants/ui.constants';

const colorToStr = NeonUI.colorToStr;

// ── Interfaces ────────────────────────────────────────────────────────────

interface ModalHandle {
  destroy(): void;
}

interface ProgressBarHandle {
  destroy(): void;
  setValue(v: number): void;
  getValue(): number;
}

interface SpinnerHandle {
  destroy(): void;
}

interface BadgeHandle {
  destroy(): void;
  setText(t: string): void;
}

interface AlertHandle {
  destroy(): void;
}

interface StatusMsgHandle {
  destroy(): void;
  setText(msg: string): void;
  setColor(c: string): void;
}

// ── neonModal ─────────────────────────────────────────────────────────────

/**
 * Full-screen modal dialog with backdrop, title, body text, and action buttons.
 * Backdrop blocks all input behind it. Click backdrop to close.
 */
export function neonModal(
  scene: Phaser.Scene,
  w: number,
  h: number,
  title: string,
  bodyText: string,
  buttons: { label: string; color: number; onClick: () => void }[],
  color: number,
): ModalHandle {
  const cam = scene.cameras.main;
  const cx = cam.width / 2;
  const cy = cam.height / 2;
  const px = cx - w / 2;
  const py = cy - h / 2;

  const objs: Phaser.GameObjects.GameObject[] = [];

  // Backdrop - full-screen semi-transparent dark overlay
  // setScrollFactor(0) keeps modal in screen space even when camera is scrolled.
  const backdropG = scene.add.graphics().setDepth(900).setScrollFactor(0);
  backdropG.fillStyle(0x000000, 0.7);
  backdropG.fillRect(0, 0, cam.width, cam.height);
  objs.push(backdropG);

  const backdropZone = scene.add.zone(cam.width / 2, cam.height / 2, cam.width, cam.height)
    .setInteractive()
    .setDepth(900)
    .setScrollFactor(0);
  backdropZone.on('pointerdown', () => handle.destroy());
  objs.push(backdropZone);

  // Panel
  const panelG = scene.add.graphics().setDepth(901).setScrollFactor(0);
  NeonUI.drawPanel(panelG, px, py, w, h, color);
  objs.push(panelG);

  // Block clicks through panel
  const panelZone = scene.add.zone(cx, cy, w, h)
    .setInteractive()
    .setDepth(901)
    .setScrollFactor(0);
  panelZone.on('pointerdown', (_p: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
    event.stopPropagation();
  });
  objs.push(panelZone);

  // Title
  const titleText = scene.add.text(
    px + 14, py + 12, title,
    NeonUI.neonTextStyle(colorToStr(color), 14, true),
  ).setDepth(902).setScrollFactor(0);
  objs.push(titleText);

  // Divider below title
  const divG = scene.add.graphics().setDepth(902).setScrollFactor(0);
  NeonUI.drawDivider(divG, px + 8, py + 36, px + w - 8, py + 36, color);
  objs.push(divG);

  // Body text
  const bodyTxt = scene.add.text(
    px + 14, py + 46, bodyText,
    {
      ...NeonUI.neonTextStyle(colorToStr(color), 12),
      wordWrap: { width: w - 28 },
    },
  ).setDepth(902).setScrollFactor(0);
  objs.push(bodyTxt);

  // Button row at bottom
  const btnH = 32;
  const btnPad = 10;
  const totalBtnW = buttons.reduce((sum, btn, i) => {
    const bw = Math.max(80, btn.label.length * 9 + 24);
    return sum + bw + (i > 0 ? btnPad : 0);
  }, 0);
  let btnX = cx - totalBtnW / 2;
  const btnY = py + h - btnH - 14;

  buttons.forEach((btn) => {
    const bw = Math.max(80, btn.label.length * 9 + 24);
    const bx = btnX;

    const btnG = scene.add.graphics().setDepth(902).setScrollFactor(0);

    const drawBtn = (hovered: boolean) => {
      btnG.clear();
      NeonUI.drawButton(btnG, bx, btnY, bw, btnH, btn.color, hovered);
    };
    drawBtn(false);
    objs.push(btnG);

    const btnTxt = scene.add.text(
      bx + bw / 2, btnY + btnH / 2, btn.label,
      NeonUI.neonTextStyle(colorToStr(btn.color), 11, true),
    ).setOrigin(0.5).setDepth(903).setScrollFactor(0);
    objs.push(btnTxt);

    const btnZone = scene.add.zone(bx + bw / 2, btnY + btnH / 2, bw, btnH)
      .setInteractive({ useHandCursor: true })
      .setDepth(903)
      .setScrollFactor(0);
    btnZone.on('pointerover', () => drawBtn(true));
    btnZone.on('pointerout', () => drawBtn(false));
    btnZone.on('pointerdown', () => btn.onClick());
    objs.push(btnZone);

    btnX += bw + btnPad;
  });

  const handle: ModalHandle = {
    destroy(): void {
      for (const obj of objs) obj.destroy();
    },
  };

  scene.events.once('shutdown', () => handle.destroy());
  return handle;
}

// ── neonToast ─────────────────────────────────────────────────────────────

/**
 * Auto-destroying notification that slides in from the top-right corner.
 * Appears, holds for `duration` ms, then slides out and self-destructs.
 */
export function neonToast(
  scene: Phaser.Scene,
  message: string,
  color: number,
  colorStr: string,
  duration: number = 2000,
): void {
  const cam = scene.cameras.main;
  const padX = 12;
  const padY = 8;

  // Measure text to auto-size panel
  const tmpTxt = scene.add.text(0, 0, message, {
    fontSize: '12px', fontFamily: 'monospace',
  });
  const textW = tmpTxt.width;
  const textH = tmpTxt.height;
  tmpTxt.destroy();

  const panelW = textW + padX * 2;
  const panelH = textH + padY * 2;
  const startX = cam.width + 10;
  const targetX = cam.width - panelW - 16;
  const yPos = 16;

  // Container-like offset tracking via a simple x holder
  let curX = startX;

  const g = scene.add.graphics().setDepth(800);
  const txt = scene.add.text(startX + padX, yPos + padY, message, NeonUI.neonTextStyle(colorStr, 12))
    .setDepth(801);

  function drawPanel(x: number): void {
    g.clear();
    NeonUI.drawPanel(g, x, yPos, panelW, panelH, color, 0.95);
    txt.setX(x + padX);
  }

  drawPanel(startX);

  // Slide in
  scene.tweens.add({
    targets: { x: startX },
    x: targetX,
    duration: 300,
    ease: 'Power2',
    onUpdate: (_tw: Phaser.Tweens.Tween, target: { x: number }) => {
      curX = target.x;
      drawPanel(curX);
    },
    onComplete: () => {
      // Hold, then slide out
      scene.time.delayedCall(duration, () => {
        scene.tweens.add({
          targets: { x: targetX },
          x: cam.width + 10,
          duration: 300,
          ease: 'Power2',
          onUpdate: (_tw: Phaser.Tweens.Tween, target: { x: number }) => {
            curX = target.x;
            drawPanel(curX);
          },
          onComplete: () => {
            g.destroy();
            txt.destroy();
          },
        });
      });
    },
  });
}

// ── neonProgressBar ───────────────────────────────────────────────────────

/**
 * Horizontal progress bar with neon-styled track, fill, and percentage text.
 * value ranges from 0 to maxValue.
 */
export function neonProgressBar(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  value: number,
  maxValue: number,
  color: number,
): ProgressBarHandle {
  let curValue = Phaser.Math.Clamp(value, 0, maxValue);
  let curMax = maxValue;

  const g = scene.add.graphics();
  const pctTxt = scene.add.text(x + w / 2, y + h / 2, '', NeonUI.neonTextStyle(colorToStr(color), 10))
    .setOrigin(0.5);

  function redraw(): void {
    g.clear();
    const ratio = curMax > 0 ? curValue / curMax : 0;

    // Outer glow
    g.fillStyle(color, 0.04);
    g.fillRect(x - 3, y - 3, w + 6, h + 6);

    // Dark track
    g.fillStyle(0x0a0f1a, 0.95);
    g.fillRect(x, y, w, h);

    // Fill
    if (ratio > 0) {
      g.fillStyle(color, 0.55);
      g.fillRect(x + 1, y + 1, (w - 2) * ratio, h - 2);
      g.fillStyle(color, 0.15);
      g.fillRect(x + 1, y + 1, (w - 2) * ratio, (h - 2) / 2);
    }

    // Border
    g.lineStyle(1.5, color, 0.7);
    g.strokeRect(x, y, w, h);

    // Percentage text
    pctTxt.setText(`${Math.round(ratio * 100)}%`);
  }

  redraw();

  return {
    destroy(): void {
      g.destroy();
      pctTxt.destroy();
    },
    setValue(v: number): void {
      curValue = Phaser.Math.Clamp(v, 0, curMax);
      redraw();
    },
    getValue(): number {
      return curValue;
    },
  };
}

// ── neonSpinner ───────────────────────────────────────────────────────────

/**
 * Rotating partial circle (270-degree arc) animation.
 * Uses a scene tween for continuous rotation. Cleans up tween on destroy.
 */
export function neonSpinner(
  scene: Phaser.Scene,
  x: number,
  y: number,
  size: number,
  color: number,
): SpinnerHandle {
  const g = scene.add.graphics();
  const radius = size / 2;
  const angleObj = { angle: 0 };

  function drawArc(startAngle: number): void {
    g.clear();
    // Glow
    g.lineStyle(3, color, 0.12);
    g.beginPath();
    g.arc(x + radius, y + radius, radius, startAngle, startAngle + Math.PI * 1.5, false);
    g.strokePath();

    // Main arc
    g.lineStyle(2, color, 0.85);
    g.beginPath();
    g.arc(x + radius, y + radius, radius, startAngle, startAngle + Math.PI * 1.5, false);
    g.strokePath();

    // Bright leading edge
    const endAngle = startAngle + Math.PI * 1.5;
    const edgeX = x + radius + Math.cos(endAngle) * radius;
    const edgeY = y + radius + Math.sin(endAngle) * radius;
    g.fillStyle(color, 1);
    g.fillCircle(edgeX, edgeY, 2);
  }

  drawArc(0);

  const tween = scene.tweens.add({
    targets: angleObj,
    angle: Math.PI * 2,
    duration: 1000,
    repeat: -1,
    ease: 'Linear',
    onUpdate: () => {
      drawArc(angleObj.angle);
    },
    onRepeat: () => {
      angleObj.angle = 0;
    },
  });

  return {
    destroy(): void {
      tween.destroy();
      g.destroy();
    },
  };
}

// ── neonBadge ─────────────────────────────────────────────────────────────

/**
 * Small rounded-rect badge with neon border and low-alpha fill.
 * Auto-sized to text content plus padding.
 */
export function neonBadge(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  color: number,
): BadgeHandle {
  const padX = 8;
  const padY = 4;

  const txt = scene.add.text(0, 0, text, NeonUI.neonTextStyle(colorToStr(color), 10));
  const g = scene.add.graphics();

  function redraw(): void {
    const tw = txt.width;
    const th = txt.height;
    const bw = tw + padX * 2;
    const bh = th + padY * 2;

    g.clear();
    // Low-alpha fill
    g.fillStyle(color, 0.12);
    g.fillRoundedRect(x, y, bw, bh, 4);
    // Neon border
    g.lineStyle(1, color, 0.7);
    g.strokeRoundedRect(x, y, bw, bh, 4);

    txt.setPosition(x + padX, y + padY);
  }

  redraw();

  return {
    destroy(): void {
      g.destroy();
      txt.destroy();
    },
    setText(t: string): void {
      txt.setText(t);
      redraw();
    },
  };
}

// ── neonAlert ─────────────────────────────────────────────────────────────

type AlertType = 'info' | 'warning' | 'error' | 'success';

const ALERT_CONFIG: Record<AlertType, { color: number; colorStr: string; icon: string }> = {
  info:    { color: NEON.cyan,   colorStr: NEON_STR.cyan,   icon: '\u2139' },
  warning: { color: NEON.orange, colorStr: NEON_STR.orange, icon: '\u26A0' },
  error:   { color: NEON.red,    colorStr: NEON_STR.red,    icon: '\u2717' },
  success: { color: NEON.green,  colorStr: NEON_STR.green,  icon: '\u2713' },
};

/**
 * Alert panel with type-specific color and icon prefix.
 * Height auto-calculated from word-wrapped message text.
 */
export function neonAlert(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  message: string,
  type: AlertType,
): AlertHandle {
  const cfg = ALERT_CONFIG[type];
  const iconW = 24;
  const padX = 10;
  const padY = 10;
  const textW = w - padX * 2 - iconW;

  // Icon
  const iconTxt = scene.add.text(
    x + padX, y + padY, cfg.icon,
    NeonUI.neonTextStyle(cfg.colorStr, 14, true),
  );

  // Message text (word-wrapped)
  const msgTxt = scene.add.text(
    x + padX + iconW, y + padY, message,
    {
      ...NeonUI.neonTextStyle(cfg.colorStr, 12),
      wordWrap: { width: textW },
    },
  );

  // Calculate height from text
  const textH = Math.max(msgTxt.height, iconTxt.height);
  const h = textH + padY * 2;

  // Draw panel behind text
  const g = scene.add.graphics();
  NeonUI.drawPanel(g, x, y, w, h, cfg.color, 0.9);

  // Ensure text is above panel
  g.setDepth(0);
  iconTxt.setDepth(1);
  msgTxt.setDepth(1);

  return {
    destroy(): void {
      g.destroy();
      iconTxt.destroy();
      msgTxt.destroy();
    },
  };
}

// ── neonStatusMsg ─────────────────────────────────────────────────────────

/**
 * Simple styled status text with monospace font.
 * Supports dynamic text and color updates.
 */
export function neonStatusMsg(
  scene: Phaser.Scene,
  x: number,
  y: number,
  message: string,
  colorStr: string,
): StatusMsgHandle {
  const txt = scene.add.text(x, y, message, NeonUI.neonTextStyle(colorStr, 11));

  return {
    destroy(): void {
      txt.destroy();
    },
    setText(msg: string): void {
      txt.setText(msg);
    },
    setColor(c: string): void {
      txt.setColor(c);
      txt.setShadowColor(c);
    },
  };
}

