import { describe, it, expect, afterEach } from 'vitest';
import {
  saveJob, getLastSaveError,
  normalizePipeSize, pipeSizeBucket,
  calcLaborPeriodCost, calcRackTaskCost, calcRackLaborTotal,
  calcFieldTaskCost, calcFieldTasksTotal, avgCrewRate,
  estimateCircuitLabor, DEFAULT_LABOR_UNITS, defaultHvacPrice,
  ootCost, crewTravelCount, ootBasisComparison, jobOOTTotal,
  calcFlatJobCost, DEFAULT_OOT_BASIS, initialState, jobLaborTotal,
  crewDayCost, dayHourSplit, otReview, STANDARD_DAY_HOURS,
  memberOtHours, otRuleConflict, STANDARD_WEEK_HOURS, DAYS_PER_WEEK_OPTIONS,
} from './store.js';
import { emlToText, extractCalloutTasksFromText } from '../api/ai.js';

// These guard the "money math" — the numbers that land in a real bid. If any of
// these change unexpectedly, a future edit has altered what customers are quoted.

describe('normalizePipeSize', () => {
  it('maps decimals and quotes to fraction keys', () => {
    expect(normalizePipeSize('0.875')).toBe('7/8');
    expect(normalizePipeSize('1.125')).toBe('1-1/8');
    expect(normalizePipeSize('2.625')).toBe('2-5/8');
    expect(normalizePipeSize('1 3/8"')).toBe('1-3/8');
  });
});

describe('pipeSizeBucket', () => {
  it('buckets by size for labor units', () => {
    expect(pipeSizeBucket('1/2')).toBe('small');
    expect(pipeSizeBucket('7/8')).toBe('small');
    expect(pipeSizeBucket('1-1/8')).toBe('med');
    expect(pipeSizeBucket('1-3/8')).toBe('med');
    expect(pipeSizeBucket('1-5/8')).toBe('large');
    expect(pipeSizeBucket('2-1/8')).toBe('large');
  });
});

describe('calcLaborPeriodCost', () => {
  it('uses per-tech hours/day, days, OT and night multipliers', () => {
    const period = {
      crew: [{ rate: 100, hrsPerDay: 8 }, { rate: 50, hrsPerDay: 8 }],
      days: 2, otMult: 1, isNight: false, ootPerDay: 0,
    };
    // (100*8 + 50*8) * 2 days = 1200*2 = 2400
    expect(calcLaborPeriodCost(period).labor).toBe(2400);
  });

  it('honors a non-8-hour day', () => {
    const period = { crew: [{ rate: 100, hrsPerDay: 10 }], days: 1, otMult: 1 };
    expect(calcLaborPeriodCost(period).labor).toBe(1000);
  });

  it('applies OT and night multipliers and out-of-town per day', () => {
    const period = { crew: [{ rate: 100, hrsPerDay: 8 }], days: 1, otMult: 1.5, isNight: true, nightMult: 1.5, ootPerDay: 75 };
    // 100*8*1*1.5(ot)*1.5(night) = 1800 ; oot = 75
    const r = calcLaborPeriodCost(period);
    expect(r.labor).toBe(1800);
    expect(r.oot).toBe(75);
    expect(r.total).toBe(1875);
  });
});

describe('rack + field task costing', () => {
  const crew = [{ id: 'a', rate: 120 }, { id: 'b', rate: 80 }]; // avg 100

  it('costs a rack task by crew assignment when present', () => {
    const task = { hrs: 4, crewAssignment: { a: 1, b: 1 } };
    // (1*120 + 1*80) * 4 hrs = 800
    expect(calcRackTaskCost(task, crew)).toBe(800);
  });

  it('falls back to men x hours x avg crew rate', () => {
    const task = { hrs: 5, men: 2 }; // 2 * 5 * 100 = 1000
    expect(calcRackTaskCost(task, crew)).toBe(1000);
  });

  it('field task = men x hours x avg rate, and totals sum', () => {
    expect(calcFieldTaskCost({ men: 1, hrs: 3 }, crew)).toBe(300);
    expect(calcFieldTasksTotal([{ men: 1, hrs: 3 }, { men: 2, hrs: 1 }], crew)).toBe(500);
    expect(calcRackLaborTotal([{ hrs: 5, men: 2 }], crew)).toBe(1000);
  });

  it('uses the $100 fallback rate when no crew is set', () => {
    expect(avgCrewRate([])).toBe(0);
    expect(calcFieldTaskCost({ men: 1, hrs: 2 }, [])).toBe(200);
  });
});

