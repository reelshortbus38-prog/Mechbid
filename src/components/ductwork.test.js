import { describe, it, expect } from 'vitest';
import { parseDuctDesc, gaugeForRect, ductPurchase, ductServiceOf, GALV_LB_SQFT } from './ductwork.js';

// Guards the feet → purchase-unit conversion: rectangular sheet metal is
// bought by the POUND (fabricated), spiral by the foot in 10' joints, flex
// in 25' boxes, wrap insulation by the ~100 sq ft roll.
// Reference: 24x12 duct = 6 ft perimeter, 24 ga (13–30" side) at 1.156
// lb/sqft → 6.936 lb/ft, so 100 ft ≈ 694 lbs before waste.

describe('parseDuctDesc', () => {
  it('reads rect, round, and flex sizes out of takeoff descriptions', () => {
    expect(parseDuctDesc('Ductwork — 24x12 duct (supply)')).toEqual({ kind: 'rect', w: 24, h: 12 });
    expect(parseDuctDesc('Ductwork — 24" x 12" duct')).toEqual({ kind: 'rect', w: 24, h: 12 });
    expect(parseDuctDesc('Ductwork — 12" round duct (exhaust)')).toEqual({ kind: 'round', dia: 12 });
    expect(parseDuctDesc('Spiral duct 14 dia')).toEqual({ kind: 'round', dia: 14 });
    expect(parseDuctDesc('Flex duct 8" runouts')).toEqual({ kind: 'flex', dia: 8 });
    expect(parseDuctDesc('Pipe — 3/4" HW')).toBeNull();
  });
});

describe('gaugeForRect', () => {
  it('follows the SMACNA low-pressure breaks by larger side', () => {
    expect(gaugeForRect(12)).toBe(26);
    expect(gaugeForRect(24)).toBe(24);
    expect(gaugeForRect(42)).toBe(22);
    expect(gaugeForRect(60)).toBe(20);
    expect(gaugeForRect(90)).toBe(18);
  });
});

describe('ductServiceOf', () => {
  it('classifies supply/return/exhaust/OA', () => {
    expect(ductServiceOf('24x12 duct (supply)')).toBe('supply');
    expect(ductServiceOf('20x10 return air duct')).toBe('return');
    expect(ductServiceOf('12" round duct (exhaust)')).toBe('exhaust');
    expect(ductServiceOf('16x16 outside air duct')).toBe('oa');
  });
});

describe('ductPurchase', () => {
  it('converts rectangular footage to fabricated pounds by gauge', () => {
    const { lines, rectByGauge } = ductPurchase(
      [{ desc: 'Ductwork — 24x12 duct (supply)', lf: 100 }], { wastePct: 0, insulate: 'none' });
    expect(rectByGauge[24]).toBeCloseTo(6 * GALV_LB_SQFT[24] * 100, 0); // ≈ 694 lbs
    expect(lines).toHaveLength(1);
    expect(lines[0].unit).toBe('lb');
    expect(lines[0].qty).toBe(Math.ceil(6 * GALV_LB_SQFT[24] * 100));
  });

  it('applies the waste factor and rounds spiral up to whole joints', () => {
    const { lines } = ductPurchase(
      [{ desc: '12" round duct (exhaust)', lf: 100 }], { wastePct: 15, insulate: 'none' });
    // 115 ft → 12 × 10' joints = 120 ft
    expect(lines[0].qty).toBe(120);
    expect(lines[0].unit).toBe('ft');
  });

  it('wraps supply + unknown but not return/exhaust in supply mode', () => {
    const { wrapSqft } = ductPurchase([
      { desc: '24x12 duct (supply)', lf: 100 },   // 600 sqft
      { desc: '24x12 duct (return)', lf: 100 },   // bare
      { desc: '12" round duct (exhaust)', lf: 50 }, // bare
      { desc: '10x10 duct', lf: 30 },             // unknown → wrapped (200/3 sqft... 2*(20)/12*30 = 100)
    ], { insulate: 'supply' });
    expect(wrapSqft).toBeCloseTo(600 + 100, 0);
  });

  it('sizes wrap rolls from surface area + overlap', () => {
    const { lines } = ductPurchase(
      [{ desc: '24x12 duct (supply)', lf: 100 }], { wastePct: 0, insulate: 'supply', rollSqft: 100 });
    const wrap = lines.find(l => l.unit === 'roll');
    expect(wrap.qty).toBe(Math.ceil(600 * 1.15 / 100)); // 7 rolls
  });

  it('boxes flex at 25 ft and never wraps it', () => {
    const { lines, wrapSqft } = ductPurchase(
      [{ desc: 'Flex duct 8"', lf: 120 }], { wastePct: 0, insulate: 'all' });
    expect(lines.find(l => l.unit === 'box').qty).toBe(5);
    expect(wrapSqft).toBe(0);
  });

  it('ignores lines with no footage entered and non-duct lines', () => {
    const { lines } = ductPurchase([
      { desc: 'Ductwork — 24x12 duct', lf: 0 },
      { desc: 'Curb adapter', lf: 50 },
    ]);
    expect(lines).toHaveLength(0);
  });
});

