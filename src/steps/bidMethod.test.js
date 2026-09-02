import { describe, it, expect } from 'vitest';
import {
  resolveBidMethod, billedLabor, crewCoverage, escalationFit,
  LUMP_SUM, TIME_AND_MATERIALS, UNSET, METHOD_BLURB, MATERIALS_NOTE,
} from './bidMethod.js';
import { computeBidTotals } from './bidTotals.js';
import { initialState } from '../state/store.js';

// A job with BOTH methods populated: crew periods off the schedule, and field
// tasks generated from the circuits. Before the switch existed the bid carried
// the running labor twice.
const crew = [{ id: 'c1', role: 'Technician', rate: 100, hrsPerDay: 8 }];
const job = overrides => ({
  ...initialState,
  mode: 'Commercial Refrigeration',
  laborMode: 'periods',
  laborPeriods: [{ id: 'p1', name: 'Medium Temp Cases', crew, days: 10, isNight: true, otMult: 1, nightMult: 1, ootPerDay: 0 }],
  fieldTasks: [{ id: 't1', desc: 'Run & connect C1', men: 2, hrs: 10, mode: 'Commercial Refrigeration' }],
  rackTasks: [],
  ...overrides,
});

describe('reading the method off a job', () => {
  it('recognises the two real methods', () => {
    expect(resolveBidMethod(LUMP_SUM)).toBe(LUMP_SUM);
    expect(resolveBidMethod(TIME_AND_MATERIALS)).toBe(TIME_AND_MATERIALS);
  });

  it('treats anything else as not chosen', () => {
    // Including a job saved before this setting existed.
    for (const v of [undefined, null, '', 'lump', 'T&M', 0, {}]) {
      expect(resolveBidMethod(v), JSON.stringify(v)).toBe(UNSET);
    }
  });
});

describe('which side of the labor reaches the bid', () => {
  it('gives the total to the crew periods on a lump-sum job', () => {
    expect(billedLabor(LUMP_SUM)).toEqual({ periods: true, tasks: false });
  });

  it('gives it to the task list on time and materials', () => {
    expect(billedLabor(TIME_AND_MATERIALS)).toEqual({ periods: false, tasks: true });
  });

  it('bills both when nobody has chosen — the old behaviour, unchanged', () => {
    // This is the whole backwards-compatibility contract. Silently assigning a
    // method to an already-quoted job would change what it totals.
    expect(billedLabor(undefined)).toEqual({ periods: true, tasks: true });
  });
});

describe('a bid stops carrying its labor twice', () => {
  const both = computeBidTotals(job(), 20);
  const lump = computeBidTotals(job({ bidMethod: LUMP_SUM }), 20);
  const tm = computeBidTotals(job({ bidMethod: TIME_AND_MATERIALS }), 20);

  it('lump sum drops the task hours out of the total', () => {
    expect(lump.fieldTasksTotal).toBe(0);
    expect(lump.laborTotal).toBeGreaterThan(0);
    expect(lump.total).toBeLessThan(both.total);
  });

  it('time and materials drops the crew labor out of the total', () => {
    expect(tm.fieldTasksTotal).toBeGreaterThan(0);
    expect(tm.total).toBeLessThan(both.total);
  });

  it('an unset job totals exactly what it did before the switch existed', () => {
    // Every saved job on every device is in this state until someone picks.
    expect(both.laborTotal).toBeGreaterThan(0);
    expect(both.fieldTasksTotal).toBeGreaterThan(0);
    expect(both.total).toBeCloseTo(lump.total + tm.fieldTasksTotal, 2);
  });

  it('says what is sitting outside the bid rather than losing it quietly', () => {
    expect(lump.unbilledTaskLabor).toBeGreaterThan(0);
    expect(lump.unbilledPeriodLabor).toBe(0);
    expect(tm.unbilledPeriodLabor).toBeGreaterThan(0);
    expect(tm.unbilledTaskLabor).toBe(0);
  });
});

describe('per diem survives the switch', () => {
  // Out-of-town is a reimbursable with its own bid category. The crew sleeps
  // away from home whichever way the labor is priced, so dropping the periods
  // must not drop the per diem with them.
  const withOot = o => job({ ...o, outOfTown: true, ootBasis: 'person',
    laborPeriods: [{ id: 'p1', name: 'Nights', crew, days: 10, isNight: true, otMult: 1, nightMult: 1, ootPerDay: 150 }] });

  it('keeps the per diem on a time-and-materials job', () => {
    const tm = computeBidTotals(withOot({ bidMethod: TIME_AND_MATERIALS }), 20);
    // The periods contribute their per diem and nothing else.
    expect(tm.laborTotal).toBeGreaterThan(0);
    expect(tm.unbilledPeriodLabor).toBeGreaterThan(0);
  });

  it('does not mark up or consume on per diem it is only passing through', () => {
    const tm = computeBidTotals(withOot({ bidMethod: TIME_AND_MATERIALS, laborRateBasis: 'cost' }), 20);
    const noOot = computeBidTotals(job({ bidMethod: TIME_AND_MATERIALS, laborRateBasis: 'cost' }), 20);
    // Labor markup rides on the billed task labor either way — the per diem
    // must not swell it.
    expect(tm.laborMarkupAmt).toBeCloseTo(noOot.laborMarkupAmt, 2);
  });
});