describe('estimateCircuitLabor', () => {
  it('derives hours from footage, joints, case and rack allowances', () => {
    // 100ft, 7/8" suction (small bucket): run 100*0.06=6 ; joints ceil(100/20)+2=7 *0.4=2.8 ; +1.5 case +2 tie
    const { totalHours, perCircuit } = estimateCircuitLabor(
      [{ circuitId: 'A1', runLength: 100, riserLength: 0, sucHoriz: '7/8' }],
      DEFAULT_LABOR_UNITS,
    );
    expect(perCircuit[0].bucket).toBe('small');
    expect(totalHours).toBeCloseTo(12.3, 1);
  });

  it('returns zero for no circuits', () => {
    expect(estimateCircuitLabor([], DEFAULT_LABOR_UNITS).totalHours).toBe(0);
  });
});

describe('extractCalloutTasksFromText', () => {
  const text = [
    'DROP NEW B11 IN EXISTING CHASE. REWORK EXISTING B4, B5 AS NEEDED. GC TO DEMO, REPAIR CHASE',
    'DROP NEW C6 IN MEAT PREP. PIPE THRU WALL TO CASE TOP. GC TO COVER LINES',
    'CONNECT EXISTING A2 LINESET TO EXISTING B6 LINESET OVER TO-GO ROOM',
    'this line is not a callout and should be ignored',
  ].join('\n');

  it('is deterministic — identical output every run', () => {
    expect(extractCalloutTasksFromText(text)).toEqual(extractCalloutTasksFromText(text));
  });

  it('keeps one task per callout line and drops non-callouts', () => {
    const tasks = extractCalloutTasksFromText(text);
    expect(tasks).toHaveLength(3);
  });

  it('strips the GC TO… tail and pulls circuit IDs', () => {
    const tasks = extractCalloutTasksFromText(text);
    expect(tasks[0].desc).not.toMatch(/GC TO/i);
    expect(tasks[0].circuitRef).toContain('B11');
    expect(tasks[2].circuitRef).toContain('A2');
    expect(tasks[2].circuitRef).toContain('B6');
  });

  it('dedups identical callouts', () => {
    expect(extractCalloutTasksFromText('DROP NEW B11 IN CHASE\nDROP NEW B11 IN CHASE')).toHaveLength(1);
  });
});

describe('emlToText', () => {
  it('extracts the text/plain body from a simple multipart email', () => {
    const eml = [
      'From: a@b.com',
      'Content-Type: multipart/alternative; boundary="XYZ"',
      '',
      '--XYZ',
      'Content-Type: text/plain; charset="utf-8"',
      '',
      'Relocate cases 20,21 to back room',
      '--XYZ',
      'Content-Type: text/html',
      '',
      '<p>ignore me</p>',
      '--XYZ--',
      '',
    ].join('\n');
    expect(emlToText(eml)).toContain('Relocate cases 20,21');
  });
});

describe('defaultHvacPrice', () => {
  it('gives ballpark defaults for air devices by type', () => {
    expect(defaultHvacPrice('CD-1 — Ceiling Diffuser · 24x24 face · 8"ø neck')).toBe(55);
    expect(defaultHvacPrice('RG-1 — Return Grille · 24x24 face')).toBe(45);
    expect(defaultHvacPrice('TG-2 — Transfer Grille · 18x12 face')).toBe(40);
  });

  it('prices common misc HVAC items', () => {
    expect(defaultHvacPrice('Curb adapter')).toBe(450);
    expect(defaultHvacPrice('Programmable / BMS thermostat')).toBe(180);
    expect(defaultHvacPrice('Disconnect & whip')).toBe(85);
    expect(defaultHvacPrice('Refrigerant (R-410A / R-454B) by lb')).toBe(18);
  });

  it('leaves duct FOOTAGE lines at 0 (priced by the duct calculator)', () => {
    expect(defaultHvacPrice('Ductwork — 21x13 duct (supply)')).toBe(0);
    expect(defaultHvacPrice('Ductwork — 12x5 round duct (supply/exhaust)')).toBe(0);
  });

  it('does price the duct calculator’s purchase-unit lines', () => {
    expect(defaultHvacPrice('Galvanized rectangular duct, 24 ga — fabricated')).toBe(4.5);
    expect(defaultHvacPrice('Duct wrap insulation, 1-1/2" FSK — 100 sq ft rolls')).toBe(115);
  });

  it('returns 0 for anything unknown', () => {
    expect(defaultHvacPrice('some random line')).toBe(0);
    expect(defaultHvacPrice('')).toBe(0);
  });
});

