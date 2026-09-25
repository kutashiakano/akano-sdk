import { EventEmitter } from "node:events";

export class Queue<T = unknown> extends EventEmitter {
  private items = new Set<T>();

  add(item: T): void {
    this.items.add(item);
  }

  has(item: T): boolean {
    return this.items.has(item);
  }

  delete(item: T): boolean {
    return this.items.delete(item);
  }

  first(): T | undefined {
    return [...this.items][0];
  }

  isFirst(item: T): boolean {
    return this.first() === item;
  }

  isEmpty(): boolean {
    return this.items.size === 0;
  }

  unqueue(item?: T): void {
    const q = item ?? this.first();
    if (q !== undefined) {
      this.delete(q);
      this.emit(q as string | symbol);
    }
  }

  async waitQueue(item: T, timeout = 60000): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.has(item)) return reject(new Error("not found in queue"));
      if (this.isFirst(item)) {
        setTimeout(() => resolve(), 5000);
      } else {
        const timer = setTimeout(() => {
          this.delete(item);
          reject(new Error("queue timeout"));
        }, timeout);
        this.once(item as string | symbol, async () => {
          clearTimeout(timer);
          await new Promise((r) => setTimeout(r, 5000));
          resolve();
        });
      }
    });
  }
}
