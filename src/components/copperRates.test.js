import { describe, it, expect } from 'vitest';
import { rateLookup, copperRate, insulRate, unratedCopperSizes, unratedNote } from './copperRates.js';
import { DEFAULT_CU_RATES, DEFAULT_INSUL_RATES, INSUL_WALL, INSUL_CATEGORY_LABEL } from '../state/store.js';

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

// ── INSULATION WALL THICKNESS ────────────────────────────────────────────────
// The wall was hardcoded in three places and they disagreed: the rate table
// called medium-temp suction 1/2" wall while the rates panel and the generated
// bid line both called it 3/4". Different products, different prices — the bid
// advertised one and was priced against the other, with nothing on screen
// showing the disagreement.

describe('wall thickness has one source of truth', () => {
  it('names a wall for every insulation category', () => {
    for (const k of ['medSuction', 'lowSuction', 'lowLiquid']) {
      expect(INSUL_WALL[k], k).toBeTruthy();
    }
  });

  it('builds every label from that one wall', () => {
    for (const k of ['medSuction', 'lowSuction', 'lowLiquid']) {
      expect(INSUL_CATEGORY_LABEL[k], k).toContain(INSUL_WALL[k]);
    }
  });

  it('has a rate table for exactly the categories that have a wall', () => {
    expect(Object.keys(DEFAULT_INSUL_RATES).sort()).toEqual(Object.keys(INSUL_WALL).sort());
  });

  it('keeps low-temp suction thicker than medium-temp, which is why it costs more', () => {
    // A thicker wall has to price higher at the same pipe size, or the tables
    // have drifted apart from the walls they claim.
    for (const s of ['7/8', '1-5/8', '2-1/8']) {
      expect(DEFAULT_INSUL_RATES.lowSuction[s], s)
        .toBeGreaterThan(DEFAULT_INSUL_RATES.medSuction[s]);
    }
  });

  it('covers every size the copper table does, so no run insulates at $0', () => {
    for (const size of Object.keys(DEFAULT_CU_RATES)) {
      expect(DEFAULT_INSUL_RATES.medSuction[size], size).toBeGreaterThan(0);
      expect(DEFAULT_INSUL_RATES.lowSuction[size], size).toBeGreaterThan(0);
      expect(DEFAULT_INSUL_RATES.lowLiquid[size], size).toBeGreaterThan(0);
    }
  });
});

// ── THE VIRGINIA INSULATION PRICING ──────────────────────────────────────────
// Replaced 2026-08-19 from market pricing quoted by SIZE BAND against all three
// wall thicknesses. It settled the mismatch this table already carried: medium-
// temp suction at $2.00/ft for 7/8" sat inside the source's 1/2"-wall band and
// below its 3/4" band, so the app had been pricing thin wall while the bid line
// advertised thick.

describe('insulation matches the quoted bands at the wall each category uses', () => {
  const BAND = {
    // size → [1/2" wall, 3/4" wall, 1" wall] endpoints quoted by the source
    '3/8':   { half: 0.70, threeQ: 1.60, one: 3.00 },   // low end of band 1
    '5/8':   { half: 1.10, threeQ: 2.15, one: 3.90 },   // high end of band 1
    '7/8':   { half: 1.15, threeQ: 2.25, one: 4.00 },   // low end of band 2
    '1-3/8': { half: 2.10, threeQ: 3.40, one: 5.55 },   // high end of band 2
    '1-5/8': { half: 2.20, threeQ: 3.65, one: 5.80 },   // low end of band 3
    '2-1/8': { half: 3.30, threeQ: 4.90, one: 7.50 },   // high end of band 3
    '2-5/8': { half: 3.80, threeQ: 5.50, one: 9.50 },   // low end of band 4
    '4-1/8': { half: 6.50, threeQ: 9.00, one: 16.00 },  // high end of band 4
  };

  it('lands every band endpoint exactly, at the right wall', () => {
    for (const [size, q] of Object.entries(BAND)) {
      expect(DEFAULT_INSUL_RATES.lowLiquid[size], `${size} 1/2"`).toBe(q.half);
      expect(DEFAULT_INSUL_RATES.medSuction[size], `${size} 3/4"`).toBe(q.threeQ);
      expect(DEFAULT_INSUL_RATES.lowSuction[size], `${size} 1"`).toBe(q.one);
    }
  });

  it('keeps the sizes between endpoints inside their band', () => {
    // 1-1/8 sits between the 7/8 and 1-3/8 endpoints of band 2.
    for (const [cat, lo, hi] of [['lowLiquid', 1.15, 2.10], ['medSuction', 2.25, 3.40], ['lowSuction', 4.00, 5.55]]) {
      expect(DEFAULT_INSUL_RATES[cat]['1-1/8'], cat).toBeGreaterThan(lo);
      expect(DEFAULT_INSUL_RATES[cat]['1-1/8'], cat).toBeLessThan(hi);
    }
  });

  it('scales past the quoted bands rather than stopping', () => {
    for (const cat of ['medSuction', 'lowSuction', 'lowLiquid']) {
      expect(DEFAULT_INSUL_RATES[cat]['6-1/8'], cat).toBeGreaterThan(DEFAULT_INSUL_RATES[cat]['4-1/8']);
      expect(DEFAULT_INSUL_RATES[cat]['1/4'], cat).toBeLessThan(DEFAULT_INSUL_RATES[cat]['3/8']);
    }
  });

  it('prices thicker wall above thinner at every single size', () => {
    // The check that a category never drifts off the wall it claims.
    for (const size of Object.keys(DEFAULT_CU_RATES)) {
      expect(DEFAULT_INSUL_RATES.medSuction[size], size).toBeGreaterThan(DEFAULT_INSUL_RATES.lowLiquid[size]);
      expect(DEFAULT_INSUL_RATES.lowSuction[size], size).toBeGreaterThan(DEFAULT_INSUL_RATES.medSuction[size]);
    }
  });

  it('records that liquid went DOWN while suction went UP', () => {
    // Both old numbers were wrong, in opposite directions — worth pinning so
    // neither gets "corrected" back toward the other.
    expect(DEFAULT_INSUL_RATES.lowLiquid['7/8']).toBeLessThan(2.15);   // was 2.15
    expect(DEFAULT_INSUL_RATES.lowSuction['7/8']).toBeGreaterThan(2.70); // was 2.70
  });
});
