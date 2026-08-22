/**
 * The subset of the Web Storage API the core library needs. The app injects
 * window.localStorage; tests inject a Map-backed fake — core never touches a
 * global, which is part of what keeps it framework- and environment-free.
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStorage implements StorageLike {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  /** Test helper: all raw stored content, for at-rest assertions. */
  dump(): string {
    return [...this.map.entries()].map(([k, v]) => k + v).join('');
  }
  clear(): void {
    this.map.clear();
  }
}
