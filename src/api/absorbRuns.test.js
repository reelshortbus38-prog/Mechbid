import { describe, it, expect } from 'vitest';
import { absorbHvac } from './ai.js';
import { resolveHvacPartCounts } from '../components/sheetOverlap.js';

// Duct footage was deduped PER FILE on shape+size+service, first-wins, so a
// size appearing on two sheets kept only the first sheet's length. On a
// multi-page set that is a systematic under-count — and it was standing in for
// overlap protection that sheetOverlap already does properly.

const blank = () => ({
  documentType: '', drawingNumber: '', drawingTitle: '', projectName: '', date: '',
  equipment: [], airDevices: [], ductRuns: [], pipeRuns: [], hydronicZones: [], flags: [], summaries: [],
});
const page = (pageNum, drawing, runs) => ({
  parsed: { ductRuns: runs },
  origin: { pageNum, drawing },
});

describe('duct footage survives across sheets', () => {
  it('keeps both sheets\' lengths for the same size', () => {
    const merged = blank(); const seen = new Set();
    const a = page(4, 'M0.03 — OVERALL PLAN', [{ shape: 'rect', size: '32x24', service: 'supply air', estLengthFt: 50 }]);
    const b = page(6, 'M0.05 — OVERALL PLAN', [{ shape: 'rect', size: '32x24', service: 'supply air', estLengthFt: 30 }]);
    absorbHvac(merged, a.parsed, seen, a.origin);
    absorbHvac(merged, b.parsed, seen, b.origin);
    expect(merged.ductRuns).toHaveLength(2);
    expect(merged.ductRuns.map(r => r.estLengthFt)).toEqual([50, 30]);
  });

  it('still collapses a repeat WITHIN one sheet', () => {
    const merged = blank(); const seen = new Set();
    const p = page(4, 'M0.03', [
      { shape: 'rect', size: '32x24', service: 'supply air', estLengthFt: 50 },
      { shape: 'rect', size: '32x24', service: 'supply air', estLengthFt: 50 },
    ]);
    absorbHvac(merged, p.parsed, seen, p.origin);
    expect(merged.ductRuns).toHaveLength(1);
  });

  it('stamps each run with the sheet it came from', () => {
    const merged = blank(); const seen = new Set();
    const p = page(6, 'M1.03 — Enlarged First Floor Plan', [{ shape: 'rect', size: '24x12', estLengthFt: 15 }]);
    absorbHvac(merged, p.parsed, seen, p.origin);
    expect(merged.ductRuns[0]).toMatchObject({ pageNum: 6, drawing: 'M1.03 — Enlarged First Floor Plan' });
  });

  it('hands sheetOverlap what it needs to add plan sheets and cap enlarged ones', () => {
    // Two overall plans → additive. An enlarged sheet re-drawing one of them
    // → capped, not added. This is the behaviour duct never reached before.
    const contribs = [
      { desc: 'Ductwork — 32x24 duct (supply air)', qty: 50, drawing: 'M0.03 — MECHANICAL OVERALL PLAN' },
      { desc: 'Ductwork — 32x24 duct (supply air)', qty: 30, drawing: 'M0.05 — MECHANICAL OVERALL PLAN' },
      { desc: 'Ductwork — 32x24 duct (supply air)', qty: 20, drawing: 'M1.03 — Enlarged First Floor Plan' },
    ];
    const [out] = resolveHvacPartCounts(contribs);
    expect(out.qty).toBe(80);        // 50 + 30 from the plan pool
    expect(out.summedQty).toBe(100); // naive addition would have included the enlarged sheet
    expect(out.overlapTrimmed).toBe(true);
  });
});

describe('pipe runs get the same treatment', () => {
  it('keeps a size that appears on two sheets', () => {
    const merged = blank(); const seen = new Set();
    absorbHvac(merged, { pipeRuns: [{ size: '1 1/4"', service: 'RS', estLengthFt: 40 }] }, seen, { pageNum: 4, drawing: 'A' });
    absorbHvac(merged, { pipeRuns: [{ size: '1 1/4"', service: 'RS', estLengthFt: 25 }] }, seen, { pageNum: 7, drawing: 'B' });
    expect(merged.pipeRuns.map(r => r.estLengthFt)).toEqual([40, 25]);
  });
});
