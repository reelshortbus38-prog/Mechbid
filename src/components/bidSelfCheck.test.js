import { describe, it, expect } from 'vitest';
import { selfCheck, bidDiagnostic } from './bidSelfCheck.js';
import { computeBidTotals } from '../steps/bidTotals.js';
import { initialState, DEFAULT_LABOR_UNITS, estimateCircuitLabor } from '../state/store.js';
import { circuitTaskRow } from '../steps/laborUnits.js';

// ── A WHOLE JOB, NOT A FUNCTION ──────────────────────────────────────────────
// Every other test file in this repo checks one piece. Not one of them builds a
// realistic bid and asks whether it hangs together — which is exactly the gap
// every expensive bug of the last week fell through.
//
// A twenty-circuit grocery remodel, priced the way the app would price it.
function foodLionJob(over = {}) {
  const circuits = Array.from({ length: 20 }, (_, i) => ({
    id: `c${i}`,
    circuitId: `${'ABC'[i % 3]}${i + 1}`,
    rack: 'ABC'[i % 3],
    application: ['MT Cases', 'LT Cases', 'Dairy', 'Produce'][i % 4],
    runLength: 120 + (i % 5) * 60,
    riserLength: 20,
    sucHoriz: ['7/8', '1 1/8', '1 5/8'][i % 3],
    liqHoriz: '1/2',
    tempType: i % 4 === 1 ? 'low' : 'medium',
    cases: 1 + (i % 4),
    inFloor: false,
  }));

  const est = estimateCircuitLabor(circuits, DEFAULT_LABOR_UNITS);
  const fieldTasks = est.perCircuit.map((pc, i) => ({
    ...circuitTaskRow(pc, { crewSize: 2, multiplier: 1, mode: 'Commercial Refrigeration', mintId: () => `t${i}` }),
  }));

  return {
    ...initialState,
    mode: 'Commercial Refrigeration',
    projectType: 'remodel',
    projName: 'Store 9999', projAddr: '1 Example Rd', projGC: 'Example GC',
    circuits,
    fieldTasks,
    laborMode: 'periods',
    // A period at ZERO DAYS. That is not a quirk of the fixture — it is what
    // the app's own advice says to do on a time-and-materials bid: the task
    // list carries the labor, and the period exists to hold the crew and their
    // rate. `crew` is not a state key; jobCrew reads the first period's crew,
    // which is the trap the fallbackRate check was written for after this very
    // fixture fell into it.
    laborPeriods: [{
      id: 'p1', crew: [{ id: 'a', role: 'Mechanic', rate: 95, hrsPerDay: 10 }],
      days: 0, otMult: 1,
    }],
    lineItems: [
      { id: 'l1', desc: 'Type L copper', total: 41000 },
      { id: 'l2', desc: 'Insulation', total: 9500 },
    ],
    rackTasks: [{ id: 'r1', desc: 'Set rack', men: 4, hrs: 2 }],
    laborUnits: { ...DEFAULT_LABOR_UNITS },
    markupPct: 20,
    ...over,
  };
}

const totalsFor = job => computeBidTotals(job, job.markupPct);

describe('a whole job, priced the way the app would price it', () => {
  const job = foodLionJob();
  const totals = totalsFor(job);

  it('produces a real bid rather than a pile of zeroes', () => {
    expect(totals.total).toBeGreaterThan(50000);
    expect(Number.isFinite(totals.total)).toBe(true);
  });

  it('reconciles — the total is what its own line items add up to', () => {
    const check = selfCheck(job, totals, { shipped: DEFAULT_LABOR_UNITS });
    expect(check.findings.filter(f => f.key === 'totalDoesNotSum')).toEqual([]);
  });

  it('carries no blockers on a job that was filled in properly', () => {
    const check = selfCheck(job, totals, { shipped: DEFAULT_LABOR_UNITS });
    expect(check.blockers, JSON.stringify(check.findings, null, 2)).toBe(0);
  });

  it('says plainly that reconciling is not the same as being right', () => {
    const clean = selfCheck(foodLionJob({ circuits: [] }), totals, { shipped: {} });
    expect(clean.verdict).toMatch(/not the same as being right/i);
  });
});

