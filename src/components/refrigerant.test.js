import { describe, it, expect } from 'vitest';
import { estimateRefrigerantLbs, REFRIGERANTS, estimateChargeAdder, CHARGE_OZ_PER_FT } from './refrigerant.js';

// Guards the refrigerant-pounds estimate the Food Lion bid letters require.
// The liquid line dominates: internal volume × liquid density. Reference
// check (R-448A @ 60 lb/ft³): 1/2" ACR has ID 0.436" → 0.0622 lb/ft, so
// 100 ft ≈ 6.2 lb of liquid line.

describe('estimateRefrigerantLbs', () => {
  it('computes liquid-line pounds from pipe geometry × density', () => {
    const circuits = [{
      runLength: 100, riserLength: 0, liqHoriz: '1/2"', sucHoriz: '', sucRiser: '',
      tempType: 'medium', isRiserOnly: false,
    }];
    const r = estimateRefrigerantLbs(circuits, { refrigerant: 'R-448A', newCases: 0, topOffPct: 0 });
    expect(r.liquidLbs).toBeGreaterThan(5.5);
    expect(r.liquidLbs).toBeLessThan(7);
    expect(r.suctionLbs).toBe(0);
  });

  it('suction vapor is a small fraction of liquid at the same footage', () => {
    const circuits = [{
      runLength: 100, riserLength: 0, liqHoriz: '1/2"', sucHoriz: '1/2"', sucRiser: '',
      tempType: 'medium', isRiserOnly: false,
    }];
    const r = estimateRefrigerantLbs(circuits, { topOffPct: 0 });
    expect(r.suctionLbs).toBeGreaterThan(0);
    expect(r.suctionLbs).toBeLessThan(r.liquidLbs / 10); // vapor ≪ liquid
  });

  it('liquid line runs the full path (run + riser); riser-only carries NO liquid', () => {
    const full = estimateRefrigerantLbs([{ runLength: 80, riserLength: 20, liqHoriz: '5/8', tempType: 'medium' }], { topOffPct: 0 });
    expect(full.liquidLbs).toBeGreaterThan(0); // 100 ft of 5/8" liquid
    // Riser-only = suction only (estimator-confirmed: liquid doesn't get a
    // riser) — even a stale liqHoriz value on the row must not count.
    const riserOnly = estimateRefrigerantLbs([{ runLength: 500, riserLength: 20, liqHoriz: '5/8', isRiserOnly: true, tempType: 'medium' }], { topOffPct: 0 });
    expect(riserOnly.liquidLbs).toBe(0);
  });

  it('case allowance and top-off add on; total rounds to whole pounds', () => {
    const circuits = [{ runLength: 100, riserLength: 0, liqHoriz: '1/2"', tempType: 'medium' }];
    const r = estimateRefrigerantLbs(circuits, { newCases: 4, lbPerCase: 3, topOffPct: 10 });
    expect(r.casesLbs).toBe(12);
    expect(r.topOffLbs).toBeCloseTo((r.liquidLbs + 12) * 0.1, 0);
    expect(r.total).toBe(Math.round(r.liquidLbs + r.suctionLbs + r.casesLbs + r.topOffLbs));
  });

  it('handles empty input and unknown sizes without NaN', () => {
    expect(estimateRefrigerantLbs([], {}).total).toBe(0);
    const r = estimateRefrigerantLbs([{ runLength: 100, liqHoriz: '9/9"', tempType: 'medium' }], {});
    expect(Number.isNaN(r.total)).toBe(false);
  });

  it('every refrigerant in the table has a usable liquid density', () => {
    Object.values(REFRIGERANTS).forEach(r => expect(r.liquid).toBeGreaterThan(30));
  });
});

// Split-system charge adder: factory charge covers 15 ft; a 40 ft lineset on
// 3/8" liquid at the standard R-410A 0.6 oz/ft adds 25 × 0.6 = 15 oz.
describe('estimateChargeAdder', () => {
  it('matches the nameplate math: 40 ft on 3/8" R-410A = 15 oz', () => {
    const r = estimateChargeAdder({ liqSize: '3/8', linesetFt: 40, refrigerant: 'R-410A' });
    expect(r.extraFt).toBe(25);
    expect(r.addOz).toBe(15);
    expect(r.addLbs).toBeCloseTo(0.9, 1);
  });

  it('no adder when the lineset is within the factory charge', () => {
    const r = estimateChargeAdder({ liqSize: '3/8', linesetFt: 12 });
    expect(r.extraFt).toBe(0);
    expect(r.addOz).toBe(0);
  });

  it('scales with liquid size, refrigerant factor, and system count', () => {
    const half = estimateChargeAdder({ liqSize: '1/2', linesetFt: 25 });
    expect(half.ozPerFt).toBeCloseTo(1.15, 2);
    const r32 = estimateChargeAdder({ liqSize: '3/8', linesetFt: 40, refrigerant: 'R-32' });
    expect(r32.addOz).toBeCloseTo(15 * 0.9, 1);
    const two = estimateChargeAdder({ liqSize: '3/8', linesetFt: 40, systems: 2 });
    expect(two.addOz).toBe(30);
  });

  it('respects a custom factory-included length and handles junk input', () => {
    const r = estimateChargeAdder({ liqSize: '3/8', linesetFt: 40, includedFt: 25 });
    expect(r.extraFt).toBe(15);
    expect(estimateChargeAdder({}).addOz).toBe(0);
    expect(Number.isNaN(estimateChargeAdder({ liqSize: '9/9', linesetFt: 'abc' }).addOz)).toBe(false);
  });

  it('covers the common residential liquid sizes', () => {
    ['1/4', '5/16', '3/8', '1/2', '5/8'].forEach(s => expect(CHARGE_OZ_PER_FT[s]).toBeGreaterThan(0));
  });
});
