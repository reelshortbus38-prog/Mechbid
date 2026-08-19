import { describe, it, expect } from 'vitest';
import { newFact, mergeFacts } from './jobFacts.js';
import {
  conflicts, pumpCrosschecks, headResiduals, reconcile, reconcileSummary,
  RESIDUAL_MIN_FRACTION,
} from './factReconcile.js';

const f = (kind, subj, val, sheet, system = '') => newFact(kind, subj, val, { sheet, system });

// The real hydronic pump group, as extracted from the Edmonds schedule.
const hwp = (mark, sheet = 'M8.01') => [
  f('pumpFlow', mark, 276, sheet, 'hydronic'),
  f('pumpHead', mark, 83, sheet, 'hydronic'),
  f('pumpEff', mark, 78, sheet, 'hydronic'),
  f('pumpMotorHp', mark, 10, sheet, 'hydronic'),
];
const cwp = (mark, sheet = 'M8.01') => [
  f('pumpFlow', mark, 455, sheet, 'condenser'),
  f('pumpHead', mark, 125, sheet, 'condenser'),
  f('pumpEff', mark, 75, sheet, 'condenser'),
  f('pumpMotorHp', mark, 25, sheet, 'condenser'),
];

describe('conflict — the same quantity stated two ways', () => {
  it('catches two sheets disagreeing', () => {
    // The live case: 25% glycol in the equipment schedule, 20% PG at the
    // make-up unit that fills the same loop.
    const l = [
      f('fluidPct', 'CONDENSER WATER', 25, 'M8.01', 'condenser'),
      f('fluidPct', 'CONDENSER WATER', 20, 'M8.02', 'condenser'),
    ];
    const c = conflicts(l);
    expect(c.length).toBe(1);
    expect(c[0].severity).toBe('blocker');
    expect(c[0].detail).toMatch(/25 %/);
    expect(c[0].detail).toMatch(/20 %/);
    expect(c[0].detail).toMatch(/M8.01/);
    expect(c[0].detail).toMatch(/M8.02/);
    expect(c[0].sheets.sort()).toEqual(['M8.01', 'M8.02']);
  });

  it('catches the live case, where BOTH statements are on ONE sheet', () => {
    // The heat pump schedule is selected on 25% glycol and the make-up unit
    // that fills the same loop is specified 20% PG — printed side by side on
    // one drawing. An earlier rule required two sheets and suppressed exactly
    // this, which is the finding the cross-sheet work exists for.
    const l = [
      f('fluidPct', 'WWHP-01', 25, 'M8.01', ''),          // standalone GLYCOL % column
      f('fluidPct', 'CONDENSER WATER', 20, 'M8.01', 'condenser'),
    ];
    const c = conflicts(l);
    expect(c.length).toBe(1);
    expect(c[0].label).toMatch(/stated two ways on this job/);
    expect(c[0].sheets).toEqual(['M8.01']);
  });

  it('does not name one piece of equipment for a job-wide disagreement', () => {
    const l = [
      f('fluidPct', 'WWHP-01', 25, 'M8.01', ''),
      f('fluidPct', 'CONDENSER WATER', 20, 'M8.01', 'condenser'),
    ];
    // Labelling it "— CONDENSER WATER" would read as though the make-up unit
    // were at fault, when the two documents simply disagree.
    expect(conflicts(l)[0].label).not.toMatch(/— CONDENSER WATER/);
  });

  it('six heat pumps all reading 25% are one fact, not six conflicts', () => {
    const l = ['WWHP-01', 'WWHP-02', 'WWHP-03', 'WWHP-04', 'WWHP-05', 'WWHP-06']
      .map(m => f('fluidPct', m, 25, 'M8.01', ''));
    expect(conflicts(l)).toEqual([]);
  });

  it('leaves two loops alone when BOTH name their own', () => {
    const l = [
      f('fluidPct', 'GROUND LOOP', 30, 'M8.01', 'condenser'),
      f('fluidPct', 'HEATING LOOP', 0.5, 'M8.01', 'hydronic'),
    ];
    expect(conflicts(l)).toEqual([]);
  });

  it('flags one mark carrying two different heads, even on one sheet', () => {
    // A revision that left the old row behind looks exactly like this, and it
    // is a real document problem rather than noise to be tolerated.
    const l = [
      f('pumpHead', 'HWP-01', 83, 'M8.01', 'hydronic'),
      f('pumpHead', 'HWP-01', 70, 'M8.01', 'hydronic'),
    ];
    expect(conflicts(l).length).toBe(1);
  });

  it('does NOT flag two DIFFERENT pumps with different heads — that is a schedule', () => {
    const l = [
      f('pumpHead', 'HWP-01', 83, 'M8.01', 'hydronic'),
      f('pumpHead', 'CWP-01', 125, 'M8.01', 'condenser'),
    ];
    expect(conflicts(l)).toEqual([]);
  });

  it('does NOT flag two different loops running different glycol', () => {
    const l = [
      f('fluidPct', 'LOOP', 25, 'M8.01', 'condenser'),
      f('fluidPct', 'LOOP', 0, 'M8.02', 'hydronic'),
    ];
    expect(conflicts(l)).toEqual([]);
  });

  it('does not flag agreement', () => {
    const l = [
      f('pumpHead', 'HWP-01', 83, 'M8.01', 'hydronic'),
      f('pumpHead', 'HWP-01', 83, 'M10.06', 'hydronic'),
    ];
    expect(conflicts(l)).toEqual([]);
  });

  it('allows a rounding difference where the kind tolerates one', () => {
    // pumpHead tolerates 2% — 83 against 84 is a redraw, not a disagreement.
    const l = [
      f('pumpHead', 'HWP-01', 83, 'M8.01', 'hydronic'),
      f('pumpHead', 'HWP-01', 84, 'M10.06', 'hydronic'),
    ];
    expect(conflicts(l)).toEqual([]);
  });

  it('tolerates nothing on a motor size, where there is no such thing as close', () => {
    const l = [
      f('pumpMotorHp', 'HWP-01', 10, 'M8.01', 'hydronic'),
      f('pumpMotorHp', 'HWP-01', 7.5, 'M10.06', 'hydronic'),
    ];
    expect(conflicts(l).length).toBe(1);
  });

  it('matches subjects across PDF word-splitting', () => {
    const l = [
      f('dpSetpoint', 'heat pump header', 4, 'A', 'hydronic'),
      f('dpSetpoint', 'heat pu mp header', 6, 'B', 'hydronic'),
    ];
    expect(conflicts(l).length).toBe(1);
  });
});

