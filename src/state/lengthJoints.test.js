import { describe, it, expect } from 'vitest';
import {
  lengthJoints, estimateCircuitLabor, DEFAULT_LABOR_UNITS, jointSpacingFt,
} from './store.js';

// ── FENCEPOSTS ──────────────────────────────────────────────────────────────
// A run is made of segments and the joints are BETWEEN them. n segments, n-1
// joints. The app used to charge one per segment, which brazes the last one
// twice on every circuit in every bid.
describe('lengthJoints', () => {
  it('is one less than the number of sticks', () => {
    // 150 ft of 20 ft stick is eight sticks and seven joints.
    expect(lengthJoints(150, 20)).toBe(7);
    expect(lengthJoints(40, 20)).toBe(1);
    expect(lengthJoints(60, 20)).toBe(2);
  });

  it('is zero for a run that fits in one piece', () => {
    // This is where the old formula was worst. A 20 ft riser is ONE stick with
    // nothing to braze along it, and it was being charged a full joint —
    // the smallest circuits carrying the largest share of the error.
    expect(lengthJoints(20, 20)).toBe(0);
    expect(lengthJoints(12, 20)).toBe(0);
    expect(lengthJoints(1, 20)).toBe(0);
  });

  it('is zero for no run at all', () => {
    expect(lengthJoints(0, 20)).toBe(0);
    expect(lengthJoints(-50, 20)).toBe(0);
    expect(lengthJoints(undefined, 20)).toBe(0);
  });

  it('counts a part stick as a stick — you still had to cut it', () => {
    expect(lengthJoints(41, 20)).toBe(2);   // three sticks, two joints
    expect(lengthJoints(21, 20)).toBe(1);   // two sticks, one joint
  });

  it('follows the coil length on soft copper', () => {
    // 400 ft in the floor is eight 50 ft coils and seven joints, not the
    // nineteen a 20 ft stick length would have charged.
    expect(lengthJoints(400, 50)).toBe(7);
    expect(lengthJoints(400, 20)).toBe(19);
  });

  it('survives a nonsense spacing rather than dividing by zero', () => {
    expect(lengthJoints(100, 0)).toBe(4);      // falls back to a 20 ft stick
    expect(Number.isFinite(lengthJoints(100, -5))).toBe(true);
  });
});

// ── WHAT IT WAS COSTING ─────────────────────────────────────────────────────
describe('the circuits that were charged a joint they do not have', () => {
  const est = c => estimateCircuitLabor([c], DEFAULT_LABOR_UNITS);

  it('takes one full braze off a long circuit', () => {
    // 150 ft medium: seven joints along the run, not eight.
    const p = est({ circuitId: 'A1', runLength: 150, sucHoriz: '1-1/8', fittingJoints: 4 }).perCircuit[0];
    expect(jointSpacingFt({ runLength: 150 }, DEFAULT_LABOR_UNITS)).toBe(20);
    expect(p.joints).toBe(7 + 4);
  });

  it('charges a single-stick riser no run joints at all', () => {
    const p = est({ circuitId: 'R1', runLength: 0, riserLength: 18, isRiserOnly: true, sucHoriz: '7/8', fittingJoints: 2 }).perCircuit[0];
    // Eighteen feet is one stick. The two joints left are its fittings.
    expect(p.joints).toBe(2);
  });

  it('still bills the ends — they were never the missing joint', () => {
    // The rack tie and the case hookup are their own units and did not move.
    // A circuit with no run and no fittings still costs both of them.
    const { totalHours } = est({ circuitId: 'X', runLength: 0, sucHoriz: '1-1/8', fittingJoints: 0 });
    expect(totalHours).toBeCloseTo(DEFAULT_LABOR_UNITS.perCase + DEFAULT_LABOR_UNITS.perRackTie, 5);
  });

  it('moves every bid the same direction — down, never up', () => {
    for (const ft of [10, 20, 45, 100, 150, 300, 800]) {
      const c = { circuitId: 'C', runLength: ft, sucHoriz: '1-1/8', fittingJoints: 3 };
      const now = estimateCircuitLabor([c], DEFAULT_LABOR_UNITS).perCircuit[0].joints;
      const before = Math.ceil(ft / 20) + 3;
      expect(now, `${ft} ft`).toBeLessThanOrEqual(before);
    }
  });
});
