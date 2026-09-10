import { describe, it, expect } from 'vitest';
import {
  newRental, rentalLineTotal, rentalsBase, rentalsSummary,
  rateBreakNote, rateBreakLines, RENTAL_UNITS, COMMON_RENTALS, RATE_BREAK_AT,
} from './rentals.js';

const line = (o) => ({ id: 'x', ...newRental('x'), ...o });

describe('rental lines', () => {
  it('is quantity times rate', () => {
    expect(rentalLineTotal(line({ qty: 3, unit: 'week', rate: 400 }))).toBe(1200);
  });

  it('never goes negative on a typo', () => {
    expect(rentalLineTotal(line({ qty: -3, rate: 400 }))).toBe(0);
    expect(rentalLineTotal(line({ qty: 3, rate: -400 }))).toBe(0);
  });

  it('is nothing until somebody puts a rate on it', () => {
    // Rates start at zero on purpose — rental pricing is regional and
    // negotiated, and a plausible default would be a number nobody quoted.
    expect(rentalLineTotal(newRental('a'))).toBe(0);
    expect(rentalsBase([newRental('a'), newRental('b')])).toBe(0);
  });

  it('starts a new line by the week, which is how a lift is rented', () => {
    expect(newRental('a').unit).toBe('week');
  });
});

// ── THE RATE BREAK ──────────────────────────────────────────────────────────
// A month is commonly about three weeks' money, not four. Four weeks entered as
// weeks costs a third more than the same four weeks entered as a month, and an
// estimator who does not know that has quietly padded the bid.
describe('rateBreakNote', () => {
  it('speaks up at four weeks', () => {
    const note = rateBreakNote(line({ qty: 4, unit: 'week', rate: 400 }));
    expect(note).toMatch(/a month is usually around three weeks' money/);
    expect(RATE_BREAK_AT).toBe(4);
  });

  it('speaks up at four days', () => {
    expect(rateBreakNote(line({ qty: 5, unit: 'day', rate: 150 })))
      .toMatch(/a week is usually around three days' money/);
  });

  it('says nothing at three, which is what the rate is for', () => {
    expect(rateBreakNote(line({ qty: 3, unit: 'week', rate: 400 }))).toBe('');
    expect(rateBreakNote(line({ qty: 3, unit: 'day', rate: 150 }))).toBe('');
  });

  it('says nothing about months — there is no unit above it here', () => {
    expect(rateBreakNote(line({ qty: 6, unit: 'month', rate: 900 }))).toBe('');
  });

  it('says nothing about a one-off charge', () => {
    // Delivery, pickup, damage waiver. Four of them is four of them.
    expect(rateBreakNote(line({ qty: 4, unit: 'ea', rate: 125 }))).toBe('');
  });

  it('does NOT change the number it is warning about', () => {
    // The app does not know this supplier's monthly rate. Inventing a discount
    // would be worse than the padding it is pointing at.
    const long = line({ qty: 4, unit: 'week', rate: 400 });
    expect(rentalLineTotal(long)).toBe(1600);
  });

  it('collects the lines worth re-quoting', () => {
    const rows = [
      line({ id: 'a', qty: 6, unit: 'week', rate: 400 }),
      line({ id: 'b', qty: 2, unit: 'week', rate: 300 }),
      line({ id: 'c', qty: 1, unit: 'ea', rate: 250 }),
    ];
    expect(rateBreakLines(rows).map(r => r.id)).toEqual(['a']);
  });
});

describe('rentalsSummary', () => {
  const rows = [
    line({ id: 'a', desc: "Scissor lift — 26'", qty: 3, unit: 'week', rate: 400 }),
    line({ id: 'b', desc: 'Reefer trailer', qty: 2, unit: 'week', rate: 550 }),
    line({ id: 'c', desc: 'unpriced', qty: 0, rate: 0 }),
  ];

  it('counts only the lines that carry money', () => {
    const s = rentalsSummary(rows, 0);
    expect(s.lines).toBe(2);
    expect(s.base).toBe(1200 + 1100);
  });

  it('passes rental through at cost by default', () => {
    expect(rentalsSummary(rows, 0).total).toBe(2300);
  });

  it('marks it up when the shop marks it up', () => {
    expect(rentalsSummary(rows, 15).total).toBe(2645);
  });

  it('reports how many lines want a longer-term quote', () => {
    expect(rentalsSummary([...rows, line({ id: 'd', qty: 5, unit: 'week', rate: 400 })], 0).rateBreaks).toBe(1);
  });

  it('is empty rather than broken with nothing rented', () => {
    expect(rentalsSummary([], 0)).toMatchObject({ lines: 0, base: 0, total: 0 });
    expect(rentalsSummary()).toMatchObject({ lines: 0, base: 0, total: 0 });
  });
});

describe('what this trade actually rents', () => {
  it('offers the two a generic list would miss', () => {
    // A grocery remodel has to put the PRODUCT somewhere when the cases come
    // down, and the crew works NIGHTS in a store with the lights half off.
    const descs = COMMON_RENTALS.map(c => c.desc).join(' | ');
    expect(descs).toMatch(/Reefer trailer/);
    expect(descs).toMatch(/Light tower/);
  });

  it('offers every line a unit the picker knows', () => {
    for (const c of COMMON_RENTALS) expect(RENTAL_UNITS, c.desc).toContain(c.unit);
  });

  it('carries no rate on any of them', () => {
    for (const c of COMMON_RENTALS) expect(c.rate, c.desc).toBeUndefined();
  });
});