describe('crosscheck — the schedule\'s answer against the app\'s', () => {
  it('agrees with both real selections off the Edmonds schedule', () => {
    const l = [...hwp('HWP-01'), ...cwp('CWP-01'), f('fluidPct', 'CW', 20, 'M8.01', 'condenser')];
    const c = pumpCrosschecks(l);
    expect(c.length).toBe(2);
    for (const x of c) expect(x.severity).toBe('ok');
  });

  it('is a regression guard — it goes red if the selection method is broken', () => {
    // The engineer scheduled 10 HP. Had the app kept selecting to the design
    // point it would say 7.5, and this fires. That is the bug it exists to hold.
    const l = [...hwp('HWP-01')];
    const c = pumpCrosschecks(l)[0];
    expect(c.computed).toBe(10);
    expect(c.scheduled).toBe(10);
  });

  it('reports a genuine mismatch without blaming the drawing', () => {
    const l = [
      f('pumpFlow', 'HWP-09', 276, 'M8.01', 'hydronic'),
      f('pumpHead', 'HWP-09', 83, 'M8.01', 'hydronic'),
      f('pumpEff', 'HWP-09', 78, 'M8.01', 'hydronic'),
      f('pumpMotorHp', 'HWP-09', 30, 'M8.01', 'hydronic'),
    ];
    const c = pumpCrosschecks(l)[0];
    expect(c.severity).toBe('verify');
    expect(c.detail).toMatch(/not automatically the drawing/);
  });

  it('uses the loop\'s own glycol rather than assuming water', () => {
    const withGlycol = pumpCrosschecks([...cwp('CWP-01'), f('fluidPct', 'CW', 40, 'M8.01', 'condenser')])[0];
    const onWater = pumpCrosschecks([...cwp('CWP-01')])[0];
    expect(withGlycol.bhp).toBeGreaterThan(onWater.bhp);
    expect(withGlycol.fluidPct).toBe(40);
  });

  it('does not borrow another loop\'s glycol', () => {
    const c = pumpCrosschecks([...hwp('HWP-01'), f('fluidPct', 'CW', 40, 'M8.01', 'condenser')])[0];
    expect(c.fluidPct).toBe(0);
  });

  it('says nothing about a pump missing an input, rather than guessing one', () => {
    const l = [f('pumpFlow', 'HWP-01', 276, 'A', 'hydronic'), f('pumpHead', 'HWP-01', 83, 'A', 'hydronic')];
    expect(pumpCrosschecks(l)).toEqual([]);
  });
});

