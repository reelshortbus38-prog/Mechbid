import { describe, it, expect } from 'vitest';
import { rateLookup, copperRate, insulRate, unratedCopperSizes, unratedNote } from './copperRates.js';
import { DEFAULT_CU_RATES, DEFAULT_INSUL_RATES } from '../state/store.js';

// ── A 4-1/8 SUCTION MAIN PRICED AT ZERO ──────────────────────────────────────
// Supermarket LOOP systems — the layout Kroger and Walmart run, where a large
// suction main circles the sales floor and lineups tap into it — carry 3-5/8,
// 4-1/8 and larger. The rate table stopped at 3-1/8, and the lookup was
// `rates?.cu?.[size] || 0`, so the biggest run on the job priced at nothing
// with its footage showing on screen the whole time.

describe('the table now reaches the sizes a loop system uses', () => {
  it('prices the large mains', () => {
    for (const s of ['3-5/8', '4-1/8', '5-1/8', '6-1/8']) {
      expect(DEFAULT_CU_RATES[s], s).toBeGreaterThan(0);
      expect(DEFAULT_INSUL_RATES.medSuction[s], s).toBeGreaterThan(0);
      expect(DEFAULT_INSUL_RATES.lowSuction[s], s).toBeGreaterThan(0);
    }
  });

  it('keeps climbing with size, the way copper does', () => {
    const order = ['2-1/8', '2-5/8', '3-1/8', '3-5/8', '4-1/8', '5-1/8', '6-1/8'];
    for (let i = 1; i < order.length; i++) {
      expect(DEFAULT_CU_RATES[order[i]], order[i]).toBeGreaterThan(DEFAULT_CU_RATES[order[i - 1]]);
    }
  });

  it('turns 300 ft of 4-1/8 main into real money', () => {
    expect(300 * DEFAULT_CU_RATES['4-1/8']).toBeGreaterThan(10000);
  });
});

describe('rateLookup', () => {
  it('prefers what the job has tuned', () => {
    expect(rateLookup('7/8', { '7/8': 6.25 }, DEFAULT_CU_RATES)).toEqual({ rate: 6.25, source: 'job' });
  });

  it('keeps a tuned ZERO, because zeroing a rate is a decision', () => {
    expect(rateLookup('7/8', { '7/8': 0 }, DEFAULT_CU_RATES)).toEqual({ rate: 0, source: 'job' });
  });

  it('fills a gap from the current defaults, so an old job gains new sizes', () => {
    // A job created before 4-1/8 existed snapshot its rates without it.
    const oldJob = { '7/8': 4.70, '1-5/8': 10.50 };
    expect(rateLookup('4-1/8', oldJob, DEFAULT_CU_RATES))
      .toEqual({ rate: DEFAULT_CU_RATES['4-1/8'], source: 'default' });
  });

  it('reports a size nothing knows rather than returning a quiet zero', () => {
    expect(rateLookup('9-1/8', {}, DEFAULT_CU_RATES)).toEqual({ rate: 0, source: 'none' });
    expect(rateLookup('', {}, DEFAULT_CU_RATES).source).toBe('none');
  });
});

describe('copperRate and insulRate', () => {
  it('read from the right table', () => {
    expect(copperRate('4-1/8', { cu: {} }).rate).toBe(DEFAULT_CU_RATES['4-1/8']);
    expect(insulRate('4-1/8', { insul: {} }, 'medSuction').rate)
      .toBe(DEFAULT_INSUL_RATES.medSuction['4-1/8']);
  });
});

describe('unratedCopperSizes', () => {
  it('names only the sizes nothing can price', () => {
    expect(unratedCopperSizes(['7/8', '4-1/8', '9-1/8'], { cu: {} })).toEqual(['9-1/8']);
  });

  it('says nothing when every size is covered', () => {
    expect(unratedCopperSizes(['7/8', '2-1/8', '4-1/8'], { cu: {} })).toEqual([]);
  });

  it('spells out the consequence, not just the fact', () => {
    expect(unratedNote('9-1/8')).toMatch(/priced at \$0 and is NOT in your total/);
  });
});
