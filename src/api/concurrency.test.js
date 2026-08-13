import { describe, it, expect } from 'vitest';
import { mapWithConcurrency, DEFAULT_CONCURRENCY } from './concurrency.js';

const tick = ms => new Promise(r => setTimeout(r, ms));

describe('mapWithConcurrency', () => {
  it('returns results in INPUT order, not completion order', async () => {
    // Load-bearing: the takeoff merge dedupes first-wins, so a bid whose
    // numbers depend on which page finished first is not reproducible.
    const out = await mapWithConcurrency([30, 5, 20, 1], 4, async ms => { await tick(ms); return ms; });
    expect(out).toEqual([30, 5, 20, 1]);
  });

  it('never runs more than the limit at once', async () => {
    let live = 0, peak = 0;
    await mapWithConcurrency(Array.from({ length: 12 }, (_, i) => i), 3, async () => {
      live += 1; peak = Math.max(peak, live);
      await tick(5);
      live -= 1;
    });
    expect(peak).toBe(3);
  });

  it('runs every item exactly once', async () => {
    const seen = [];
    await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 2, async n => { seen.push(n); });
    expect(seen.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('is genuinely parallel, not a disguised loop', async () => {
    const started = Date.now();
    await mapWithConcurrency([20, 20, 20], 3, async ms => tick(ms));
    expect(Date.now() - started).toBeLessThan(55); // ~20ms together, not 60 in series
  });

  it('passes the index through', async () => {
    expect(await mapWithConcurrency(['a', 'b'], 2, async (v, i) => `${i}${v}`)).toEqual(['0a', '1b']);
  });

  it('handles an empty list and a silly limit', async () => {
    expect(await mapWithConcurrency([], 3, async () => 1)).toEqual([]);
    expect(await mapWithConcurrency([1, 2], 0, async n => n)).toEqual([1, 2]);
    expect(DEFAULT_CONCURRENCY).toBeGreaterThan(1);
  });

  it('propagates a rejection like Promise.all', async () => {
    await expect(mapWithConcurrency([1, 2], 2, async n => {
      if (n === 2) throw new Error('boom');
      return n;
    })).rejects.toThrow('boom');
  });
});