// A real set labeled a 40" spiral main "40x0 SA (40"ø SA labeled as round)".
// The rectangular pattern matches "40x0" first, which would price a 40-inch
// main as a duct with no height — zero pounds, free metal in the bid.
describe('parseDuctDesc — round duct written into a rectangular size', () => {
  it('reads a zero-sided size with a round marker as ROUND', () => {
    const a = parseDuctDesc('Ductwork — 40x0 SA (40"ø SA labeled as round) duct');
    expect(a).toMatchObject({ kind: 'round', dia: 40, repairedFrom: '40x0' });
    const b = parseDuctDesc('Ductwork — 32x0 SA (32"ø) duct');
    expect(b).toMatchObject({ kind: 'round', dia: 32 });
    expect(parseDuctDesc('0x24 round duct')).toMatchObject({ kind: 'round', dia: 24 });
  });

  it('reads a zero-sided size as round even with NO round marker', () => {
    // Corrected by the estimator: rectangular duct is always drawn with both
    // sides, so a label carrying one number is a diameter. Requiring an
    // explicit symbol left real 32"/38"/40" mains priced at zero pounds.
    expect(parseDuctDesc('Ductwork — 24x0 duct (supply)'))
      .toMatchObject({ kind: 'round', dia: 24, inferred: true });
  });

  it('does not disturb ordinary rectangular or round sizes', () => {
    expect(parseDuctDesc('Ductwork — 22x16 duct')).toMatchObject({ kind: 'rect', w: 22, h: 16 });
    expect(parseDuctDesc('Ductwork — 8"ø round duct')).toMatchObject({ kind: 'round', dia: 8 });
    // an oval VAV inlet keeps both dimensions — neither side is zero
    expect(parseDuctDesc('13x10 oval duct')).toMatchObject({ kind: 'rect', w: 13, h: 10 });
  });
});

// ── THE FREE-METAL BUG ───────────────────────────────────────────────────────
// A live 60% set read three main supply trunks as "32x0 SA", "38x0 SA" and
// "40x0 SA" — the second dimension lost. Those three carried 140 of the job's
// 272 total feet, showed full quantities on screen, and converted to ZERO
// pounds of galvanized steel, because a rectangle with a zero side matches no
// purchase branch. Over half the ductwork, bought for free, silently.

