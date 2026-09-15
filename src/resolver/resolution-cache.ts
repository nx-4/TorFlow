type CacheEntry<T> = { value: T; expiresAt: number };

export class ResolutionCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  constructor(private readonly ttlMs = 3_600_000, private readonly maxEntries = 500) {}
  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) { this.entries.delete(key); return undefined; }
    this.entries.delete(key); this.entries.set(key, entry);
    return entry.value;
  }
  set(key: string, value: T): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value as string);
  }
  delete(key: string): void { this.entries.delete(key); }
  clear(): void { this.entries.clear(); }
  get size(): number { return this.entries.size; }
}

export function resolutionCacheKey(query: Record<string, unknown>): string {
  return JSON.stringify(Object.keys(query).sort().reduce<Record<string, unknown>>((result, key) => { const value = query[key]; if (value !== undefined && value !== '') result[key] = value; return result; }, {}));
}
