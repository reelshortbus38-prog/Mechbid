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
