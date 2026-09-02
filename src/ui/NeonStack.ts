import { LAYOUT } from '../constants/ui.constants';

/**
 * VStack — vertical layout cursor.
 *
 * Usage:
 *   const stack = new VStack(startY, LAYOUT.GAP);
 *   const btnY   = stack.push(LAYOUT.BTN_H);   // returns top Y
 *   const inputY = stack.push(LAYOUT.INPUT_H);
 *   const total  = stack.totalHeight;
 */
export class VStack {
  private y: number;
  readonly startY: number;
  readonly defaultGap: number;

  constructor(startY: number, defaultGap: number = LAYOUT.GAP) {
    this.y = startY;
    this.startY = startY;
    this.defaultGap = defaultGap;
  }

  /** Reserve `height` pixels; returns top-Y of the reserved slot; advances cursor by height + gap. */
  push(height: number, gapAfter?: number): number {
    const top = this.y;
    this.y += height + (gapAfter ?? this.defaultGap);
    return top;
  }

  /** Add extra vertical space (spacer). */
  addGap(extra: number): this { this.y += extra; return this; }

  /** Current Y (top of next item). */
  get currentY(): number { return this.y; }

  /** Total height consumed from startY including last gap. */
  get totalHeight(): number { return this.y - this.startY; }

  /** Peek current Y without advancing. */
  peek(): number { return this.y; }
}

/**
 * HStack — horizontal layout cursor.
 *
 * Usage:
 *   const row = new HStack(startX, LAYOUT.GAP_SM);
 *   const x1  = row.push(60);
 *   const x2  = row.push(100);
 */
export class HStack {
  private x: number;
  readonly startX: number;
  readonly defaultGap: number;

  constructor(startX: number, defaultGap: number = LAYOUT.GAP_SM) {
    this.x = startX;
    this.startX = startX;
    this.defaultGap = defaultGap;
  }

  push(width: number, gapAfter?: number): number {
    const left = this.x;
    this.x += width + (gapAfter ?? this.defaultGap);
    return left;
  }

  addGap(extra: number): this { this.x += extra; return this; }
  get currentX(): number { return this.x; }
  get totalWidth(): number { return this.x - this.startX; }
}