describe('what a lump-sum job gets out of the unit build-up instead', () => {
  it('compares the hours bought against the hours the takeoff implies', () => {
    const c = crewCoverage({ crewManHours: 480, takeoffManHours: 190 });
    expect(c.level).toBe('ok');
    expect(c.note).toMatch(/480/);
    expect(c.note).toMatch(/190/);
  });

  it('flags crews that do not even cover the circuit work', () => {
    // Nothing left for demo, setting cases, rack prep or punch.
    const c = crewCoverage({ crewManHours: 150, takeoffManHours: 190 });
    expect(c.level).toBe('short');
    expect(c.note).toMatch(/nothing for demo/i);
  });

  it('mentions it when the crews run very wide of the takeoff', () => {
    const c = crewCoverage({ crewManHours: 900, takeoffManHours: 190 });
    expect(c.level).toBe('loose');
    expect(c.note).toMatch(/4\.7×/);
  });

  it('stays quiet when either side is missing', () => {
    expect(crewCoverage({ crewManHours: 0, takeoffManHours: 190 })).toBe(null);
    expect(crewCoverage({ crewManHours: 480, takeoffManHours: 0 })).toBe(null);
    expect(crewCoverage()).toBe(null);
  });
});

describe('what each method tells the estimator', () => {
  it('warns in the unset blurb that the labor may be in twice', () => {
    expect(METHOD_BLURB[UNSET]).toMatch(/BOTH/);
    expect(METHOD_BLURB[UNSET]).toMatch(/twice/i);
  });

  it('says the other side stays visible rather than deleted', () => {
    expect(METHOD_BLURB[LUMP_SUM]).toMatch(/cross-check|scope/i);
    expect(METHOD_BLURB[TIME_AND_MATERIALS]).toMatch(/schedule/i);
  });

  it('never lets a blurb imply the crew price is the whole bid', () => {
    // "On crew jobs they still have to calculate the materials." A blurb that
    // says the crew "carries the price" reads as the whole number, and it is
    // the labor half of it.
    for (const m of [LUMP_SUM, TIME_AND_MATERIALS, UNSET]) {
      expect(METHOD_BLURB[m], m).toMatch(/LABOR/);
      expect(METHOD_BLURB[m], m).toMatch(/material/i);
    }
    expect(MATERIALS_NOTE).toMatch(/takeoff, markup, tax and escalation/i);
  });
});

describe('materials are untouched by the labor method', () => {
  it('prices the same materials whichever way the labor is bid', () => {
    // The switch governs one half of the bid. A crew job still has its copper,
    // fittings, insulation and parts taken off and marked up identically.
    const withMats = m => computeBidTotals(job({
      bidMethod: m,
      lineItems: [{ id: 'm1', desc: 'ACR Copper 1-3/8"', qty: 400, unitCost: 9.5, total: 3800 }],
    }), 20);
    const lump = withMats(LUMP_SUM);
    const tm = withMats(TIME_AND_MATERIALS);
    expect(lump.markupBase).toBe(tm.markupBase);
    expect(lump.markupAmt).toBe(tm.markupAmt);
    expect(lump.taxAmt).toBe(tm.taxAmt);
    expect(lump.matsTotal).toEqual(tm.matsTotal);
  });
});

describe('escalation is a fixed-price risk', () => {
  it('questions escalation carried on a time-and-materials bid', () => {
    // Escalation covers copper moving between quoting and buying, which the
    // shop absorbs on a fixed price. Billed at cost as it is used, that
    // movement passes through to the customer instead.
    const f = escalationFit(TIME_AND_MATERIALS, 8);
    expect(f).toBeTruthy();
    expect(f.pct).toBe(8);
    expect(f.note).toMatch(/passes through/i);
  });

  it('leaves it alone on a lump-sum job, where it belongs', () => {
    expect(escalationFit(LUMP_SUM, 8)).toBe(null);
  });

  it('says nothing when no escalation is carried', () => {
    expect(escalationFit(TIME_AND_MATERIALS, 0)).toBe(null);
    expect(escalationFit(TIME_AND_MATERIALS, undefined)).toBe(null);
  });

  it('does not decide for the estimator', () => {
    // A not-to-exceed or a fixed material component is a real thing. This
    // raises the question; it never zeroes a live number.
    expect(escalationFit(TIME_AND_MATERIALS, 8).note).toMatch(/leave it if/i);
  });
});
