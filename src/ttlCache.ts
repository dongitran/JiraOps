export type TtlCacheResult<T> =
  | {
      readonly status: 'hit';
      readonly value: T;
    }
  | {
      readonly status: 'miss' | 'expired';
    };

interface TtlCacheEntry<T> {
  readonly value: T;
  readonly expiresAtMs: number;
}

export class TtlCache<T> {
  private readonly entries = new Map<string, TtlCacheEntry<T>>();

  public constructor(
    private readonly ttlMs: number,
    private readonly nowMs: () => number = Date.now
  ) {}

  public get(key: string): TtlCacheResult<T> {
    const entry = this.entries.get(key);
    if (entry === undefined) {
      return { status: 'miss' };
    }

    if (entry.expiresAtMs <= this.nowMs()) {
      this.entries.delete(key);
      return { status: 'expired' };
    }

    return {
      status: 'hit',
      value: entry.value,
    };
  }

  public set(key: string, value: T): void {
    this.entries.set(key, {
      value,
      expiresAtMs: this.nowMs() + this.ttlMs,
    });
  }

  public delete(key: string): void {
    this.entries.delete(key);
  }

  public clear(): void {
    this.entries.clear();
  }
}
