import { describe, it, expect } from 'vitest';
import {
  splitAcrossCrew, manHoursOf, provenanceOf, unitsConfidence,
  UNIT_PROVENANCE, PROVENANCE_MARK,
} from './laborUnits.js';
import { DEFAULT_LABOR_UNITS, estimateCircuitLabor, calcFieldTaskCost, circuitJoints } from '../state/store.js';
import { scopeManHours, SCOPE_UNIT_KEYS } from './scopeUnits.js';

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
  // One circuit per size bucket so a rate that only applies to small pipe has
  // something small to apply to, one with a riser so the riser fittings have
  // somewhere to land, and one in the FLOOR at a size soft copper is made in,
  // so the coil length has a line that is jointed by the coil.
  const allBuckets = [
    { circuitId: 'S', runLength: 60, riserLength: 0, sucHoriz: '7/8' },
    { circuitId: 'M', runLength: 150, riserLength: 18, sucHoriz: '1-3/8' },
    { circuitId: 'L', runLength: 250, riserLength: 0, sucHoriz: '2-1/8' },
    { circuitId: 'F', runLength: 400, riserLength: 0, sucHoriz: '7/8', inFloor: true },
  ];

  it('moves the answer when ANY circuit unit is changed', () => {
    // A unit that changes nothing is a box the estimator can type into that
    // does not reach the bid.
    const base = estimateCircuitLabor(allBuckets, DEFAULT_LABOR_UNITS).totalHours;
    for (const key of Object.keys(DEFAULT_LABOR_UNITS)) {
      if (SCOPE_UNIT_KEYS.includes(key)) continue;   // priced by scopeManHours, not from circuits
      const bumped = { ...DEFAULT_LABOR_UNITS, [key]: DEFAULT_LABOR_UNITS[key] * 2 };
      expect(estimateCircuitLabor(allBuckets, bumped).totalHours, `${key} does nothing`).not.toBe(base);
    }
  });

  it('every unit reaches SOMETHING — no box that only looks connected', () => {
    // The exemption above is a real division of labor, not a hole. The scope
    // units price off counts rather than circuits, so they are checked against
    // the estimator that actually reads them. Between the two, every key in
    // the library has to move a number somewhere.
    const counts = { racks: 2, walkInPanels: 20 };
    const circuitBase = estimateCircuitLabor(allBuckets, DEFAULT_LABOR_UNITS).totalHours;
    const scopeBase = scopeManHours(counts, DEFAULT_LABOR_UNITS);
    for (const key of Object.keys(DEFAULT_LABOR_UNITS)) {
      const bumped = { ...DEFAULT_LABOR_UNITS, [key]: DEFAULT_LABOR_UNITS[key] * 2 };
      const moved = estimateCircuitLabor(allBuckets, bumped).totalHours !== circuitBase
        || scopeManHours(counts, bumped) !== scopeBase;
      expect(moved, `${key} reaches neither estimator`).toBe(true);
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

describe('fittings — the number you cannot get from a drawing', () => {
  // "You don't know where you'll have to turn or ell up until you get there and
  // look at it." Two circuits of the same length through different parts of a
  // store are different jobs, so footage cannot produce this number. What the
  // app can do is be honest about which circuits are standing on an allowance.

  it('uses a counted number when somebody walked the route', () => {
    const c = { circuitId: 'A', runLength: 150, fittingJoints: 14 };
    // All fourteen are LOOSE: nothing says which of them are bunched together,
    // so none get the cluster discount. See clusterJointEquivalent.
    expect(circuitJoints(c, DEFAULT_LABOR_UNITS))
      .toEqual({ joints: 14, loose: 14, clustered: 0, source: 'counted' });
  });

  it('lets a walked circuit count ZERO fittings', () => {
    // A straight shot down one aisle is rare but real, and a falsy-zero bug
    // would silently put the allowance back on it.
    expect(circuitJoints({ fittingJoints: 0 }, DEFAULT_LABOR_UNITS))
      .toEqual({ joints: 0, loose: 0, clustered: 0, source: 'counted' });
  });

  it('never lets an allowance override a counted number', () => {
    const c = { fittingJoints: 6, riserLength: 30 };
    const big = { ...DEFAULT_LABOR_UNITS, jointsPerCircuit: 40, jointsPerRiser: 40 };
    expect(circuitJoints(c, big).joints).toBe(6);
  });

  it('adds the riser fittings only to circuits that have a riser', () => {
    // The ells up and over and the P-trap at the bottom. This part IS knowable
    // — the riser length is on the sheet.
    const flat = circuitJoints({ runLength: 150, riserLength: 0 }, DEFAULT_LABOR_UNITS);
    const dropped = circuitJoints({ runLength: 150, riserLength: 22 }, DEFAULT_LABOR_UNITS);
    expect(dropped.joints - flat.joints).toBe(DEFAULT_LABOR_UNITS.jointsPerRiser);
    expect(flat.source).toBe('assumed');
  });

  it('treats a riser-only circuit as having a riser', () => {
    const r = circuitJoints({ isRiserOnly: true, riserLength: 0 }, DEFAULT_LABOR_UNITS);
    expect(r.joints).toBe(DEFAULT_LABOR_UNITS.jointsPerCircuit + DEFAULT_LABOR_UNITS.jointsPerRiser);
  });

  it('reports how many circuits are running on an allowance', () => {
    const est = estimateCircuitLabor([
      { circuitId: '1', runLength: 150, sucHoriz: '1-3/8' },
      { circuitId: '2', runLength: 90, sucHoriz: '7/8', fittingJoints: 12 },
      { circuitId: '3', runLength: 60, sucHoriz: '7/8' },
    ], DEFAULT_LABOR_UNITS);
    // Two guessed, one walked. An estimator who cannot see which is which
    // cannot tell a takeoff from a placeholder.
    expect(est.assumedFittings).toBe(2);
    expect(est.perCircuit.map(p => p.fittingsSource)).toEqual(['assumed', 'counted', 'assumed']);
  });

  it('makes a walked circuit cost more when it turns more corners', () => {
    const base = { circuitId: 'X', runLength: 150, sucHoriz: '1-3/8' };
    const straight = estimateCircuitLabor([{ ...base, fittingJoints: 2 }], DEFAULT_LABOR_UNITS).totalHours;
    const winding = estimateCircuitLabor([{ ...base, fittingJoints: 14 }], DEFAULT_LABOR_UNITS).totalHours;
    expect(winding - straight).toBeCloseTo(12 * DEFAULT_LABOR_UNITS.perJointMed, 5);
  });

  it('ignores a fittings value that is not a number', () => {
    for (const bad of ['', null, undefined, 'lots', -4]) {
      expect(circuitJoints({ fittingJoints: bad }, DEFAULT_LABOR_UNITS).source, String(bad)).toBe('assumed');
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

  it('marks the brazing times DISPUTED, because two people who do this disagree', () => {
    // These were 'confirmed' on one working foreman's read. The 2026-09-12
    // review put a large joint at 0.15 hr against the 1.1 hr standing here —
    // about 7x. Joints dominate the estimate, so on a twenty-circuit store
    // that is 341 man-hours against 217.
    //
    // Leaving a checkmark on a figure in open dispute is the app claiming a
    // confidence nobody has.
    for (const k of ['perJointSmall', 'perJointMed', 'perJointLarge']) {
      expect(provenanceOf(k).state, k).toBe('disputed');
      expect(provenanceOf(k).note, k).toMatch(/0\.15 hr/);
      expect(provenanceOf(k).note, k).toMatch(/1\.1 hr/);
    }
  });

  it('names BOTH readings, so neither person is quietly overruled', () => {
    // A dispute reported as a single number is not a dispute, it is a decision
    // taken by an app that is not qualified to take it.
    const note = provenanceOf('perJointLarge').note;
    expect(note).toMatch(/foreman/i);
    expect(note).toMatch(/nothing has been changed/i);
  });

  it('says the per-foot rate rests on a counted day, and says how it was counted', () => {
    // The only figure in this table standing on a job rather than an opinion.
    // The note has to carry the working, because "0.075" on its own is just
    // another number somebody would have to take on trust.
    const note = provenanceOf('perFtMed').note;
    expect(note).toMatch(/0\.075/);
    expect(note).toMatch(/400 ft/);
    expect(note).toMatch(/three men/);
    expect(note).toMatch(/ten hours/);
  });

  it('does not oversell one day as a body of evidence', () => {
    // It is a single job. Better than everything else here and still one day.
    expect(provenanceOf('perFtSmall').note).toMatch(/one day on one job is not a body of evidence/i);
  });

  it('does not claim the fittings count is an estimate either', () => {
    // It cannot be worked out from a drawing at all — which corners a run
    // turns is something you learn by walking it.
    expect(provenanceOf('jointsPerCircuit').state).toBe('varies');
    expect(provenanceOf('jointsPerCircuit').note).toMatch(/walking it/i);
  });

  it('does not claim the case hookup is an estimate', () => {
    // "It's always different, too many variables." A flat number is the wrong
    // SHAPE for this one, and pretending otherwise is the kind of quiet
    // confidence that loses a job.
    expect(provenanceOf('perCase').state).toBe('varies');
    expect(provenanceOf('perCase').note).toMatch(/too many variables/i);
  });

  it('leaves the rack tie honestly unconfirmed — nobody has looked at it', () => {
    // The distinction that matters: unconfirmed is "nobody checked", disputed
    // is "two people checked and disagree". Rounding one to the other loses
    // the only useful thing either state says.
    expect(provenanceOf('perRackTie').state).toBe('unconfirmed');
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
    // Five in open dispute: the three brazing times, the rack set and the
    // walk-in panel. Three footage rates resting on a counted day. The case
    // hookup, the fittings count and the rack commissioning marked as varying
    // — the first two because a working estimator refused to put one number on
    // them, the third because both sources gave a 2x range rather than a
    // figure.
    expect(t.disputed).toBe(5);    // three brazing times, the rack set, the walk-in panel
    expect(t.confirmed).toBe(3);   // the footage rates, off a counted day
    expect(t.varies).toBe(3);
    expect(t.confirmed + t.varies + t.unconfirmed + t.disputed)
      .toBe(Object.keys(UNIT_PROVENANCE).length);
  });

  it('counts a new state instead of tallying NaN onto the screen', () => {
    // The tally used to be a hand-written object of three keys. A state it did
    // not know about landed on undefined and came out NaN — which renders as
    // nothing, and reads as good news.
    const t = unitsConfidence();
    for (const state of Object.keys(PROVENANCE_MARK)) {
      expect(Number.isFinite(t[state]), state).toBe(true);
    }
  });

  it('gives disputed its own mark, distinct from every other state', () => {
    const marks = Object.values(PROVENANCE_MARK);
    expect(new Set(marks).size).toBe(marks.length);
    expect(PROVENANCE_MARK.disputed).toBeTruthy();
  });
});

// ── THE THREE FOOTAGE BUCKETS ARE EQUAL ON PURPOSE ──────────────────────────
describe('the per-foot rate', () => {
  it('is the same for every size, because that is what was measured', () => {
    // Not an oversight, and not a placeholder waiting to be filled in. For the
    // sizes actually run — 1/2"-7/8" liquid, 5/8"-1 5/8" suction — the mechanic
    // who runs the pipe says the time does not change with the size: "it's the
    // materials that changes the price on the bid."
    //
    // It holds together with how this app splits the work. Brazing a bigger
    // joint DOES take longer and is charged separately in perJoint*. What is
    // left in the per-foot unit is hanging and routing the line, and a hallway
    // is the same length whatever is going down it.
    //
    // This test exists so that a later reader who sees three identical numbers
    // does not "fix" them back into a spread.
    const { perFtSmall, perFtMed, perFtLarge } = DEFAULT_LABOR_UNITS;
    expect(perFtSmall).toBe(0.075);
    expect(perFtMed).toBe(perFtSmall);
    expect(perFtLarge).toBe(perFtSmall);
  });

  it('is the counted day and not a rounding of it', () => {
    // 400 ft, three men, ten hours. 30 man-hours over 400 ft.
    expect(DEFAULT_LABOR_UNITS.perFtMed).toBeCloseTo((3 * 10) / 400, 6);
  });

  it('still has three separate fields for a shop with a wider range', () => {
    // Equal today is not the same as merged forever. A shop running 2-5/8"
    // headers has a different answer, and it is editable per job.
    for (const k of ['perFtSmall', 'perFtMed', 'perFtLarge']) {
      expect(DEFAULT_LABOR_UNITS, k).toHaveProperty(k);
    }
  });
});
