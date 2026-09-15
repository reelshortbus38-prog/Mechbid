import { describe, it, expect } from 'vitest';
import {
  travelCost, travelManHours, calcLaborPeriodCost, calcFlatJobCost, jobCrewManHours,
  calcManHoursCost, jobLaborTotal, jobCrew, jobOOTTotal, otReview, calcFieldTaskCost,
} from './store.js';
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

// ── THE HOURS SIDE OF LABOR ─────────────────────────────────────────────────
// The cost side was complete and this was not, so nothing could ask whether
// the crews on a job cover the work the takeoff implies. crewCoverage in
// steps/bidMethod.js was written for that comparison and had nothing to
// compare.
describe('jobCrewManHours', () => {
  const man = (rate, hrsPerDay, extra = {}) => ({ id: String(Math.random()), rate, hrsPerDay, ...extra });

  it('counts every man-hour a period buys', () => {
    const state = { laborPeriods: [{ crew: [man(60, 8), man(50, 8)], days: 10 }] };
    expect(jobCrewManHours(state).work).toBe(160);   // 2 men x 8 hrs x 10 days
  });

  it('adds the periods up', () => {
    const state = { laborPeriods: [
      { crew: [man(60, 8)], days: 5 },
      { crew: [man(60, 10), man(50, 10)], days: 4 },
    ] };
    expect(jobCrewManHours(state).work).toBe(40 + 80);
  });

  it('uses the standard day for a man with no hours set', () => {
    // Same default the COST side uses. A second definition here could drift
    // from it, and then the hours and the money would describe different jobs.
    expect(jobCrewManHours({ laborPeriods: [{ crew: [{ rate: 60 }], days: 1 }] }).work).toBe(8);
  });

  it('reads a flat whole-job crew off weeks x days per week', () => {
    const state = { laborMode: 'flat', flatJob: { crew: [man(60, 8), man(50, 8)], weeks: 2, daysPerWeek: 5 } };
    expect(jobCrewManHours(state).work).toBe(160);   // 2 men x 8 x 10 days
  });

  it('defaults a flat job to a five-day week', () => {
    const state = { laborMode: 'flat', flatJob: { crew: [man(60, 8)], weeks: 1 } };
    expect(jobCrewManHours(state).work).toBe(40);
  });

  it('keeps travel OUT of the work hours, and reports it', () => {
    // An hour in the truck is paid and it is not running pipe. Folding it in
    // would make a crew that is short look covered.
    const crew = [man(60, 8, { travels: true }), man(50, 8, { travels: true })];
    const state = { laborPeriods: [{ crew, days: 10, travelHrs: 8 }] };
    const h = jobCrewManHours(state);
    expect(h.work).toBe(160);
    expect(h.travel).toBe(16);
    expect(h.total).toBe(176);
  });

  it('counts travel only for the men who travel', () => {
    const state = { laborPeriods: [{
      crew: [man(60, 8, { travels: true }), man(50, 8, { travels: false })],
      days: 1, travelHrs: 8,
    }] };
    expect(jobCrewManHours(state).travel).toBe(8);
  });

  it('is zero rather than broken on an empty or junk job', () => {
    expect(jobCrewManHours({}).work).toBe(0);
    expect(jobCrewManHours(undefined)).toEqual({ work: 0, travel: 0, total: 0 });
    expect(jobCrewManHours({ laborMode: 'flat', flatJob: {} }).work).toBe(0);
    expect(jobCrewManHours({ laborPeriods: [{ crew: [], days: 10 }] }).work).toBe(0);
  });
});

// ── MAN-HOURS AND MATERIAL, WHICH IS HOW RESIDENTIAL IS BID ─────────────────
// "Generally for residential HVAC the job is bid in man hours and material."
// The app made you construct a crew and a day count to say "sixteen hours",
// which is the app asking a question the trade does not ask.
//
// A THIRD MODE rather than another box: crew periods and a flat whole-job crew
// already compete for the same total and the bid engine picks one. A third
// input beside them would be the double-count this app keeps removing.
describe('man-hours mode', () => {
  const job = (hours, rate) => ({ laborMode: 'manhours', manHoursJob: { hours, rate } });

  it('is hours times rate and nothing else', () => {
    expect(calcManHoursCost({ hours: 16, rate: 95 }).total).toBe(1520);
    expect(jobLaborTotal(job(16, 95))).toBe(1520);
  });

  it('carries the same fields as the other two modes', () => {
    // Callers do `total - oot` and read `.labor`. A missing field is NaN in a
    // bid, not a zero.
    const r = calcManHoursCost({ hours: 10, rate: 100 });
    expect(r).toMatchObject({ hours: 10, rate: 100, labor: 1000, travel: 0, oot: 0, total: 1000 });
  });

  it('reports the hours straight back, with nothing to derive', () => {
    expect(jobCrewManHours(job(16, 95))).toEqual({ work: 16, travel: 0, total: 16 });
  });

  it('carries no per diem, because it exists for a local changeout', () => {
    // A travelling job uses periods or a flat crew; both have the out-of-town
    // fields on them.
    expect(jobOOTTotal(job(16, 95))).toBe(0);
  });

  it('hands tasks a crew at the entered rate rather than the fallback', () => {
    // Rack and field tasks cost themselves at avgCrewRate(jobCrew). Without a
    // synthetic member they would quietly cost at the $100 fallback instead of
    // the shop's own rate.
    const crew = jobCrew(job(16, 95));
    expect(crew).toHaveLength(1);
    expect(crew[0].rate).toBe(95);
    expect(calcFieldTaskCost({ men: 2, hrs: 4 }, crew)).toBe(2 * 4 * 95);
  });

  it('gives no crew at all when no rate has been set', () => {
    // Better than a member at $0, which would silently cost every task at
    // nothing.
    expect(jobCrew(job(16, 0))).toEqual([]);
  });

  it('says nothing about overtime, because there is no shift to have one', () => {
    expect(otReview(job(40, 95))).toBe(null);
  });

  it('is zero rather than broken on a blank or junk entry', () => {
    expect(jobLaborTotal(job(0, 0))).toBe(0);
    expect(jobLaborTotal({ laborMode: 'manhours' })).toBe(0);
    expect(calcManHoursCost().total).toBe(0);
    expect(calcManHoursCost({ hours: -5, rate: 'x' }).total).toBe(0);
  });

  it('leaves the other two modes exactly as they were', () => {
    // Nothing about adding a mode may move a job that is not in it.
    const periods = { laborPeriods: [{ crew: [{ rate: 60, hrsPerDay: 8 }], days: 10 }] };
    expect(jobLaborTotal(periods)).toBe(60 * 8 * 10);
    const flat = { laborMode: 'flat', flatJob: { crew: [{ rate: 60, hrsPerDay: 8 }], weeks: 1, daysPerWeek: 5 } };
    expect(jobLaborTotal(flat)).toBe(60 * 8 * 5);
  });
});