describe('residual — what is left for the pipe', () => {
  const dpHydronic = f('dpSetpoint', 'HW', 12, 'M10.06', 'hydronic');

  it('decomposes the real 83 ft into a believable distribution figure', () => {
    const r = headResiduals([...hwp('HWP-01'), dpHydronic], { plantHeadFt: 5 });
    expect(r.length).toBe(1);
    expect(r[0].severity).toBe('ok');
    expect(r[0].residualFt).toBeCloseTo(50.3, 1);
    expect(r[0].sheets.sort()).toEqual(['M10.06', 'M8.01']);
  });

  it('does NOT apply a hydronic setpoint to a condenser water pump', () => {
    // The first run of this check did exactly that and produced a confident
    // finding about a pump the setpoint has no bearing on.
    expect(headResiduals([...cwp('CWP-01'), dpHydronic], { plantHeadFt: 5 })).toEqual([]);
  });

  it('says nothing about a pump on no identifiable loop', () => {
    // CWP-04 is a 1/6 HP kitchen circulator, on neither loop.
    const l = [f('pumpHead', 'CWP-04', 30, 'M8.01', ''), dpHydronic];
    expect(headResiduals(l, { plantHeadFt: 5 })).toEqual([]);
  });

  it('flags a negative remainder — both figures cannot be right', () => {
    const l = [f('pumpHead', 'HWP-01', 30, 'M8.01', 'hydronic'), dpHydronic];
    const r = headResiduals(l, { plantHeadFt: 5 })[0];
    expect(r.severity).toBe('verify');
    expect(r.detail).toMatch(/negative/);
  });

  it('flags a remainder that leaves almost nothing for the pipe', () => {
    // 31 ft of pump against 27.7 ft of setpoint leaves 3.3 ft, about 11%.
    const l = [f('pumpHead', 'HWP-01', 31, 'M8.01', 'hydronic'), dpHydronic];
    const r = headResiduals(l, { plantHeadFt: 0 })[0];
    expect(r.fraction).toBeLessThan(RESIDUAL_MIN_FRACTION);
    expect(r.severity).toBe('verify');
  });

  it('asks once about three identical pumps, not three times', () => {
    const l = [...hwp('HWP-01'), ...hwp('HWP-02'), ...hwp('HWP-03'), dpHydronic];
    expect(headResiduals(l, { plantHeadFt: 5 }).length).toBe(1);
  });

  it('prefers the system setpoint over a plant minimum or a header setpoint', () => {
    const l = [
      ...hwp('HWP-01'),
      f('dpSetpoint', 'minimum hydronic plant', 3, 'M10.06', 'hydronic'),
      f('dpSetpoint', 'heat pump header', 4, 'M10.06', 'hydronic'),
      dpHydronic,
    ];
    expect(headResiduals(l, { plantHeadFt: 5 })[0].detail).toMatch(/12 PSI/);
  });

  it('says nothing when no setpoint was found at all', () => {
    expect(headResiduals([...hwp('HWP-01')], { plantHeadFt: 5 })).toEqual([]);
  });
});

describe('the whole pipeline, sheet by sheet', () => {
  it('accumulates across three uploads and cross-checks what none of them says alone', () => {
    let l = [];
    l = mergeFacts(l, 'M8.01', [...hwp('HWP-01', 'M8.01'), ...cwp('CWP-01', 'M8.01')]);
    // A piping plan contributes no schedule facts, and that is fine.
    l = mergeFacts(l, 'M4.12b', []);
    l = mergeFacts(l, 'M10.06', [f('dpSetpoint', 'HW', 12, 'M10.06', 'hydronic')]);

    const findings = reconcile(l, { plantHeadFt: 5 });
    // The residual is the one finding that needed two different sheets.
    const residual = findings.find(x => x.type === 'residual');
    expect(residual.sheets.length).toBe(2);
    expect(findings.every(x => x.severity === 'ok')).toBe(true);
    expect(reconcileSummary(findings).tone).toBe('ok');
  });

  it('sorts blockers first', () => {
    const l = [
      ...hwp('HWP-01'),
      f('fluidPct', 'CW', 25, 'M8.01', 'condenser'),
      f('fluidPct', 'CW', 20, 'M8.02', 'condenser'),
    ];
    expect(reconcile(l)[0].severity).toBe('blocker');
  });

  it('says plainly that one sheet cannot disagree with itself', () => {
    expect(reconcileSummary([]).text).toMatch(/one sheet cannot disagree/);
  });
});
