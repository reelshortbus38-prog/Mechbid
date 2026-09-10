import { describe, it, expect } from 'vitest';
import { travelCost, travelManHours, calcLaborPeriodCost, calcFlatJobCost } from './store.js';
import { TIME_AND_MATERIALS } from '../steps/bidMethod.js';

// ── TRAVEL TIME IS PAID HOURS, NOT A PER DIEM ───────────────────────────────
// It used to live inside the out-of-town dollar figure alongside meals and
// hotel, which hid it from everything that makes it labor: it never took the
// crew's own rate, it never appeared in the hours, and it could not be told
// apart from a hotel bill on a bid letter that breaks out-of-town out.
describe('travelCost', () => {
  const crew = [
    { id: 'a', rate: 100, hrsPerDay: 8 },
    { id: 'b', rate: 60, hrsPerDay: 8 },
  ];

  it('is each man at his OWN rate, not an average', () => {
    // 8 hours of driving: $800 + $480, not 2 x 8 x $80.
    expect(travelCost(crew, 8)).toBe(8 * 100 + 8 * 60);
  });

  it('skips the man who is not travelling', () => {
    // Somebody local to the store drives home like any other job — the same
    // flag the hotel room uses.
    const mixed = [...crew, { id: 'c', rate: 90, travels: false }];
    expect(travelCost(mixed, 8)).toBe(8 * 100 + 8 * 60);
  });

  it('is straight time by default', () => {
    // A four-in-the-morning drive to a night shift is not night-premium work,
    // and a long drive is not overtime, in most shops' practice.
    expect(travelCost(crew, 8, { shiftMult: 1.5, otMult: 1.5 })).toBe(8 * 160);
  });

  it('takes the shift multipliers for a shop that pays it that way', () => {
    expect(travelCost(crew, 8, { shiftMult: 1.5, otMult: 1.5, premium: true }))
      .toBe(8 * 160 * 1.5 * 1.5);
  });

  it('is nothing without hours or without a crew', () => {
    expect(travelCost(crew, 0)).toBe(0);
    expect(travelCost(crew, -4)).toBe(0);
    expect(travelCost([], 8)).toBe(0);
    expect(travelCost(undefined, 8)).toBe(0);
  });

  it('reports man-hours, which is what a timesheet would show', () => {
    expect(travelManHours(crew, 8)).toBe(16);
    expect(travelManHours([...crew, { id: 'c', rate: 90, travels: false }], 8)).toBe(16);
  });
});

describe('travel inside a labor period', () => {
  const base = {
    id: 'p', days: 5, crew: [{ id: 'a', rate: 100, hrsPerDay: 8 }], otMult: 1,
  };

  it('is reported BESIDE labor, not folded into it', () => {
    // A card showing both must not be showing the same money twice.
    const r = calcLaborPeriodCost({ ...base, travelHrs: 8 }, {});
    expect(r.labor).toBe(100 * 8 * 5);
    expect(r.travel).toBe(800);
    expect(r.total).toBe(r.labor + r.travel + r.oot);
  });

  it('changes nothing on a period that has none', () => {
    const r = calcLaborPeriodCost(base, {});
    expect(r.travel).toBe(0);
    expect(r.total).toBe(r.labor + r.oot);
  });

  it('stays straight time on a night period unless told otherwise', () => {
    const night = { ...base, isNight: true, nightMult: 1.5, travelHrs: 8 };
    expect(calcLaborPeriodCost(night, {}).travel).toBe(800);
    expect(calcLaborPeriodCost({ ...night, travelPremium: true }, {}).travel).toBe(800 * 1.5);
  });

  it('works the same on a whole-job flat crew', () => {
    const r = calcFlatJobCost({ weeks: 2, daysPerWeek: 5, crew: base.crew, travelHrs: 6 }, {});
    expect(r.travel).toBe(600);
    expect(r.total).toBe(r.labor + r.travel + r.oot);
  });
});

// ── WHICH CATEGORY IT LANDS IN ──────────────────────────────────────────────
// A Food Lion bid letter requires the price split into Materials / Refrigerant
// / Labor / Out of Town. Travel sitting in the per-diem put paid hours in the
// reimbursables column. This is the assertion that says it moved.
describe('travel on a bid letter', () => {
  it('is counted as LABOR, not as out of town', async () => {
    const { computeBidTotals, bidLetterBreakdown } = await import('../steps/bidTotals.js');
    const state = {
      mode: 'Commercial Refrigeration',
      laborPeriods: [{
        id: 'p', days: 5, crew: [{ id: 'a', rate: 100, hrsPerDay: 8, travels: true }],
        otMult: 1, ootPerDay: 120, travelHrs: 8,
      }],
      lineItems: [],
    };
    const totals = computeBidTotals(state, 20);
    const b = bidLetterBreakdown(state, totals);

    // Out of town is the per diem and nothing else: 5 days x $120.
    expect(b.oot).toBe(600);
    // Labor is the work plus the drive: 5 x 8 x $100, plus 8 x $100.
    expect(b.labor).toBeCloseTo(4000 + 800, 2);
  });

  it('drops out with the labor on a time-and-materials job, not with the per diem', async () => {
    const { computeBidTotals } = await import('../steps/bidTotals.js');
    const base = {
      mode: 'Commercial Refrigeration',
      laborPeriods: [{
        id: 'p', days: 5, crew: [{ id: 'a', rate: 100, hrsPerDay: 8, travels: true }],
        otMult: 1, ootPerDay: 120, travelHrs: 8,
      }],
      lineItems: [], bidMethod: TIME_AND_MATERIALS,
    };
    // The crew still sleeps away from home whichever way the job is priced, so
    // the per diem survives — but the hours, travel among them, do not.
    expect(computeBidTotals(base, 20).laborTotal).toBe(600);
  });
});
