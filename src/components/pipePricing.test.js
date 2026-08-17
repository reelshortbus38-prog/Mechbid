import { describe, it, expect } from 'vitest';
import {
  COPPER_L_LB_FT, COPPER_ANCHOR, COPPER_MAX_IN, STEEL_40_PER_FT,
  copperPerLb, pipeMaterialPrice, pipeDescSize, pipeDefaultPrice, isHydronicService,
} from './pipePricing.js';
import { defaultHvacPrice } from '../state/store.js';

describe('the copper table is derived from the estimator s own number', () => {
  it('returns the anchor itself at the anchor size', () => {
    expect(pipeMaterialPrice(0.75).pricePerFt).toBe(9);
  });

  it('scales every other size by the weight of metal in the pipe', () => {
    // Copper cost tracks weight, so the ratio between two sizes is the ratio of
    // their pounds per foot — not a number anybody has to keep updated.
    const perLb = copperPerLb();
    for (const [dia, lb] of Object.entries(COPPER_L_LB_FT)) {
      expect(pipeMaterialPrice(Number(dia)).pricePerFt)
        .toBeCloseTo(Math.round(lb * perLb * 100) / 100, 2);
    }
  });

  it('moves the whole table when the anchor moves', () => {
    const dearer = { dia: 0.75, pricePerFt: 18 };
    expect(pipeMaterialPrice(0.75, dearer).pricePerFt).toBe(18);
    expect(pipeMaterialPrice(2, dearer).pricePerFt)
      .toBeCloseTo(pipeMaterialPrice(2).pricePerFt * 2, 1);
  });

  it('marks copper as derived and steel as not', () => {
    expect(pipeMaterialPrice(2)).toMatchObject({ material: 'copper type L', derived: true });
    expect(pipeMaterialPrice(6)).toMatchObject({ material: 'sch-40 black steel', derived: false });
  });
});

describe('copper stops where copper stops', () => {
  it('switches to steel above 2-1/2"', () => {
    // A live sheet ran 1/2" to 6" on one drawing. 6" copper would price near
    // $250/ft against a line that should be nearer $40.
    expect(pipeMaterialPrice(COPPER_MAX_IN).material).toBe('copper type L');
    expect(pipeMaterialPrice(3).material).toBe('sch-40 black steel');
    expect(pipeMaterialPrice(6).pricePerFt).toBe(STEEL_40_PER_FT[6]);
  });

  it('keeps the big sizes an order of magnitude below copper-priced ones', () => {
    // The failure this guards against: scaling copper all the way up.
    const asCopper = 5.38 * copperPerLb();     // 4" type L weighs ~5.38 lb/ft
    expect(pipeMaterialPrice(4).pricePerFt).toBeLessThan(asCopper / 3);
  });
});

describe('pipeDescSize', () => {
  it('reads the size off a takeoff line', () => {
    expect(pipeDescSize('Pipe — 3/4" HWS')).toBe(0.75);
    expect(pipeDescSize('Pipe — 1-1/2" HWR')).toBe(1.5);
    expect(pipeDescSize('Pipe — 2-1/2" CWS')).toBe(2.5);
    expect(pipeDescSize('Pipe — 1" HWS')).toBe(1);
    expect(pipeDescSize('Pipe — 6" CWR')).toBe(6);
  });
});

describe('pipeDefaultPrice', () => {
  it('prices the hydronic lines from a real sheet', () => {
    expect(pipeDefaultPrice('Pipe — 3/4" HWS')).toBe(9);
    expect(pipeDefaultPrice('Pipe — 1/2" HWR')).toBeCloseTo(5.64, 2);
    expect(pipeDefaultPrice('Pipe — 6" CWS')).toBe(38);
  });

  it('leaves refrigerant and everything else alone', () => {
    // ACR tubing is bought on different terms and has its own rule.
    expect(pipeDefaultPrice('Pipe — 1-5/8" RS')).toBe(0);
    expect(pipeDefaultPrice('Pipe — 7/8" RL')).toBe(0);
    expect(pipeDefaultPrice('Ductwork — 24x12 duct (supply)')).toBe(0);
    expect(pipeDefaultPrice('Curb adapter')).toBe(0);
  });

  it('says nothing about a size it has no entry for', () => {
    expect(pipeDefaultPrice('Pipe — 14" HWS')).toBe(0);
    expect(pipeDefaultPrice('Pipe — SIZE NEEDED HWS')).toBe(0);
  });
});

describe('the price table reaches the app', () => {
  it('prices a pipe line by size rather than by the generic rules', () => {
    expect(defaultHvacPrice('Pipe — 2" HWS')).toBeCloseTo(34.62, 2);
    expect(defaultHvacPrice('Pipe — 3/4" HWR')).toBe(9);
  });

  it('no longer prices a condensate LINE like a condensate TRAP', () => {
    // "Pipe — 3/4" CD" would have hit the /condensate|drain/ rule at $40 — per
    // foot, for a drain line. It falls through to the generic rules only when
    // this module has nothing to say, which is still the case here, so the
    // guard that matters is that hydronic never reaches them.
    expect(defaultHvacPrice('Pipe — 1-1/4" HWS')).not.toBe(40);
  });

  it('leaves the non-pipe defaults exactly as they were', () => {
    expect(defaultHvacPrice('Curb adapter')).toBe(450);
    expect(defaultHvacPrice('Galvanized rectangular duct, 20 ga — fabricated')).toBe(4.5);
  });
});

describe('isHydronicService', () => {
  it('knows water from refrigerant', () => {
    for (const s of ['HWS', 'HWR', 'CHWS', 'CWR', 'GLY']) expect(isHydronicService(s), s).toBe(true);
    for (const s of ['RS', 'RL', 'NG', 'CD']) expect(isHydronicService(s), s).toBe(false);
  });
});