// A silent save failure is the worst bug an estimating tool can have — the
// estimator keeps building a bid that isn't being persisted. saveJob must
// report failure (return null + a reason) instead of swallowing it.
describe('saveJob failure reporting', () => {
  const realLS = globalThis.localStorage;
  afterEach(() => { globalThis.localStorage = realLS; });

  function stubStorage(setItem) {
    globalThis.localStorage = { getItem: () => '{}', setItem, removeItem() {} };
  }

  it('returns an id and clears the error on success', () => {
    let written = null;
    stubStorage((k, v) => { written = v; });
    const id = saveJob({ projName: 'Store 47', mode: 'Commercial Refrigeration' });
    expect(id).toBeTruthy();
    expect(getLastSaveError()).toBe('');
    expect(written).toContain('Store 47');
  });

  it('returns null and names the quota problem when storage is full', () => {
    stubStorage(() => { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; });
    expect(saveJob({ projName: 'Big Job' })).toBeNull();
    expect(getLastSaveError()).toMatch(/storage is full/i);
    expect(getLastSaveError()).toMatch(/delete old jobs|sign in/i); // tells them the fix
  });

  it('reports other failures too, without pretending they succeeded', () => {
    stubStorage(() => { throw new Error('boom'); });
    expect(saveJob({ projName: 'X' })).toBeNull();
    expect(getLastSaveError()).toMatch(/boom/);
  });

  it('strips session-scoped blob preview URLs so dead links are not persisted', () => {
    let written = '';
    stubStorage((k, v) => { written = v; });
    saveJob({ projName: 'J', uploadedFiles: [{ id: '1', name: 'plan.pdf', previewUrl: 'blob:http://x/y' }] });
    expect(written).toContain('plan.pdf');
    expect(written).not.toContain('blob:');
  });
});

