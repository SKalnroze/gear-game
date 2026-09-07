/**
 * Shared drawing helpers for the tech tree gear/edge visuals — used by both
 * the in-game RadialTechSection (static layout, read-only) and the Tech
 * Layout Editor (same visuals, but draggable). Kept framework-thin (only
 * Phaser.GameObjects.Graphics, no scene/state) so both can call it the same
 * way.
 */
import Phaser from 'phaser';

export interface Point { x: number; y: number }

export function gearPathPoints(r: number, teethCount: number): Point[] {
  const pts: Point[] = [];
  const innerR = r * 0.8;
  const step = (Math.PI * 2) / (teethCount * 2);
  for (let i = 0; i < teethCount * 2; i++) {
    const a = i * step;
    const rad = i % 2 === 0 ? r : innerR;
    pts.push({ x: Math.cos(a) * rad, y: Math.sin(a) * rad });
  }
  return pts;
}

export function drawGear(g: Phaser.GameObjects.Graphics, radius: number, teeth: number, fillColor: number, fillAlpha: number): void {
  g.clear();
  const pts = gearPathPoints(radius, teeth);
  g.fillStyle(fillColor, fillAlpha);
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.closePath();
  g.fillPath();

  g.fillStyle(0x000000, 0.3);
  g.fillCircle(0, 0, radius * 0.32);
  g.lineStyle(1, 0x000000, 0.3);
  g.strokeCircle(0, 0, radius * 0.32);
}

export function drawRing(
  g: Phaser.GameObjects.Graphics, radius: number, color: number, alpha: number,
  width: number, dashed: boolean,
): void {
  g.clear();
  if (!dashed) {
    g.lineStyle(width, color, alpha);
    g.strokeCircle(0, 0, radius);
    return;
  }
  const segments = 24;
  g.lineStyle(width, color, alpha);
  for (let i = 0; i < segments; i++) {
    if (i % 2 === 1) continue;
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 0.7) / segments) * Math.PI * 2;
    g.beginPath();
    g.arc(0, 0, radius, a0, a1, false);
    g.strokePath();
  }
}

export function drawPolyline(g: Phaser.GameObjects.Graphics, points: Point[]): void {
  g.beginPath();
  g.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
  g.strokePath();
}

/** Point at fraction `t` (0..1) along the total length of a polyline. */
export function pointAlongPolyline(points: Point[], t: number): Point {
  const segLens: number[] = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const d = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    segLens.push(d);
    total += d;
  }
  let target = t * total;
  for (let i = 0; i < segLens.length; i++) {
    if (target <= segLens[i] || i === segLens.length - 1) {
      const segT = segLens[i] > 0 ? target / segLens[i] : 0;
      const a = points[i], b = points[i + 1];
      return { x: a.x + (b.x - a.x) * segT, y: a.y + (b.y - a.y) * segT };
    }
    target -= segLens[i];
  }
  return points[points.length - 1];
}

export function darkenColor(color: number, factor: number): number {
  const c = Phaser.Display.Color.IntegerToColor(color);
  return Phaser.Display.Color.GetColor(c.red * factor, c.green * factor, c.blue * factor);
}

export function colorToHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Deterministic 0..1 pseudo-hash of a string, used to phase the traveling
 * "electricity" pip per-edge without a shared RNG. */
export function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return (h % 1000) / 1000;
}

/** Canvas text (what Phaser Text objects use) doesn't always fall back to a
 * color-emoji font the way regular DOM text reliably does — a generic
 * 'monospace' family can leave some glyphs as tofu/boxes depending on the
 * platform's font config. Naming the system emoji fonts explicitly, ahead of
 * monospace, is what actually gets every icon to render. */
export const EMOJI_FONT_STACK = '"Segoe UI Emoji", "Noto Color Emoji", "Apple Color Emoji", monospace';
