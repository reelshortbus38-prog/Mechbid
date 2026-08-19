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

// ── THE VIRGINIA COPPER PRICING ──────────────────────────────────────────────
// Replaced 2026-08-19 from supplier pricing the estimator pulled for their own
// market. The shipped table had been roughly a THIRD of these, which made every
// refrigeration bid built on it materially light.

describe('the copper table matches the quoted market pricing', () => {
  const QUOTED_MIDPOINTS = { '3/8': 5.00, '1/2': 6.00, '5/8': 8.25, '7/8': 10.00, '1-1/8': 18.00, '2-1/8': 38.00 };

  it('uses the quoted midpoint for every size that was quoted', () => {
    for (const [size, price] of Object.entries(QUOTED_MIDPOINTS)) {
      expect(DEFAULT_CU_RATES[size], size).toBe(price);
    }
  });

  it('each quoted size sits inside the range it came from', () => {
    const RANGES = { '3/8': [4.50, 5.50], '1/2': [5, 7], '5/8': [7.50, 9], '7/8': [9, 11], '1-1/8': [15, 21] };
    for (const [size, [lo, hi]] of Object.entries(RANGES)) {
      expect(DEFAULT_CU_RATES[size], size).toBeGreaterThanOrEqual(lo);
      expect(DEFAULT_CU_RATES[size], size).toBeLessThanOrEqual(hi);
    }
  });

  it('keeps the derived large sizes inside the source s own $38-$105+ band', () => {
    // The same source gives "2-1/8 to 3-1/8+: $38 to $105+" as one coarse band.
    // Scaling by weight off the 2-1/8 anchor has to land inside it.
    expect(DEFAULT_CU_RATES['3-5/8']).toBeGreaterThan(38);
    expect(DEFAULT_CU_RATES['3-5/8']).toBeLessThanOrEqual(105);
  });

  it('still climbs with every size step', () => {
    const order = ['1/4', '3/8', '1/2', '5/8', '7/8', '1-1/8', '1-3/8', '1-5/8', '2-1/8', '2-5/8', '3-1/8', '3-5/8', '4-1/8', '5-1/8', '6-1/8'];
    for (let i = 1; i < order.length; i++) {
      expect(DEFAULT_CU_RATES[order[i]], order[i]).toBeGreaterThan(DEFAULT_CU_RATES[order[i - 1]]);
    }
  });

  it('shows $/lb FALLING as the tube grows, which is what the quotes do', () => {
    // Small tube carries coil and handling overhead a hard length does not, so
    // this is a real effect and not a fitting artefact.
    const lb = (od, w) => Math.PI * (od - w) * w * 12 * 0.323;
    const perLbSmall = DEFAULT_CU_RATES['3/8'] / lb(0.375, 0.032);
    const perLbLarge = DEFAULT_CU_RATES['2-1/8'] / lb(2.125, 0.070);
    expect(perLbSmall).toBeGreaterThan(perLbLarge * 1.4);
  });

  it('is a real multiple of what shipped before, which is the point', () => {
    // Guard against a silent revert to the old, light table.
    expect(DEFAULT_CU_RATES['7/8']).toBeGreaterThan(8);
    expect(DEFAULT_CU_RATES['2-1/8']).toBeGreaterThan(30);
  });
});