// ── OUT-OF-TOWN EXPENSE ──────────────────────────────────────────────────────
describe('out-of-town expense', () => {
  const CREW = [{ rate: 100 }, { rate: 75 }, { rate: 75 }, { rate: 50 }];

  it('per person is what per diem actually is, and it is four times the old number', () => {
    // 27 weeks × 5 days = 135 days, crew of four, $150/day entered.
    expect(ootCost(135, 150, CREW, { ootBasis: 'crew' })).toBe(20250);
    expect(ootCost(135, 150, CREW, { ootBasis: 'person' })).toBe(81000);
  });

  it('defaults to the old basis, so no saved bid reprices itself', () => {
    // Jobs load as { ...initialState, ...saved }, so a default here reaches
    // every bid already on disk.
    expect(DEFAULT_OOT_BASIS).toBe('crew');
    expect(initialState.ootBasis).toBe('crew');
    expect(ootCost(135, 150, CREW)).toBe(20250);
  });

  it('an in-town job costs nothing without wiping the per-day figure', () => {
    expect(ootCost(135, 150, CREW, { ootBasis: 'person', outOfTown: false })).toBe(0);
    expect(ootCost(135, 150, CREW, { ootBasis: 'crew', outOfTown: false })).toBe(0);
  });

  it('counts only the crew actually away', () => {
    const mixed = [{ rate: 100 }, { rate: 75, travels: false }, { rate: 75 }, { rate: 50, travels: false }];
    expect(crewTravelCount(mixed)).toBe(2);
    expect(ootCost(135, 150, mixed, { ootBasis: 'person' })).toBe(40500);
  });

  it('treats a crew entered before travel flags existed as all travelling', () => {
    // Which is what the figure they typed assumed.
    expect(crewTravelCount(CREW)).toBe(4);
  });

  it('is zero when nothing was entered, on either basis', () => {
    expect(ootCost(135, 0, CREW, { ootBasis: 'person' })).toBe(0);
    expect(ootCost(0, 150, CREW, { ootBasis: 'person' })).toBe(0);
    expect(ootCost(135, 150, [], { ootBasis: 'person' })).toBe(0);
  });

  it('flows through a labor period', () => {
    const period = { crew: CREW, days: 10, ootPerDay: 150 };
    expect(calcLaborPeriodCost(period, { ootBasis: 'crew' }).oot).toBe(1500);
    expect(calcLaborPeriodCost(period, { ootBasis: 'person' }).oot).toBe(6000);
  });

  it('flows through a flat whole-job crew', () => {
    const flat = { crew: CREW, weeks: 27, daysPerWeek: 5, ootPerDay: 150 };
    expect(calcFlatJobCost(flat, { ootBasis: 'crew' }).oot).toBe(20250);
    expect(calcFlatJobCost(flat, { ootBasis: 'person' }).oot).toBe(81000);
  });

  it('does not touch the labor figure either way', () => {
    const period = { crew: CREW, days: 10, ootPerDay: 150 };
    const a = calcLaborPeriodCost(period, { ootBasis: 'crew' });
    const b = calcLaborPeriodCost(period, { ootBasis: 'person' });
    expect(a.labor).toBe(b.labor);
    expect(b.total - a.total).toBe(b.oot - a.oot);
  });

  it('reads the job total on whichever basis the job is set to', () => {
    const state = { laborMode: 'flat', flatJob: { crew: CREW, weeks: 27, daysPerWeek: 5, ootPerDay: 150 } };
    expect(jobOOTTotal({ ...state, ootBasis: 'crew' })).toBe(20250);
    expect(jobOOTTotal({ ...state, ootBasis: 'person' })).toBe(81000);
    expect(jobOOTTotal({ ...state, ootBasis: 'person', outOfTown: false })).toBe(0);
  });

  it('sums OOT across phased periods', () => {
    const state = {
      laborMode: 'periods', ootBasis: 'person',
      laborPeriods: [
        { crew: CREW, days: 10, ootPerDay: 150 },
        { crew: [{ rate: 100 }, { rate: 75 }], days: 5, ootPerDay: 150 },
      ],
    };
    expect(jobOOTTotal(state)).toBe(6000 + 1500);
  });
});

describe('what the other basis would cost', () => {
  const CREW = [{ rate: 100 }, { rate: 75 }, { rate: 75 }, { rate: 50 }];
  const state = {
    laborMode: 'flat', ootBasis: 'crew',
    flatJob: { crew: CREW, weeks: 27, daysPerWeek: 5, ootPerDay: 150 },
  };

  it('shows the estimator the number rather than asking them to imagine it', () => {
    const c = ootBasisComparison(state);
    expect(c.current).toBe(20250);
    expect(c.asOther).toBe(81000);
    expect(c.delta).toBe(60750);
    expect(c.travelers).toBe(4);
  });

  it('works in the other direction too', () => {
    const c = ootBasisComparison({ ...state, ootBasis: 'person' });
    expect(c.current).toBe(81000);
    expect(c.asOther).toBe(20250);
    expect(c.delta).toBe(-60750);
  });

  it('says nothing on a one-man crew, where the two bases agree', () => {
    const solo = { ...state, flatJob: { ...state.flatJob, crew: [{ rate: 100 }] } };
    expect(ootBasisComparison(solo)).toBeNull();
  });

  it('says nothing when no out-of-town figure was entered', () => {
    const none = { ...state, flatJob: { ...state.flatJob, ootPerDay: 0 } };
    expect(ootBasisComparison(none)).toBeNull();
  });

  it('says nothing on an in-town job — there is no choice to make', () => {
    expect(ootBasisComparison({ ...state, outOfTown: false })).toBeNull();
  });
});