// ── THE BUGS THIS WEEK, AS A WHOLE-BID CHECK ─────────────────────────────────
// Each of these was real, each cost money, and not one was caught by a unit
// test — because each is two correct-looking halves that disagree.
describe('it catches the disagreements that unit tests could not', () => {
  it('catches two screens using different markups', () => {
    const job = foodLionJob({
      markupPct: 0,
      scenarios: { active: 'mid', mid: { label: 'Mid', markupPct: 20, desc: '' } },
    });
    const f = selfCheck(job, totalsFor(job), {}).findings.find(x => x.key === 'markupDisagrees');
    expect(f).toBeTruthy();
    expect(f.severity).toBe('blocker');
    expect(f.title).toMatch(/0%/);
    expect(f.title).toMatch(/20%/);
  });

  it('is quiet when every reader agrees', () => {
    const job = foodLionJob({
      markupPct: 20,
      scenarios: { active: 'mid', mid: { label: 'Mid', markupPct: 20, desc: '' } },
    });
    expect(selfCheck(job, totalsFor(job), {}).findings.find(x => x.key === 'markupDisagrees')).toBeFalsy();
  });

  it('catches a generated task edited away from its own note', () => {
    const job = foodLionJob();
    // Somebody bumped the crew on one row and the note still claims the old figure.
    job.fieldTasks = job.fieldTasks.map((t, i) => (i === 0 ? { ...t, men: 4 } : t));
    const f = selfCheck(job, totalsFor(job), {}).findings.find(x => x.key === 'taskNoteDrift');
    expect(f).toBeTruthy();
    expect(f.detail).toMatch(/says .* man-hrs, bills/);
  });

  it('is quiet when the rows still match their notes', () => {
    const job = foodLionJob();
    expect(selfCheck(job, totalsFor(job), {}).findings.find(x => x.key === 'taskNoteDrift')).toBeFalsy();
  });

  it('catches a bid whose total is not its own parts', () => {
    const broken = { ...totalsFor(foodLionJob()), total: 999999 };
    const f = selfCheck(foodLionJob(), broken, {}).findings.find(x => x.key === 'totalDoesNotSum');
    expect(f).toBeTruthy();
    expect(f.severity).toBe('blocker');
  });

  it('catches both labor methods being filled in at once', () => {
    const job = foodLionJob({
      laborPeriods: [{ id: 'p1', crew: [{ id: 'a', rate: 95, hrsPerDay: 10 }], days: 20, otMult: 1 }],
    });
    // Days on the period AND a generated task list: the crew is there to do the
    // same running the tasks already price.
    const f = selfCheck(job, totalsFor(job), {}).findings.find(x => x.key === 'laborDoubleCount');
    expect(f).toBeTruthy();
  });

  it('points at the pit plan when twenty circuits have no routing', () => {
    const f = selfCheck(foodLionJob(), totalsFor(foodLionJob()), {}).findings
      .find(x => x.key === 'noRoutingSet');
    expect(f).toBeTruthy();
    expect(f.detail).toMatch(/pit & conduit plan/i);
  });

  it('stops saying it once the routing has been read', () => {
    const job = foodLionJob({ pitConduitReads: [{ fileName: 'PL.02.pdf' }] });
    expect(selfCheck(job, totalsFor(job), {}).findings.find(x => x.key === 'noRoutingSet')).toBeFalsy();
  });

  it('says when every labor unit is still the one the app shipped', () => {
    const f = selfCheck(foodLionJob(), totalsFor(foodLionJob()), {
      profile: {}, shipped: DEFAULT_LABOR_UNITS,
    }).findings.find(x => x.key === 'shippedUnits');
    expect(f.severity).toBe('info');
    expect(f.detail).toMatch(/wrong to send one out on/i);
  });

  it('explains a job frozen on older units rather than leaving it a mystery', () => {
    const job = foodLionJob({ laborUnits: { ...DEFAULT_LABOR_UNITS, perFtMed: 0.045 } });
    const f = selfCheck(job, totalsFor(job), { shipped: DEFAULT_LABOR_UNITS }).findings
      .find(x => x.key === 'unitsFrozen');
    expect(f.severity).toBe('info');
    expect(f.detail).toMatch(/deliberate/i);
  });
});

