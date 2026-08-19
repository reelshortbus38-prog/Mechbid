import { describe, it, expect } from 'vitest';
import {
  ELBOW_90, COUPLING, TYPE_FACTOR, LAST_QUOTED_SIZE, PTRAP_ELBOWS,
  fittingPrice, fittingPriceForPair, fittingNote,
} from './fittingPrices.js';

// The picker built a fitting line and left it at $0, so itemizing meant pricing
// every piece by hand — the only reason the percentage allowance was the
// sensible default. Priced 2026-08-19 from quoted ACR fitting pricing.

describe('the quoted figures land exactly', () => {
  it('uses the quoted 90° elbows', () => {
    expect(ELBOW_90['3/8']).toBe(6.00);    // midpoint of $5.80-6.20
    expect(ELBOW_90['3/4' in ELBOW_90 ? '3/4' : '5/8']).toBeGreaterThan(0);
    expect(ELBOW_90['1-1/8']).toBe(24.30);
  });

  it('uses the quoted coupling bands', () => {
    expect(COUPLING['1/4']).toBe(1.30);
    expect(COUPLING['3/8']).toBe(1.80);
    expect(COUPLING['5/8']).toBe(2.50);
    expect(COUPLING['7/8']).toBe(3.60);
    expect(COUPLING['1-1/8']).toBe(7.90);
  });

  it('puts small bushings in the $2-$5 the source states', () => {
    for (const s of ['3/8', '1/2', '5/8']) {
      const p = fittingPrice('Bushing', s).price;
      expect(p, s).toBeGreaterThanOrEqual(2.00);
      expect(p, s).toBeLessThanOrEqual(5.00);
    }
  });

  it('reproduces the street-ell ratio the source implies', () => {
    // 3/8" gives 0.74 and 3/4" gives 0.70 against their 90° elbows.
    expect(TYPE_FACTOR['Street Ell']).toBeGreaterThan(0.68);
    expect(TYPE_FACTOR['Street Ell']).toBeLessThan(0.76);
    expect(fittingPrice('Street Ell', '3/8').price).toBeCloseTo(6.00 * 0.72, 2);
  });
});

describe('quoted versus extrapolated is never hidden', () => {
  it('marks everything the source covers as quoted', () => {
    for (const s of ['1/4', '3/8', '1/2', '5/8', '7/8', '1-1/8']) {
      expect(fittingPrice('Elbow 90°', s).quoted, s).toBe(true);
    }
  });

  it('marks everything above it as not', () => {
    for (const s of ['1-3/8', '2-1/8', '4-1/8']) {
      expect(fittingPrice('Elbow 90°', s).quoted, s).toBe(false);
    }
  });

  it('says so on the line, and says why', () => {
    expect(fittingNote(fittingPrice('Elbow 90°', '4-1/8'))).toMatch(/EXTRAPOLATED/);
    expect(fittingNote(fittingPrice('Elbow 90°', '4-1/8'))).toContain(LAST_QUOTED_SIZE);
    expect(fittingNote(fittingPrice('Elbow 90°', '7/8'))).not.toMatch(/EXTRAPOLATED/);
  });
});

describe('prices behave the way fittings behave', () => {
  it('climbs with every size step', () => {
    const order = Object.keys(ELBOW_90);
    for (let i = 1; i < order.length; i++) {
      expect(ELBOW_90[order[i]], order[i]).toBeGreaterThan(ELBOW_90[order[i - 1]]);
      // Couplings only have to be NON-decreasing: the source's bands meet at
      // their boundary — 3/8" tops the $1.30-1.80 band and 1/2" opens the
      // $1.80-2.50 one, both at $1.80. That is the quoted data, and inventing a
      // difference to make the curve pretty would be worse than a flat step.
      expect(COUPLING[order[i]], order[i]).toBeGreaterThanOrEqual(COUPLING[order[i - 1]]);
    }
    // It still has to climb overall, not sit flat.
    expect(COUPLING['4-1/8']).toBeGreaterThan(COUPLING['1/4'] * 10);
  });

  it('keeps a coupling well under an elbow of the same size', () => {
    for (const s of ['3/8', '7/8', '2-1/8']) {
      expect(COUPLING[s], s).toBeLessThan(ELBOW_90[s]);
    }
  });

  it('prices a tee above an elbow and a cap below it', () => {
    expect(fittingPrice('Tee', '7/8').price).toBeGreaterThan(fittingPrice('Elbow 90°', '7/8').price);
    expect(fittingPrice('Cap', '7/8').price).toBeLessThan(fittingPrice('Elbow 90°', '7/8').price);
  });

  it('prices a P-trap as the elbows it is bent from, not as a catalogue part', () => {
    expect(fittingPrice('P-Trap', '7/8').price)
      .toBeCloseTo(ELBOW_90['7/8'] * PTRAP_ELBOWS, 2);
  });
});

describe('two-size fittings', () => {
  it('prices a reducer on the LARGER size, which is the body it is made from', () => {
    const big = fittingPriceForPair('Reducer', '7/8', '2-1/8');
    expect(big.price).toBe(fittingPrice('Reducer', '2-1/8').price);
    // Order must not matter.
    expect(fittingPriceForPair('Reducer', '2-1/8', '7/8').price).toBe(big.price);
  });
});

describe('it says nothing rather than guessing', () => {
  it('returns null for a size or type it has no basis for', () => {
    expect(fittingPrice('Elbow 90°', '8-1/8')).toBeNull();
    expect(fittingPrice('Flux Capacitor', '7/8')).toBeNull();
    expect(fittingPrice('', '7/8')).toBeNull();
    expect(fittingPrice('Elbow 90°', '')).toBeNull();
  });

  it('tolerates a size written with its inch mark', () => {
    expect(fittingPrice('Elbow 90°', '7/8"').price).toBe(ELBOW_90['7/8']);
  });
});