describe('the bid decomposition holds on either basis', () => {
  const CREW = [{ rate: 100, hrsPerDay: 8 }, { rate: 75, hrsPerDay: 8 }, { rate: 75, hrsPerDay: 8 }, { rate: 50, hrsPerDay: 8 }];
  const base = { laborMode: 'flat', flatJob: { crew: CREW, weeks: 27, daysPerWeek: 5, ootPerDay: 150 } };

  // bidTotals shows labor and out-of-town as separate categories, computing
  // labor as (labor total MINUS oot). If those two read different bases the
  // difference vanishes out of the bid without anything on screen saying so.
  for (const ootBasis of ['crew', 'person']) {
    it(`labor total minus OOT is pure labor on the ${ootBasis} basis`, () => {
      const state = { ...base, ootBasis };
      const pureLabor = jobLaborTotal(state) - jobOOTTotal(state);
      // 4 men × 8 h × their rates × 135 days, with no travel in it at all.
      const expected = CREW.reduce((s, m) => s + m.rate * m.hrsPerDay, 0) * 135;
      expect(pureLabor).toBeCloseTo(expected, 6);
    });
  }

  it('switching basis moves the bid by exactly the OOT difference, not more', () => {
    const asCrew = { ...base, ootBasis: 'crew' };
    const asPerson = { ...base, ootBasis: 'person' };
    const laborDelta = jobLaborTotal(asPerson) - jobLaborTotal(asCrew);
    const ootDelta = jobOOTTotal(asPerson) - jobOOTTotal(asCrew);
    expect(laborDelta).toBe(ootDelta);
  });

  it('an in-town job carries labor and no travel', () => {
    const state = { ...base, ootBasis: 'person', outOfTown: false };
    expect(jobOOTTotal(state)).toBe(0);
    expect(jobLaborTotal(state)).toBe(CREW.reduce((s, m) => s + m.rate * m.hrsPerDay, 0) * 135);
  });
});

// ── OVERTIME ─────────────────────────────────────────────────────────────────
describe('overtime on a long day', () => {
  const CREW = Array.from({ length: 4 }, () => ({ rate: 75, hrsPerDay: 10 }));
  const DAYS = 135;

  it('the right answer was not expressible before — now it is', () => {
    // 4 men, $75, 10-hour days, 135 days.
    expect(crewDayCost(CREW, { otMult: 1 }) * DAYS).toBe(405000);              // all straight, short
    expect(crewDayCost(CREW, { otMult: 1.5 }) * DAYS).toBe(607500);            // blanket, over
    expect(crewDayCost(CREW, { otMult: 1.5, otAfterHours: 8 }) * DAYS).toBe(445500);
  });

  it('splits each man at his own hours, not the crew average', () => {
    const mixed = [{ rate: 100, hrsPerDay: 12 }, { rate: 50, hrsPerDay: 8 }];
    // 100 × (8 + 4×1.5) + 50 × 8 = 1400 + 400
    expect(crewDayCost(mixed, { otMult: 1.5, otAfterHours: 8 })).toBe(1800);
  });

  it('leaves an eight-hour day alone whatever the multiplier', () => {
    const eights = [{ rate: 75, hrsPerDay: 8 }];
    expect(crewDayCost(eights, { otMult: 1.5, otAfterHours: 8 })).toBe(600);
  });

  it('with no threshold the multiplier is a whole-shift premium — the old meaning', () => {
    // A Saturday or a shutdown: every hour is at premium and no threshold applies.
    expect(crewDayCost(CREW, { otMult: 1.5 })).toBe(crewDayCost(CREW, { otMult: 1 }) * 1.5);
  });

  it('defaults to the old behaviour, so no saved bid reprices itself', () => {
    expect(crewDayCost(CREW)).toBe(4 * 75 * 10);
    expect(calcLaborPeriodCost({ crew: CREW, days: 1 }).labor).toBe(3000);
  });

  it('a night shift premium still covers the whole shift, overtime and all', () => {
    const night = calcLaborPeriodCost({ crew: CREW, days: 1, isNight: true, nightMult: 1.5, otAfterHours: 8, otMult: 1.5 });
    const day = calcLaborPeriodCost({ crew: CREW, days: 1, otAfterHours: 8, otMult: 1.5 });
    expect(night.labor).toBe(day.labor * 1.5);
  });

  it('flat mode honours overtime, which it previously ignored entirely', () => {
    const flat = { crew: CREW, weeks: 27, daysPerWeek: 5 };
    expect(calcFlatJobCost(flat).labor).toBe(405000);
    expect(calcFlatJobCost({ ...flat, otMult: 1.5, otAfterHours: 8 }).labor).toBe(445500);
  });

  it('reports the hour split for showing on screen', () => {
    expect(dayHourSplit(CREW, 8)).toEqual({ straight: 32, ot: 8 });
    expect(dayHourSplit(CREW, 0)).toEqual({ straight: 40, ot: 0 });
  });

  it('handles a crew with no hours entered as standard days', () => {
    expect(crewDayCost([{ rate: 100 }], { otAfterHours: 8, otMult: 1.5 })).toBe(800);
    expect(crewDayCost([], { otAfterHours: 8 })).toBe(0);
  });
});

