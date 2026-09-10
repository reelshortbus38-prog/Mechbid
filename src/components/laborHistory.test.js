import { describe, it, expect, afterEach } from 'vitest';
import {
  newLaborRecord, recordFromEstimate, recordRatio, laborHistorySummary,
  suggestedUnitScale, scaleLaborUnits, loadLaborHistory, saveLaborHistory,
  SCALABLE_UNITS, MIN_JOBS_FOR_TREND, WIDE_SPREAD,
  recordBasis, comparableHours, BASIS_ACTUAL, BASIS_BID,
} from './laborHistory.js';
import { DEFAULT_LABOR_UNITS, estimateCircuitLabor } from '../state/store.js';

const job = (estHours, actHours, extra = {}) =>
  newLaborRecord({ estHours, actHours, ...extra });

describe('newLaborRecord', () => {
  it('keeps the job SHAPE beside the hours', () => {
    // A ratio with no shape cannot be argued with later. An estimator looking
    // at 1.4x wants to know whether that was forty circuits or four.
    const r = newLaborRecord({ estHours: 100, actHours: 130, circuits: 11, ft: 1650, joints: 90, cases: 40 });
    expect(r).toMatchObject({ estHours: 100, actHours: 130, circuits: 11, ft: 1650, joints: 90, cases: 40 });
  });

  it('dates itself and gives itself an id', () => {
    const r = newLaborRecord({ estHours: 10, actHours: 10 });
    expect(r.id).toMatch(/^lh_/);
    expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('refuses negative hours rather than storing them', () => {
    expect(newLaborRecord({ estHours: -5, actHours: -1 })).toMatchObject({ estHours: 0, actHours: 0 });
  });

  it('defaults to a remodel, which is the job most of these are', () => {
    expect(newLaborRecord({}).projectType).toBe('remodel');
  });
});

describe('recordFromEstimate', () => {
  it('records exactly what was priced, not a re-derivation', () => {
    const circuits = [
      { circuitId: 'A1', runLength: 150, riserLength: 12, sucHoriz: '1-1/8', liqHoriz: '1/2', caseCount: 6 },
      { circuitId: 'A2', runLength: 90, riserLength: 0, sucHoriz: '7/8', liqHoriz: '3/8', caseCount: 3 },
    ];
    const est = estimateCircuitLabor(circuits, DEFAULT_LABOR_UNITS);
    const r = recordFromEstimate({ projName: 'Store 47', projectType: 'new', mode: 'Commercial Refrigeration' }, est);
    expect(r.name).toBe('Store 47');
    expect(r.projectType).toBe('new');
    expect(r.estHours).toBe(est.totalHours);
    expect(r.circuits).toBe(2);
    expect(r.cases).toBe(9);
    expect(r.ft).toBe(est.perCircuit.reduce((s, p) => s + p.ft, 0));
    // Nothing actual yet — that is the whole point of closing out later.
    expect(r.actHours).toBe(0);
  });
});

describe('recordRatio', () => {
  it('is actual over estimated', () => {
    expect(recordRatio(job(100, 130))).toBeCloseTo(1.3, 5);
  });

  it('is null until BOTH numbers are real', () => {
    expect(recordRatio(job(100, 0))).toBeNull();
    expect(recordRatio(job(0, 130))).toBeNull();
    expect(recordRatio(undefined)).toBeNull();
  });
});

describe('laborHistorySummary', () => {
  it('weights by hours, not by job', () => {
    // A twelve-hundred hour store and a forty-hour callout must not carry the
    // same weight in a number that is about to scale everybody's units.
    // Totals: 1240 est, 1280 act → 1.032. Averaging the ratios gives 1.13.
    const s = laborHistorySummary([job(1200, 1200), job(40, 80)]);
    expect(s.ratio).toBeCloseTo(1280 / 1240, 3);
    expect(s.ratio).toBeLessThan(1.1);
  });

  it('reports the spread, because an average can describe nothing', () => {
    const s = laborHistorySummary([job(100, 80), job(100, 160), job(100, 120)]);
    expect(s.low).toBeCloseTo(0.8, 3);
    expect(s.high).toBeCloseTo(1.6, 3);
    expect(s.spread).toBeCloseTo(0.8, 3);
    expect(s.wide).toBe(true);
  });

  it('ignores jobs that were never closed out', () => {
    const s = laborHistorySummary([job(100, 120), job(100, 0), job(0, 50)]);
    expect(s.jobs).toBe(1);
  });

  it('is null when nothing has been closed out at all', () => {
    expect(laborHistorySummary([])).toBeNull();
    expect(laborHistorySummary([job(100, 0)])).toBeNull();
  });

  it('splits new construction from remodels when asked', () => {
    // "On remodels those numbers will always be different. New jobs would be a
    // more accurate assessment."
    const rows = [
      job(100, 105, { projectType: 'new' }),
      job(100, 150, { projectType: 'remodel' }),
      job(100, 160, { projectType: 'remodel' }),
    ];
    expect(laborHistorySummary(rows, { projectType: 'new' }).ratio).toBeCloseTo(1.05, 3);
    expect(laborHistorySummary(rows, { projectType: 'remodel' }).ratio).toBeCloseTo(1.55, 3);
    expect(laborHistorySummary(rows).jobs).toBe(3);
  });
});

// ── WHAT IT REFUSES TO CLAIM ────────────────────────────────────────────────
// The whole risk in this feature is a shop scaling its units off one unlucky
// job. These are the guards.
describe('suggestedUnitScale', () => {
  it('says nothing useful below three jobs', () => {
    const s = suggestedUnitScale([job(100, 140), job(100, 145)]);
    expect(s.confidence).toBe('none');
    expect(s.note).toMatch(/rained-off week|not a trend/);
    expect(MIN_JOBS_FOR_TREND).toBe(3);
  });

  it('calls it weak when the jobs disagree with each other', () => {
    // 0.8 and 1.6 average to 1.2, which is true of neither.
    const s = suggestedUnitScale([job(100, 80), job(100, 160), job(100, 120)]);
    expect(s.confidence).toBe('weak');
    expect(s.note).toMatch(/true of none of them/);
    expect(WIDE_SPREAD).toBe(0.5);
  });

  it('calls it fair when enough jobs agree', () => {
    const s = suggestedUnitScale([job(100, 125), job(200, 250), job(150, 190)]);
    expect(s.confidence).toBe('fair');
    expect(s.factor).toBeGreaterThan(1.2);
  });

  it('never says good, because three jobs is three jobs', () => {
    const many = Array.from({ length: 20 }, () => job(100, 130));
    expect(suggestedUnitScale(many).confidence).toBe('fair');
  });

  it('is null with no closed jobs at all', () => {
    expect(suggestedUnitScale([])).toBeNull();
  });
});

describe('scaleLaborUnits', () => {
  it('scales the RATES and leaves the quantities alone', () => {
    // A stick length and a joint count are quantities. Multiplying them by 1.2
    // would invent pipe rather than time.
    const out = scaleLaborUnits(DEFAULT_LABOR_UNITS, 1.2);
    for (const k of SCALABLE_UNITS) {
      expect(out[k], k).toBeCloseTo(DEFAULT_LABOR_UNITS[k] * 1.2, 4);
    }
    expect(out.stickLength).toBe(DEFAULT_LABOR_UNITS.stickLength);
    expect(out.coilLength).toBe(DEFAULT_LABOR_UNITS.coilLength);
    expect(out.jointsPerCircuit).toBe(DEFAULT_LABOR_UNITS.jointsPerCircuit);
    expect(out.jointsPerRiser).toBe(DEFAULT_LABOR_UNITS.jointsPerRiser);
    expect(out.clusterFactor).toBe(DEFAULT_LABOR_UNITS.clusterFactor);
  });

  it('keeps the third decimal, which is real on a number this small', () => {
    expect(scaleLaborUnits({ perFtSmall: 0.03 }, 1.25).perFtSmall).toBe(0.0375);
  });

  it('refuses a factor that would zero the units out', () => {
    for (const bad of [0, -1, NaN, undefined, 'x']) {
      expect(scaleLaborUnits(DEFAULT_LABOR_UNITS, bad).perFtMed).toBe(DEFAULT_LABOR_UNITS.perFtMed);
    }
  });

  it('actually moves the estimate it is meant to move', () => {
    const circuits = [{ circuitId: 'A', runLength: 150, riserLength: 12, sucHoriz: '1-1/8' }];
    const base = estimateCircuitLabor(circuits, DEFAULT_LABOR_UNITS).totalHours;
    const scaled = estimateCircuitLabor(circuits, scaleLaborUnits(DEFAULT_LABOR_UNITS, 1.3)).totalHours;
    // The estimate rounds its total to a tenth of an hour, so this is
    // proportional to within that rounding rather than exactly.
    expect(scaled).toBeCloseTo(base * 1.3, 0);
  });
});

// The suite runs in node, where there is no localStorage — the same stub the
// saveJob tests use.
describe('storage', () => {
  const real = globalThis.localStorage;
  afterEach(() => { globalThis.localStorage = real; });
  const stub = (initial) => {
    let v = initial;
    globalThis.localStorage = { getItem: () => v, setItem: (_k, val) => { v = val; }, removeItem() { v = null; } };
  };

  it('round-trips through the shop-wide store', () => {
    stub(null);
    const rows = [job(100, 130, { name: 'Store 47' })];
    expect(saveLaborHistory(rows)).toBe(true);
    expect(loadLaborHistory()).toEqual(rows);
  });

  it('survives a corrupted store rather than throwing', () => {
    stub('not json');
    expect(loadLaborHistory()).toEqual([]);
    stub('{"not":"an array"}');
    expect(loadLaborHistory()).toEqual([]);
  });

  it('reports a failed write instead of losing it silently', () => {
    // Same reasoning as saveJob: a shop that thinks its history is being kept
    // and is not would tune units off nothing.
    globalThis.localStorage = { getItem: () => null, setItem() { throw new Error('QuotaExceeded'); }, removeItem() {} };
    expect(saveLaborHistory([job(100, 130)])).toBe(false);
  });

  it('is empty rather than broken with no storage at all', () => {
    globalThis.localStorage = undefined;
    expect(loadLaborHistory()).toEqual([]);
    expect(saveLaborHistory([])).toBe(false);
  });
});

// ── BID HOURS: THE ANSWER YOU CAN HAVE THIS AFTERNOON ───────────────────────
// Actuals take months. An estimator trying the app out has what they bid the
// job at sitting in a folder right now, and waiting for a store to be built
// before the app says anything useful is how a trial quietly ends.
describe('comparing against what was bid', () => {
  const bidOnly = newLaborRecord({ estHours: 100, bidHours: 130 });
  const actOnly = newLaborRecord({ estHours: 100, actHours: 120 });
  const both = newLaborRecord({ estHours: 100, bidHours: 130, actHours: 150 });

  it('compares against the bid when that is all there is', () => {
    expect(recordBasis(bidOnly)).toBe(BASIS_BID);
    expect(recordRatio(bidOnly)).toBeCloseTo(1.3, 5);
  });

  it('prefers ACTUAL over bid, because only one of them is evidence', () => {
    expect(recordBasis(both)).toBe(BASIS_ACTUAL);
    expect(recordRatio(both)).toBeCloseTo(1.5, 5);
  });

  it('can be asked for the bid comparison specifically', () => {
    expect(recordRatio(both, BASIS_BID)).toBeCloseTo(1.3, 5);
    // And says nothing rather than falling back when that basis is missing.
    expect(recordRatio(actOnly, BASIS_BID)).toBeNull();
    expect(recordRatio(bidOnly, BASIS_ACTUAL)).toBeNull();
  });

  it('is null until the app has an estimate to compare to', () => {
    expect(recordBasis(newLaborRecord({ estHours: 0, bidHours: 100 }))).toBeNull();
  });

  it('reports which basis a summary is standing on', () => {
    expect(laborHistorySummary([bidOnly, newLaborRecord({ estHours: 200, bidHours: 260 })]).basis).toBe(BASIS_BID);
    expect(laborHistorySummary([actOnly]).basis).toBe(BASIS_ACTUAL);
  });

  it('calls a mixed set mixed rather than whichever came first', () => {
    expect(laborHistorySummary([bidOnly, actOnly]).basis).toBe('mixed');
  });

  it('filters to one basis when asked', () => {
    const rows = [bidOnly, actOnly, both];
    // Only the two with a bid on them, compared on their bids.
    const s = laborHistorySummary(rows, { basis: BASIS_BID });
    expect(s.jobs).toBe(2);
    expect(s.basis).toBe(BASIS_BID);
  });

  it('says out loud that agreeing with an estimator is not being right', () => {
    const rows = [
      newLaborRecord({ estHours: 100, bidHours: 130 }),
      newLaborRecord({ estHours: 200, bidHours: 258 }),
      newLaborRecord({ estHours: 150, bidHours: 190 }),
    ];
    const s = suggestedUnitScale(rows);
    expect(s.confidence).toBe('fair');
    expect(s.basis).toBe(BASIS_BID);
    expect(s.note).toMatch(/BID hours, not built ones/);
    expect(s.note).toMatch(/not the same as either of you being right/);
  });

  it('drops the caveat once the jobs are built', () => {
    const rows = [
      newLaborRecord({ estHours: 100, actHours: 130 }),
      newLaborRecord({ estHours: 200, actHours: 258 }),
      newLaborRecord({ estHours: 150, actHours: 190 }),
    ];
    const s = suggestedUnitScale(rows);
    expect(s.basis).toBe(BASIS_ACTUAL);
    expect(s.note).not.toMatch(/BID hours/);
  });

  it('warns when a set mixes the two questions together', () => {
    const rows = [
      newLaborRecord({ estHours: 100, bidHours: 130 }),
      newLaborRecord({ estHours: 200, actHours: 258 }),
      newLaborRecord({ estHours: 150, actHours: 190 }),
    ];
    expect(suggestedUnitScale(rows).note).toMatch(/answer different questions/);
  });
});

// ── THE SMALL JOB PROBLEM ───────────────────────────────────────────────────
// The circuit estimate is pipe work. It has never covered driving to the store,
// staging, getting the lift, or cleaning up and writing the ticket. On a
// twenty-circuit remodel that is a rounding error. On a one-day service call it
// can be half the day, and comparing the whole ticket against a pipe estimate
// would read as the units being 50% light when they were right about the pipe.
describe('hours the estimate never covered', () => {
  it('takes them off before comparing', () => {
    // A ten-hour ticket with three hours of drive, staging and cleanup is a
    // seven-hour comparison against a pipe estimate.
    const r = newLaborRecord({ estHours: 7, actHours: 10, outsideHours: 3 });
    expect(comparableHours(r, BASIS_ACTUAL)).toBe(7);
    expect(recordRatio(r)).toBeCloseTo(1, 5);
  });

  it('changes nothing when left at zero, which is the big-job answer', () => {
    const r = newLaborRecord({ estHours: 100, actHours: 130 });
    expect(comparableHours(r, BASIS_ACTUAL)).toBe(130);
    expect(recordRatio(r)).toBeCloseTo(1.3, 5);
  });

  it('does not touch a BID, which is a number for the same scope', () => {
    const r = newLaborRecord({ estHours: 100, bidHours: 130, outsideHours: 40 });
    expect(comparableHours(r, BASIS_BID)).toBe(130);
    expect(recordRatio(r, BASIS_BID)).toBeCloseTo(1.3, 5);
  });

  it('treats a typo as a typo rather than a negative job', () => {
    const r = newLaborRecord({ estHours: 5, actHours: 8, outsideHours: 20 });
    expect(comparableHours(r, BASIS_ACTUAL)).toBe(0);
    // With nothing comparable left it is not usable as an actual at all.
    expect(recordBasis(r, BASIS_ACTUAL)).toBeNull();
  });

  it('rolls into the summary on the comparable hours, not the ticket', () => {
    const rows = [
      newLaborRecord({ estHours: 7, actHours: 10, outsideHours: 3 }),
      newLaborRecord({ estHours: 14, actHours: 20, outsideHours: 6 }),
      newLaborRecord({ estHours: 21, actHours: 30, outsideHours: 9 }),
    ];
    const s = laborHistorySummary(rows);
    expect(s.actHours).toBe(42);      // not the 60 that was billed
    expect(s.ratio).toBeCloseTo(1, 3);
  });
});
