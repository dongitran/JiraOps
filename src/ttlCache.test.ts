import { describe, expect, test } from 'vitest';

import { TtlCache } from './ttlCache';

describe('TtlCache', () => {
  test('returns fresh values and expires stale entries', () => {
    let nowMs = 1_000;
    const cache = new TtlCache<string>(1_000, () => nowMs);

    expect(cache.get('OPS-123')).toEqual({ status: 'miss' });

    cache.set('OPS-123', 'fresh-detail');
    expect(cache.get('OPS-123')).toEqual({
      status: 'hit',
      value: 'fresh-detail',
    });

    nowMs = 2_001;
    expect(cache.get('OPS-123')).toEqual({ status: 'expired' });
    expect(cache.get('OPS-123')).toEqual({ status: 'miss' });
  });

  test('clears cached entries explicitly', () => {
    const cache = new TtlCache<readonly string[]>(5_000, () => 1_000);

    cache.set('OPS-123', ['one', 'two']);
    cache.set('OPS-456', ['three']);
    cache.delete('OPS-456');

    expect(cache.get('OPS-123')).toEqual({
      status: 'hit',
      value: ['one', 'two'],
    });
    expect(cache.get('OPS-456')).toEqual({ status: 'miss' });

    cache.clear();
    expect(cache.get('OPS-123')).toEqual({ status: 'miss' });
  });
});