describe('overtime review', () => {
  const CREW = Array.from({ length: 4 }, () => ({ rate: 75, hrsPerDay: 10 }));
  const flatState = h => ({ laborMode: 'flat', flatJob: { crew: CREW.map(m => ({ ...m, hrsPerDay: h })), weeks: 27, daysPerWeek: 5 } });

  it('speaks up when a long day is billing straight through', () => {
    const r = otReview(flatState(10));
    expect(r.current).toBe(405000);
    expect(r.corrected).toBe(445500);
    expect(r.delta).toBe(40500);
    expect(r.daysAffected).toBe(135);
  });

  it('stays quiet on eight-hour days — there is nothing past eight', () => {
    expect(otReview(flatState(8))).toBeNull();
  });

  it('stays quiet once a threshold is set', () => {
    const s = flatState(10);
    s.flatJob.otAfterHours = 8;
    s.flatJob.otMult = 1.5;
    expect(otReview(s)).toBeNull();
  });

  it('notices a blanket multiplier being used instead of a threshold', () => {
    const s = flatState(10);
    s.flatJob.otMult = 1.5;
    expect(otReview(s).blanketUsed).toBe(true);
  });

  it('works across phased periods and counts only the affected days', () => {
    const state = {
      laborMode: 'periods',
      laborPeriods: [
        { crew: CREW, days: 20 },                                            // 10s, no threshold
        { crew: CREW.map(m => ({ ...m, hrsPerDay: 8 })), days: 30 },         // 8s, nothing to fix
        { crew: CREW, days: 10, otAfterHours: 8, otMult: 1.5 },              // already right
      ],
    };
    expect(otReview(state).daysAffected).toBe(20);
  });

  it('says nothing about a job with no labor entered', () => {
    expect(otReview({ laborMode: 'flat', flatJob: {} })).toBeNull();
    expect(otReview({ laborMode: 'periods', laborPeriods: [] })).toBeNull();
  });

  it('excludes out-of-town from the comparison — this is a labor question', () => {
    const s = flatState(10);
    s.flatJob.ootPerDay = 150;
    s.ootBasis = 'person';
    const r = otReview(s);
    expect(r.current).toBe(405000);
    expect(r.delta).toBe(40500);
  });
});

