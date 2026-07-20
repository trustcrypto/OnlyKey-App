type Listener = (...args: unknown[]) => void;

/** Minimal emitter — avoids bundling Node's `events` (and vite polyfill chains). */
export class TypedEmitter {
  private listeners = new Map<string, Set<Listener>>();

  on(event: string, listener: Listener): this {
    let bucket = this.listeners.get(event);
    if (!bucket) {
      bucket = new Set();
      this.listeners.set(event, bucket);
    }
    bucket.add(listener);
    return this;
  }

  emit(event: string, ...args: unknown[]): boolean {
    const bucket = this.listeners.get(event);
    if (!bucket?.size) return false;
    for (const listener of bucket) listener(...args);
    return true;
  }
}