describe('duct runs that cannot be priced come back instead of vanishing', () => {
  const trunks = [
    { desc: 'Ductwork — 32x0 SA duct (supply air)', lf: 80 },
    { desc: 'Ductwork — 38x0 SA duct (supply air)', lf: 15 },
    { desc: 'Ductwork — 40x0 SA duct (supply air)', lf: 45 },
  ];

  it('prices a single-dimension trunk as round spiral instead of nothing', () => {
    // Rectangular duct always carries two sides, so one number is a diameter.
    const { unusable, lines } = ductPurchase(trunks);
    expect(unusable).toEqual([]);
    const dias = lines.filter(l => /Spiral round duct/.test(l.desc)).map(l => l.desc);
    expect(dias).toEqual(['Spiral round duct, 32" dia', 'Spiral round duct, 38" dia', 'Spiral round duct, 40" dia']);
  });

  it('marks the repair as INFERRED when no round symbol survived the read', () => {
    expect(parseDuctDesc('Ductwork — 32x0 SA duct (supply air)')).toMatchObject({ kind: 'round', dia: 32, inferred: true });
    expect(parseDuctDesc('Ductwork — 40x0 SA duct (40"ø supply air)')).toMatchObject({ kind: 'round', dia: 40, inferred: false });
  });

  it('keeps a dropped digit a misread, NOT a diameter', () => {
    // "19x1" is 19x17 with a lost digit. Nobody labels round duct that way, so
    // it must not quietly become a 19-inch spiral.
    expect(parseDuctDesc('Ductwork — 19x1 duct (supply air)')).toEqual({ kind: 'rect', w: 19, h: 1 });
  });

  it('keeps pricing the runs that ARE readable alongside them', () => {
    const { lines, unusable } = ductPurchase([...trunks, { desc: 'Ductwork — 36x36 duct (supply air)', lf: 25 }]);
    expect(unusable).toEqual([]);
    expect(lines.some(l => /Galvanized rectangular duct/.test(l.desc))).toBe(true);
  });

  it('still reports a run with no readable size at all', () => {
    const { unusable } = ductPurchase([{ desc: 'Ductwork — 0x0 duct (supply air)', lf: 30 }]);
    expect(unusable).toHaveLength(1);
    expect(unusable[0].reason).toMatch(/zero side/);
  });

  it('says so when no size could be read at all', () => {
    const { unusable } = ductPurchase([{ desc: 'Ductwork — main trunk duct', lf: 30 }]);
    expect(unusable[0].reason).toMatch(/no duct size could be read/);
  });

  it('does not call a line unusable just because it has no footage', () => {
    // No-footage is a different problem with its own warning.
    expect(ductPurchase([{ desc: 'Ductwork — 32x0 SA duct', lf: 0 }]).unusable).toEqual([]);
  });
});

// ── THE DROPPED DIGIT THAT LOOKS HEALTHY ─────────────────────────────────────
// Found auditing the round-duct rule. "19x1" (19x17 with a digit lost) is more
// dangerous than "32x0": zero prices at nothing and shows up in the totals,
// while 19x1 prices at 386 lb against the true 694 lb — 44% light, and
// perfectly believable on screen.

describe('a side too narrow to be real is not priced', () => {
  it('refuses to price a dropped-digit size and says why', () => {
    const { lines, unusable } = ductPurchase(
      [{ desc: 'Ductwork — 19x1 duct (supply air)', lf: 100 }], { wastePct: 0, insulate: 'none' });
    expect(lines).toEqual([]);
    expect(unusable).toHaveLength(1);
    expect(unusable[0].reason).toMatch(/1" side/);
    expect(unusable[0].reason).toMatch(/digit was dropped/);
  });

  it('prices the same run correctly once the digit is restored', () => {
    const { lines } = ductPurchase(
      [{ desc: 'Ductwork — 19x17 duct (supply air)', lf: 100 }], { wastePct: 0, insulate: 'none' });
    expect(lines[0].qty).toBe(694);   // vs the 386 lb the misread produced
  });

  it('still prices the smallest ducts that are actually real', () => {
    const { lines } = ductPurchase(
      [{ desc: 'Ductwork — 6x4 duct (supply air)', lf: 50 }], { wastePct: 0, insulate: 'none' });
    expect(lines).toHaveLength(1);
    expect(lines[0].unit).toBe('lb');
  });

  it('does not apply the minimum to round duct — no second digit to drop', () => {
    const { lines, unusable } = ductPurchase(
      [{ desc: 'Ductwork — 3" round duct (exhaust)', lf: 20 }], { wastePct: 0, insulate: 'none' });
    expect(unusable).toEqual([]);
    expect(lines[0].desc).toMatch(/Spiral round duct, 3" dia/);
  });
});