// ── DAILY vs WEEKLY OVERTIME ─────────────────────────────────────────────────
// The compressed schedules contractors run land on opposite sides of the two
// rules, so a four-day week is not just a smaller number of days.
describe('daily and weekly overtime rules', () => {
  const crew = h => Array.from({ length: 4 }, () => ({ rate: 75, hrsPerDay: h }));
  const week = (d, h, cfg) => crewDayCost(crew(h), { otMult: 1.5, daysPerWeek: d, ...cfg }) * d;

  it('a four-ten is exactly forty hours and owes no weekly overtime', () => {
    expect(week(4, 10, { weeklyOtHours: 40 })).toBe(4 * 75 * 40);
  });

  it('but a daily threshold bills eight overtime hours on that same week', () => {
    // 4 men × $75 × (8 + 2×1.5) × 4 days
    expect(week(4, 10, { otAfterHours: 8 })).toBe(13200);
    expect(week(4, 10, { otAfterHours: 8 })).toBeGreaterThan(week(4, 10, { weeklyOtHours: 40 }));
  });

  it('the weekly rule catches six eights, which the daily rule cannot see', () => {
    // 48 hours: 40 straight + 8 over. This was the documented limitation.
    // Spreading 8 weekly OT hours across 6 days and multiplying back does not
    // land on an exact binary fraction, so this is close-to rather than equal.
    expect(week(6, 8, { weeklyOtHours: 40 })).toBeCloseTo(4 * 75 * (40 + 8 * 1.5), 6);
    expect(week(6, 8, { otAfterHours: 8 })).toBe(4 * 75 * 48);
  });

  it('the two rules agree on a five-ten, which is why nobody noticed', () => {
    expect(week(5, 10, { otAfterHours: 8 })).toBe(week(5, 10, { weeklyOtHours: 40 }));
  });

  it('and on a plain five-eight, where there is no overtime either way', () => {
    expect(week(5, 8, { otAfterHours: 8 })).toBe(week(5, 8, { weeklyOtHours: 40 }));
    expect(week(5, 8, { otAfterHours: 8 })).toBe(4 * 75 * 40);
  });

  it('with both set, the greater applies — a state rule stacking on the federal one', () => {
    expect(week(4, 10, { otAfterHours: 8, weeklyOtHours: 40 })).toBe(week(4, 10, { otAfterHours: 8 }));
    expect(week(6, 8, { otAfterHours: 8, weeklyOtHours: 40 })).toBe(week(6, 8, { weeklyOtHours: 40 }));
  });

  it('spreads weekly overtime across the week, so part-weeks cost correctly', () => {
    // Two and a half weeks of 6x8 is not two weeks.
    const perDay = crewDayCost(crew(8), { otMult: 1.5, weeklyOtHours: 40, daysPerWeek: 6 });
    expect(perDay * 15).toBeCloseTo((4 * 75 * (40 + 8 * 1.5)) * 2.5, 6);
  });

  it('a weekly threshold does nothing without knowing the days in a week', () => {
    expect(crewDayCost(crew(10), { otMult: 1.5, weeklyOtHours: 40 }))
      .toBe(crewDayCost(crew(10), { otMult: 1.5 }));
  });

  it('still defaults to the whole-shift premium when no threshold is set at all', () => {
    expect(crewDayCost(crew(10), { otMult: 1.5, daysPerWeek: 4 })).toBe(4 * 75 * 10 * 1.5);
  });

  it('reports overtime hours per person per day', () => {
    expect(memberOtHours({ hrsPerDay: 10 }, { otAfterHours: 8 })).toBe(2);
    expect(memberOtHours({ hrsPerDay: 10 }, { weeklyOtHours: 40, daysPerWeek: 4 })).toBe(0);
    expect(memberOtHours({ hrsPerDay: 8 }, { weeklyOtHours: 40, daysPerWeek: 6 })).toBeCloseTo(8 / 6, 6);
  });

  it('flows through a flat job and a period alike', () => {
    const flat = { crew: crew(10), weeks: 27, daysPerWeek: 4, otMult: 1.5, weeklyOtHours: 40 };
    expect(calcFlatJobCost(flat).days).toBe(108);
    expect(calcFlatJobCost(flat).labor).toBe(4 * 75 * 40 * 27);
    const period = { crew: crew(10), days: 4, daysPerWeek: 4, otMult: 1.5, weeklyOtHours: 40 };
    expect(calcLaborPeriodCost(period).labor).toBe(4 * 75 * 40);
  });
});

describe('warning when the two rules disagree', () => {
  const crew = h => Array.from({ length: 4 }, () => ({ rate: 75, hrsPerDay: h }));

  it('fires on a four-ten, where the daily rule charges more', () => {
    const c = otRuleConflict(crew(10), { daysPerWeek: 4, otAfterHours: 8 });
    expect(c.dailyOtHours).toBe(32);
    expect(c.weeklyOtHours).toBe(0);
    expect(c.hrsPerWeek).toBe(40);
    expect(c.dailyHigher).toBe(true);
  });

  it('fires on six eights, where the weekly rule charges more', () => {
    const c = otRuleConflict(crew(8), { daysPerWeek: 6, otAfterHours: 8 });
    expect(c.dailyHigher).toBe(false);
    expect(c.weeklyOtHours).toBe(32);
  });

  it('stays quiet where the rules agree', () => {
    expect(otRuleConflict(crew(10), { daysPerWeek: 5, otAfterHours: 8 })).toBeNull();
    expect(otRuleConflict(crew(8), { daysPerWeek: 5, otAfterHours: 8 })).toBeNull();
  });

  it('stays quiet when there is nothing to compare', () => {
    expect(otRuleConflict(crew(10), { daysPerWeek: 4 })).toBeNull();
    expect(otRuleConflict(crew(10), { otAfterHours: 8 })).toBeNull();
    expect(otRuleConflict([], { daysPerWeek: 4, otAfterHours: 8 })).toBeNull();
  });
});
