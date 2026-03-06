/**
 * Generic spatial hash grid for fast radius queries.
 *
 * Divides the world into fixed-size cells. Items are bucketed by cell.
 * Radius queries return items from all overlapping cells (may include
 * items outside the exact radius — callers should do precise distance checks).
 *
 * Usage:
 *   const grid = new SpatialGrid<GearState>(200);
 *   grid.insert(gear.id, gear.x, gear.y, gear);
 *   const nearby = grid.query(unit.x, unit.y, contactRadius);
 */
export class SpatialGrid<T> {
  private cellSize: number;
  private cells: Map<string, Map<string, T>> = new Map();

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  private cellKey(cx: number, cy: number): string {
    return `${cx},${cy}`;
  }

  private toCell(coord: number): number {
    return Math.floor(coord / this.cellSize);
  }

  insert(id: string, x: number, y: number, item: T): void {
    const key = this.cellKey(this.toCell(x), this.toCell(y));
    let cell = this.cells.get(key);
    if (!cell) {
      cell = new Map();
      this.cells.set(key, cell);
    }
    cell.set(id, item);
  }

  remove(id: string, x: number, y: number): void {
    const key = this.cellKey(this.toCell(x), this.toCell(y));
    this.cells.get(key)?.delete(id);
  }

  /**
   * Query all items whose cell overlaps the given circle (cx±radius, cy±radius).
   * Returns items from all candidate cells — callers do exact distance filtering.
   */
  query(x: number, y: number, radius: number): T[] {
    const minCX = this.toCell(x - radius);
    const maxCX = this.toCell(x + radius);
    const minCY = this.toCell(y - radius);
    const maxCY = this.toCell(y + radius);

    const result: T[] = [];
    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        const cell = this.cells.get(this.cellKey(cx, cy));
        if (cell) {
          for (const item of cell.values()) {
            result.push(item);
          }
        }
      }
    }
    return result;
  }

  clear(): void {
    this.cells.clear();
  }
}
