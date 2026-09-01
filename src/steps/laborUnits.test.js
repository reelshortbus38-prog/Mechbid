import { describe, it, expect } from 'vitest';
import {
  splitAcrossCrew, manHoursOf, provenanceOf, unitsConfidence,
  UNIT_PROVENANCE, PROVENANCE_MARK,
} from './laborUnits.js';
import { DEFAULT_LABOR_UNITS, estimateCircuitLabor, calcFieldTaskCost } from '../state/store.js';

describe('man-hours split across a real crew', () => {
  it('keeps men x hrs equal to the man-hours it started with', () => {
    // This is the whole contract. The cost math downstream is
    // men x hrs x per-man rate, so if the product drifts, the bid drifts.
    for (const [mh, crew] of [[24, 2], [9.1, 2], [52.5, 3], [100, 4], [7, 1]]) {
      const s = splitAcrossCrew(mh, crew);
      expect(s.men * s.hrs, `${mh}h over ${crew}`).toBeCloseTo(mh, 1);
    }
  });

  it('turns one man for three days into two men for a day and a half', () => {
    // The row a working estimator objected to, and what it should have said.
    const s = splitAcrossCrew(24, 2);
    expect(s.men).toBe(2);
    expect(s.hrs).toBe(12);
  });

  it('costs exactly the same as the row it replaces', () => {
    const crew = [{ role: 'Technician', rate: 75 }, { role: 'Helper', rate: 75 }];
    const before = calcFieldTaskCost({ men: 1, hrs: 24 }, crew);
    const s = splitAcrossCrew(24, 2);
    const after = calcFieldTaskCost({ men: s.men, hrs: s.hrs }, crew);
    expect(after).toBeCloseTo(before, 2);
  });

  it('never invents a fractional or zero person', () => {
    for (const bad of [0, -3, 0.4, null, undefined, NaN, '']) {
      const s = splitAcrossCrew(20, bad);
      expect(Number.isInteger(s.men), String(bad)).toBe(true);
      expect(s.men, String(bad)).toBeGreaterThanOrEqual(1);
    }
  });

  it('rounds a crew size somebody typed as a decimal', () => {
    expect(splitAcrossCrew(20, 2.4).men).toBe(2);
    expect(splitAcrossCrew(20, 2.6).men).toBe(3);
  });

  it('survives being handed nothing at all', () => {
    const s = splitAcrossCrew();
    expect(s.men).toBe(1);
    expect(s.hrs).toBe(0);
  });
});

describe('reading man-hours back off a row', () => {
  it('reads what the row costs, not what its hours column says', () => {
    expect(manHoursOf({ men: 2, hrs: 12 })).toBe(24);
    expect(manHoursOf({ men: 1, hrs: 24 })).toBe(24);
  });

  it('treats a blank row as no hours rather than throwing', () => {
    expect(manHoursOf({})).toBe(0);
    expect(manHoursOf(null)).toBe(0);
    expect(manHoursOf(undefined)).toBe(0);
  });
});

describe('a generated circuit still costs what the units said', () => {
  const circuits = [
    { circuitId: '1', runLength: 150, riserLength: 0, sucHoriz: '1-3/8' },
    { circuitId: '2', runLength: 60, riserLength: 0, sucHoriz: '7/8' },
  ];

  it('splitting every circuit over a crew changes nothing about the total', () => {
    // The generator's job is presentation, not arithmetic. If it moves the
    // number, it is doing something it was never asked to do.
    const est = estimateCircuitLabor(circuits, DEFAULT_LABOR_UNITS);
    for (const crewSize of [1, 2, 3, 4]) {
      const total = est.perCircuit
        .map(pc => splitAcrossCrew(pc.hours, crewSize))
        .reduce((s, x) => s + x.men * x.hrs, 0);
      expect(total, `crew of ${crewSize}`).toBeCloseTo(est.totalHours, 1);
    }
  });
});

