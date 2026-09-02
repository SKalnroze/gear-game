import Phaser from 'phaser';
import { NeonUI } from './NeonUI';
import { neonBtn } from './NeonRex';
import { VStack, HStack } from './NeonStack';
import { LAYOUT } from '../constants/ui.constants';

// Type aliases for the reg/h callback signatures
type RegFn = <T extends Phaser.GameObjects.GameObject>(obj: T) => T;
type HandleFn = <T extends { destroy(): void }>(handle: T) => T;

const colorToStr = NeonUI.colorToStr;
const LBL_COLOR = '#889aaa';

/**
 * Creates a titled panel whose height is determined by its content.
 * The content builder receives an inner VStack starting below the title row.
 * Returns the total panel height consumed.
 *
 * @param x      Left X of the panel
 * @param y      Top Y of the panel
 * @param w      Panel width
 * @param title  Section title text
 * @param color  Neon color (numeric)
 * @param build  Receives (innerStack, innerX, innerW) — place components using stack.push()
 *
 * Example:
 *   const sectionH = neonSection(scene, reg, h, px, y, panelW, 'AUDIO', NEON.cyan,
 *     (inner, ix, iw) => {
 *       h(neonCheckbox(scene, ix, inner.push(LAYOUT.CHECKBOX_H), 18, 'Sound', true, NEON.cyan, cb));
 *     });
 *   y += sectionH + LAYOUT.GAP_LG;
 */
export function neonSection(
  scene: Phaser.Scene,
  reg: RegFn,
  h: HandleFn,
  x: number,
  y: number,
  w: number,
  title: string,
  color: number,
  build: (innerStack: VStack, innerX: number, innerW: number) => void,
): number {
  const innerX = x + LAYOUT.PAD;
  const innerW = w - LAYOUT.PAD * 2;
  const inner  = new VStack(y + LAYOUT.SECTION_TITLE_H + LAYOUT.PAD_SM, LAYOUT.GAP_SM);

  // Create background objects BEFORE content so they sit below it in draw order
  const g  = reg(scene.add.graphics());
  reg(scene.add.text(innerX, y + LAYOUT.PAD_SM,
    title, NeonUI.neonTextStyle(colorToStr(color), LAYOUT.FONT_SECTION, true)));
  const dg = reg(scene.add.graphics());

  // Run content builder — content objects are added after bg, so they render on top
  build(inner, innerX, innerW);

  const panelH     = inner.currentY - y + LAYOUT.SECTION_PAD_BOT;
  const dividerEnd = innerX + Math.min(title.length * 8 + 20, 140);

  NeonUI.drawPanel(g, x, y, w, panelH, color);
  NeonUI.drawDivider(dg, innerX, y + LAYOUT.SECTION_TITLE_H - 4,
    dividerEnd, y + LAYOUT.SECTION_TITLE_H - 4, color);

  return panelH;
}

/**
 * Add a label text line and advance the stack.
 *
 * Example:
 *   neonLabelRow(scene, reg, ix, stack, 'Choose difficulty');
 */
export function neonLabelRow(
  scene: Phaser.Scene,
  reg: RegFn,
  x: number,
  stack: VStack,
  text: string,
  color = LBL_COLOR,
): void {
  const y = stack.push(LAYOUT.LABEL_H, LAYOUT.GAP_XS);
  reg(scene.add.text(x, y, text,
    { fontSize: `${LAYOUT.FONT_LABEL}px`, color, fontFamily: 'monospace', fontStyle: 'bold' }));
}

/**
 * Places a label on the left and one interactive control on the right, inline.
 * The control builder receives (controlX, controlY, controlW).
 *
 * Example:
 *   neonFormRow(scene, reg, h, ix, iw, inner, 'Game speed', NEON.orange, (cx, cy, cw) =>
 *     h(neonSlider(scene, cx, cy + 4, cw, 0.5, 2.0, 1.0, NEON.orange, NEON_STR.orange, cb)));
 */
export function neonFormRow(
  scene: Phaser.Scene,
  reg: RegFn,
  _h: HandleFn,
  x: number,
  w: number,
  stack: VStack,
  label: string,
  color: number,
  buildControl: (controlX: number, controlY: number, controlW: number) => void,
  rowH = LAYOUT.BTN_H,
): void {
  const y       = stack.push(rowH);
  const labelW  = Math.min(120, Math.floor(w * 0.35));
  const controlX = x + labelW + LAYOUT.GAP_SM;
  const controlW = w - labelW - LAYOUT.GAP_SM;

  reg(scene.add.text(x, y + rowH / 2, label,
    NeonUI.neonTextStyle(colorToStr(color), LAYOUT.FONT_LABEL))
    .setOrigin(0, 0.5));

  buildControl(controlX, y, controlW);
}

/**
 * Renders a row of equal-width buttons from a data array.
 * Advances the stack by btnH + default gap.
 * Returns the HStack for further layout inspection.
 *
 * Example:
 *   neonButtonRow(scene, h, ix, iw, inner, NEON.orange, NEON_STR.orange,
 *     [{ key: '0.5x', label: '0.5x' }, { key: '1x', label: '1x' }],
 *     activeKey, (key) => setSpeed(key));
 */
export function neonButtonRow(
  scene: Phaser.Scene,
  h: HandleFn,
  x: number,
  w: number,
  stack: VStack,
  color: number,
  colorStr: string,
  buttons: { key: string; label: string }[],
  _activeKey: string,
  onClick: (key: string) => void,
  btnH = LAYOUT.BTN_H,
): HStack {
  const y    = stack.push(btnH);
  const btnW = Math.floor((w - (buttons.length - 1) * LAYOUT.GAP_SM) / buttons.length);
  const row  = new HStack(x, LAYOUT.GAP_SM);
  buttons.forEach(btn => {
    const bx = row.push(btnW);
    h(neonBtn(scene, bx, y, btnW, btnH, color, colorStr, btn.label, LAYOUT.FONT_LABEL,
      () => onClick(btn.key)));
  });
  return row;
}

// Re-export stack types for convenience
export { VStack, HStack };