// ── THE REPORT HAS TO BE SAFE TO SEND ────────────────────────────────────────
// A diagnostic carrying a store name is one the estimator has to read carefully
// before pasting, which means most of the time he will not paste it at all.
describe('the diagnostic carries no customer identity', () => {
  const job = foodLionJob({
    projName: 'Food Lion 0047', projAddr: '1425 E Dixie Drive, Asheboro NC',
    projGC: 'Shelco Construction', storeNumber: '0047',
    uploadedFiles: [{ id: 'f1', name: 'FL0047-PL.02-pit-and-conduit.pdf', type: 'pdf' }],
  });
  const report = bidDiagnostic(job, totalsFor(job), { shipped: DEFAULT_LABOR_UNITS });

  it('names no store, address, contractor or file', () => {
    for (const secret of [
      'Food Lion', '0047', 'Dixie', 'Asheboro', 'Shelco', 'FL0047', 'pit-and-conduit.pdf',
    ]) {
      expect(report, `leaked: ${secret}`).not.toContain(secret);
    }
  });

  it('names no circuit ids either — a circuit list is a takeoff', () => {
    for (const c of job.circuits.slice(0, 5)) {
      expect(report).not.toMatch(new RegExp(`\\b${c.circuitId}\\b`));
    }
  });

  it('still carries enough to act on', () => {
    expect(report).toContain('Commercial Refrigeration');
    expect(report).toContain('Circuits         20');
    expect(report).toMatch(/TOTAL\s+\$[\d,]+/);
    expect(report).toContain('SELF-CHECK');
  });

  it('says what it is at the top, so nobody has to guess what they are sending', () => {
    expect(report.split('\n')[1]).toMatch(/no store name, address, contractor or file names/i);
  });

  it('puts the blockers first', () => {
    const bad = foodLionJob({
      markupPct: 0, scenarios: { active: 'mid', mid: { label: 'Mid', markupPct: 20, desc: '' } },
    });
    const out = bidDiagnostic(bad, totalsFor(bad), { shipped: DEFAULT_LABOR_UNITS });
    expect(out.indexOf('[BLOCKER]')).toBeLessThan(out.indexOf('[INFO]'));
  });

  it('survives an empty job rather than throwing at the worst moment', () => {
    expect(() => bidDiagnostic({}, {}, {})).not.toThrow();
    expect(() => bidDiagnostic(undefined, undefined, undefined)).not.toThrow();
    expect(bidDiagnostic({}, {}, {})).toContain('COLDGAUGE DIAGNOSTIC');
  });
});

// ── FOUND BY RUNNING THIS AGAINST A REALISTIC JOB ────────────────────────────
// Which is the whole reason it exists. `crew` is not a state key: jobCrew reads
// the FIRST LABOR PERIOD'S crew. So a job bid the time-and-materials way — task
// list carries the labor, periods are only the schedule — can have no crew
// anywhere, and every hour falls through to the app's $100 fallback in silence.
//
// That is exactly the method a T&M contractor uses, and the app's own position
// is that no contractor charges the same rate.
describe('a bid priced at the app\'s fallback rate says so', () => {
  const tAndM = foodLionJob({ laborPeriods: [] });

  it('catches it, as a blocker', () => {
    const f = selfCheck(tAndM, totalsFor(tAndM), {}).findings.find(x => x.key === 'fallbackRate');
    expect(f).toBeTruthy();
    expect(f.severity).toBe('blocker');
    expect(f.title).toMatch(/\$100\/man-hour fallback/);
  });

  it('says how to fix it, including the T&M case that causes it', () => {
    const f = selfCheck(tAndM, totalsFor(tAndM), {}).findings.find(x => x.key === 'fallbackRate');
    expect(f.detail).toMatch(/time-and-materials/i);
    expect(f.detail).toMatch(/days can be zero/i);
  });

  it('goes quiet once a crew with a rate exists', () => {
    const crewed = foodLionJob({
      laborPeriods: [{ id: 'p1', crew: [{ id: 'a', role: 'Mechanic', rate: 118, hrsPerDay: 10 }], days: 0, otMult: 1 }],
    });
    expect(selfCheck(crewed, totalsFor(crewed), {}).findings.find(x => x.key === 'fallbackRate')).toBeFalsy();
  });

  it('says nothing when there is no task labor to misprice', () => {
    const noTasks = foodLionJob({ fieldTasks: [], rackTasks: [], laborPeriods: [] });
    expect(selfCheck(noTasks, totalsFor(noTasks), {}).findings.find(x => x.key === 'fallbackRate')).toBeFalsy();
  });

  it('puts the rate on the report either way, because everything hangs on it', () => {
    expect(bidDiagnostic(tAndM, totalsFor(tAndM), {})).toMatch(/Crew rate\s+none set/);
    const crewed = foodLionJob({
      laborPeriods: [{ id: 'p1', crew: [{ id: 'a', rate: 118, hrsPerDay: 10 }], days: 0, otMult: 1 }],
    });
    expect(bidDiagnostic(crewed, totalsFor(crewed), {})).toMatch(/Crew rate\s+\$118\/man-hr/);
  });
});