describe('every assumption is a number somebody can change', () => {
  // "As long as everything is editable it will be fine." That is the whole
  // requirement, so it gets a test rather than a promise. A hardcoded constant
  // in this path is one nobody can correct on the job in front of them.
  const circuits = [{ circuitId: '1', runLength: 150, riserLength: 0, sucHoriz: '1-3/8' }];
  // One circuit per size bucket, so a rate that only applies to small pipe has
  // something small to apply to.
  const allBuckets = [
    { circuitId: 'S', runLength: 60, riserLength: 0, sucHoriz: '7/8' },
    { circuitId: 'M', runLength: 150, riserLength: 0, sucHoriz: '1-3/8' },
    { circuitId: 'L', runLength: 250, riserLength: 0, sucHoriz: '2-1/8' },
  ];

  it('moves the answer when ANY unit is changed', () => {
    const base = estimateCircuitLabor(allBuckets, DEFAULT_LABOR_UNITS).totalHours;
    for (const key of Object.keys(DEFAULT_LABOR_UNITS)) {
      const bumped = { ...DEFAULT_LABOR_UNITS, [key]: DEFAULT_LABOR_UNITS[key] * 2 };
      expect(estimateCircuitLabor(allBuckets, bumped).totalHours, `${key} does nothing`).not.toBe(base);
    }
  });

  it('lets the joint count be raised off the two it assumes', () => {
    // Two joints covers the rack tie and the case and nothing else — a circuit
    // with no ells, tees, reducers or valves. It used to be hardcoded, so a
    // run that turned six corners had six joints nobody priced.
    const two = estimateCircuitLabor(circuits, DEFAULT_LABOR_UNITS).totalHours;
    const eight = estimateCircuitLabor(circuits, { ...DEFAULT_LABOR_UNITS, jointsPerCircuit: 8 }).totalHours;
    expect(eight - two).toBeCloseTo(6 * DEFAULT_LABOR_UNITS.perJointMed, 5);
  });

  it('still answers when a saved job predates a unit being added', () => {
    // Old jobs carry whatever laborUnits existed when they were saved. A
    // missing key must fall back, not produce NaN hours in a bid.
    const legacy = { perFtSmall: 0.06, perFtMed: 0.09, perFtLarge: 0.13, stickLength: 20 };
    const r = estimateCircuitLabor(circuits, legacy);
    expect(Number.isFinite(r.totalHours)).toBe(true);
    expect(r.totalHours).toBeGreaterThan(0);
  });
});

describe('saying which units anybody has actually checked', () => {
  it('covers every unit the library ships', () => {
    // A unit with no provenance entry would render as unmarked, which reads as
    // confirmed. Silence is the one answer this must never give.
    for (const key of Object.keys(DEFAULT_LABOR_UNITS)) {
      expect(UNIT_PROVENANCE, key).toHaveProperty(key);
    }
  });

  it('marks the brazing times as confirmed — those were checked', () => {
    for (const k of ['perJointSmall', 'perJointMed', 'perJointLarge']) {
      expect(provenanceOf(k).state, k).toBe('confirmed');
    }
  });

  it('does not claim the case hookup is an estimate', () => {
    // "It's always different, too many variables." A flat number is the wrong
    // SHAPE for this one, and pretending otherwise is the kind of quiet
    // confidence that loses a job.
    expect(provenanceOf('perCase').state).toBe('varies');
    expect(provenanceOf('perCase').note).toMatch(/too many variables/i);
  });

  it('leaves the footage rates honestly unconfirmed', () => {
    for (const k of ['perFtSmall', 'perFtMed', 'perFtLarge', 'perRackTie']) {
      expect(provenanceOf(k).state, k).toBe('unconfirmed');
    }
  });

  it('gives an unknown key the cautious answer, not a blank one', () => {
    expect(provenanceOf('somethingAddedLater').state).toBe('unconfirmed');
    expect(provenanceOf('somethingAddedLater').note).toBeTruthy();
  });

  it('has a mark for every state it can report', () => {
    for (const key of Object.keys(UNIT_PROVENANCE)) {
      expect(PROVENANCE_MARK[UNIT_PROVENANCE[key].state], key).toBeTruthy();
    }
  });

  it('counts what the estimator is standing on', () => {
    const t = unitsConfidence();
    expect(t.confirmed).toBe(3);
    expect(t.varies).toBe(1);
    expect(t.confirmed + t.varies + t.unconfirmed).toBe(Object.keys(UNIT_PROVENANCE).length);
  });
});
