import { describe, it, expect } from 'vitest';
import { estimateRefrigerantLbs, REFRIGERANTS } from './refrigerant.js';

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

  it('liquid line runs the full path (run + riser); riser-only uses riser', () => {
    const full = estimateRefrigerantLbs([{ runLength: 80, riserLength: 20, liqHoriz: '5/8', tempType: 'medium' }], { topOffPct: 0 });
    const riserOnly = estimateRefrigerantLbs([{ runLength: 500, riserLength: 20, liqHoriz: '5/8', isRiserOnly: true, tempType: 'medium' }], { topOffPct: 0 });
    expect(full.liquidLbs).toBeCloseTo(5 * riserOnly.liquidLbs, 0); // 100 ft vs 20 ft
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
