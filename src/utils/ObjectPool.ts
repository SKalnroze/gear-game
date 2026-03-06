/**
 * Generic object pool for performance-critical sprite reuse.
 */
export class ObjectPool<T> {
  private available: T[] = [];
  private factory: () => T;
  private reset: (obj: T) => void;

  constructor(factory: () => T, reset: (obj: T) => void, initialSize = 10) {
    this.factory = factory;
    this.reset = reset;
    for (let i = 0; i < initialSize; i++) {
      this.available.push(factory());
    }
  }

  get(): T {
    if (this.available.length > 0) {
      return this.available.pop()!;
    }
    return this.factory();
  }

  release(obj: T): void {
    this.reset(obj);
    this.available.push(obj);
  }

  get size(): number {
    return this.available.length;
  }
}
