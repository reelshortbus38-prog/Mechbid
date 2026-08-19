import { describe, it, expect, afterEach } from 'vitest';
import {
  saveJob, getLastSaveError,
  normalizePipeSize, pipeSizeBucket,
  calcLaborPeriodCost, calcRackTaskCost, calcRackLaborTotal,
  calcFieldTaskCost, calcFieldTasksTotal, avgCrewRate,
  estimateCircuitLabor, DEFAULT_LABOR_UNITS, defaultHvacPrice,
  ootCost, crewTravelCount, ootBasisComparison, jobOOTTotal,
  calcFlatJobCost, DEFAULT_OOT_BASIS, initialState, jobLaborTotal,
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
