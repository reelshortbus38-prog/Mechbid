import { describe, it, expect } from 'vitest';
import {
  CONDITIONS, CONDITION_KEYS, DEFAULT_CONDITION_PCT, MCAA_JOINT_OCCUPANCY,
  isCondition, conditionOf, conditionShort, conditionMultiplier,
  conditionAdjustment, conditionLine, conditionsConfigured,
  jobConditionsOf, unitsBasisOf,
} from './conditionFactor.js';
import { circuitTaskRow } from './laborUnits.js';

// ── THE WHOLE POINT OF THE FILE ──────────────────────────────────────────────
// Everything else here is detail. If these three fail, the feature is the
// $44,000 mistake the review already made once, shipped.
describe('a factor cannot charge the same conditions twice', () => {
  it('is exactly 1 when the job matches the conditions the units were measured on', () => {
    // A live-store factor of 25%, on a live-store job, priced with units that
    // were MEASURED on a live-store job. The slowdown is already in the units.
    const pct = { new: 0, closed: 10, live: 25 };
    expect(conditionMultiplier('live', 'live', pct)).toBe(1);
    const adj = conditionAdjustment({ hours: 341, jobConditions: 'live', unitsBasis: 'live', pct });
    expect(adj.applies).toBe(false);
    expect(adj.adjustedHours).toBe(341);
    expect(adj.reason).toBe('same');
    expect(adj.note).toMatch(/already inside the units/i);
  });

  it('prices the DIFFERENCE between two rungs, not the job rung outright', () => {
    const pct = { new: 0, closed: 10, live: 25 };
    // Units off a closed remodel, bidding a live store. The naive answer is
    // 1.25. The right answer is 1.25/1.10 — the closed-store slowdown is
    // already paid for in the units.
    expect(conditionMultiplier('live', 'closed', pct)).toBeCloseTo(1.25 / 1.10, 6);
    expect(conditionMultiplier('live', 'closed', pct)).toBeLessThan(1.25);
  });

  it('runs BELOW one when the job is cleaner than the units came off', () => {
    const pct = { new: 0, closed: 10, live: 25 };
    const m = conditionMultiplier('new', 'live', pct);
    expect(m).toBeCloseTo(1 / 1.25, 6);
    expect(m).toBeLessThan(1);
    const adj = conditionAdjustment({ hours: 400, jobConditions: 'new', unitsBasis: 'live', pct });
    expect(adj.adjustedHours).toBeLessThan(400);
    expect(adj.deltaHours).toBeLessThan(0);
    expect(adj.note).toMatch(/too slow for this work/i);
  });
});

describe('it ships inert', () => {
  it('every shipped factor is zero', () => {
    for (const k of CONDITION_KEYS) expect(DEFAULT_CONDITION_PCT[k]).toBe(0);
  });

  it('shipped factors mean ×1 between any two rungs', () => {
    for (const a of CONDITION_KEYS) {
      for (const b of CONDITION_KEYS) {
        expect(conditionMultiplier(a, b, DEFAULT_CONDITION_PCT)).toBe(1);
      }
    }
  });

  it('leaves the hours alone with no basis set, and says why', () => {
    const adj = conditionAdjustment({ hours: 341, jobConditions: 'live', unitsBasis: null, pct: { live: 25 } });
    expect(adj.applies).toBe(false);
    expect(adj.multiplier).toBe(1);
    expect(adj.adjustedHours).toBe(341);
    expect(adj.reason).toBe('no-basis');
    expect(adj.note).toMatch(/has not been told what conditions your labor units describe/i);
  });

  it('never guesses a basis from the project type — that guess IS the double-count', () => {
    // jobConditionsOf reads projectType; unitsBasisOf must not.
    expect(jobConditionsOf({ projectType: 'remodel' })).toBe('closed');
    expect(jobConditionsOf({ projectType: 'new' })).toBe('new');
    expect(unitsBasisOf({ projectType: 'remodel' })).toBe(null);
    expect(unitsBasisOf({ projectType: 'new' })).toBe(null);
  });

  it('never seeds a job onto the live-store rung on its own', () => {
    // 'live' is the expensive rung. It only ever arrives by being chosen.
    expect(jobConditionsOf({})).not.toBe('live');
    expect(jobConditionsOf({ projectType: 'remodel' })).not.toBe('live');
    expect(jobConditionsOf({ jobConditions: 'live' })).toBe('live');
  });
});

describe('bad input cannot produce a bad bid', () => {
  it('ignores rungs that are not on the ladder', () => {
    expect(conditionMultiplier('underwater', 'closed', { closed: 10 })).toBe(1);
    expect(conditionMultiplier('live', 'underwater', { live: 25 })).toBe(1);
    expect(isCondition('underwater')).toBe(false);
    expect(isCondition('live')).toBe(true);
  });

  it('clamps a factor that would drive the hours to nothing', () => {
    const adj = conditionAdjustment({ hours: 100, jobConditions: 'live', unitsBasis: 'new', pct: { live: -500 } });
    expect(adj.adjustedHours).toBeGreaterThan(0);
    expect(adj.multiplier).toBeGreaterThan(0);
  });

  it('survives junk in the percentages', () => {
    for (const junk of [undefined, null, NaN, 'lots', {}, []]) {
      const adj = conditionAdjustment({ hours: 200, jobConditions: 'live', unitsBasis: 'new', pct: { live: junk } });
      expect(Number.isFinite(adj.adjustedHours)).toBe(true);
      expect(adj.adjustedHours).toBe(200);
    }
  });

  it('always returns hours, on every path', () => {
    const paths = [
      {}, { hours: 50 },
      { hours: 50, unitsBasis: 'new' },
      { hours: 50, jobConditions: 'live' },
      { hours: 50, jobConditions: 'live', unitsBasis: 'new' },
      { hours: 50, jobConditions: 'live', unitsBasis: 'new', pct: { live: 20 } },
    ];
    for (const p of paths) {
      const adj = conditionAdjustment(p);
      expect(Number.isFinite(adj.adjustedHours)).toBe(true);
      expect(adj.adjustedHours).toBeGreaterThanOrEqual(0);
      expect(typeof adj.note).toBe('string');
      expect(adj.note.length).toBeGreaterThan(0);
    }
  });

  it('two rungs set to the same factor read as no difference, not as an adjustment', () => {
    // This is the shape of the review's answer — live and closed both came back
    // at the same figure. The app must not pretend that says something.
    const adj = conditionAdjustment({
      hours: 341, jobConditions: 'live', unitsBasis: 'closed', pct: { closed: 15, live: 15 },
    });
    expect(adj.applies).toBe(false);
    expect(adj.reason).toBe('flat');
    expect(adj.adjustedHours).toBe(341);
  });
});

describe('what it says on screen', () => {
  it('names both conditions, so the estimator can check the claim', () => {
    const adj = conditionAdjustment({
      hours: 341, jobConditions: 'live', unitsBasis: 'closed', pct: { closed: 10, live: 25 },
    });
    expect(adj.applies).toBe(true);
    expect(adj.note).toMatch(/closed remodel/i);
    expect(adj.note).toMatch(/live store/i);
    expect(adj.note).toMatch(/only the difference is priced/i);
  });

  it('has a line for a summary row, and none when nothing applies', () => {
    const on = conditionAdjustment({ hours: 341, jobConditions: 'live', unitsBasis: 'new', pct: { live: 20 } });
    expect(conditionLine(on)).toMatch(/×1\.200/);
    expect(conditionLine(on)).toMatch(/\+68\.2 man-hrs/);
    expect(conditionLine(conditionAdjustment({ hours: 341 }))).toBe(null);
  });

  it('every rung has a label, a short name and a plain-language note', () => {
    for (const c of CONDITIONS) {
      expect(c.label.length).toBeGreaterThan(0);
      expect(c.short.length).toBeGreaterThan(0);
      expect(c.note.length).toBeGreaterThan(20);
      expect(conditionOf(c.key)).toBe(c);
      expect(conditionShort(c.key)).toBe(c.short);
    }
    expect(conditionOf('nope')).toBe(null);
    expect(conditionShort('nope')).toBe('');
  });

  it('the offered starting point is the published one, not one this app made up', () => {
    expect(MCAA_JOINT_OCCUPANCY).toEqual({ minor: 5, average: 12, severe: 20 });
  });

  it('knows whether the shop has told it anything', () => {
    expect(conditionsConfigured({})).toBe(false);
    expect(conditionsConfigured({ conditionPct: { new: 0, closed: 0, live: 0 } })).toBe(false);
    expect(conditionsConfigured({ unitsBasis: 'closed' })).toBe(true);
    expect(conditionsConfigured({ conditionPct: { live: 20 } })).toBe(true);
  });
});

// ── THE FACTOR HAS TO REACH THE ROWS ─────────────────────────────────────────
// A number on a card that the generated tasks do not carry is decoration. This
// tests the function the Generate button actually calls.
describe('generated field tasks carry the factor', () => {
  const pc = { circuitId: 'A1', application: 'MT Cases', ft: 150, hours: 20 };

  it('scales the man-hours, and men × hrs still comes to them', () => {
    const row = circuitTaskRow(pc, { crewSize: 2, multiplier: 1.25 });
    expect(row.men * row.hrs).toBeCloseTo(25, 2);
    expect(row.notes).toMatch(/25 man-hours over 2 men/);
  });

  it('shows its working — what the units said, and what moved it', () => {
    const row = circuitTaskRow(pc, {
      crewSize: 2, multiplier: 1.25, basisLabel: 'closed remodel', jobLabel: 'live store',
    });
    expect(row.notes).toMatch(/20 at unit rates ×1\.250/);
    expect(row.notes).toMatch(/live store conditions against closed remodel units/);
  });

  it('says nothing about conditions when nothing was applied', () => {
    const row = circuitTaskRow(pc, { crewSize: 2, multiplier: 1 });
    expect(row.men * row.hrs).toBeCloseTo(20, 2);
    expect(row.notes).not.toMatch(/unit rates/);
    expect(row.notes).not.toMatch(/conditions/);
  });

  it('stays a generated row — countGeneratedTasks reads this string', () => {
    for (const m of [1, 1.25, 0.8]) {
      expect(circuitTaskRow(pc, { multiplier: m }).notes).toMatch(/auto-estimated/i);
    }
  });

  it('ignores a nonsense multiplier rather than zeroing the row', () => {
    for (const m of [0, -1, NaN, undefined, 'x']) {
      const row = circuitTaskRow(pc, { crewSize: 2, multiplier: m });
      expect(row.men * row.hrs).toBeCloseTo(20, 2);
    }
  });

  it('carries the circuit through to a row an estimator can read', () => {
    const row = circuitTaskRow(pc, { crewSize: 3, multiplier: 1, mode: 'Commercial Refrigeration', mintId: () => 'x1' });
    expect(row.id).toBe('x1');
    expect(row.desc).toBe('Run & connect A1 — MT Cases (150ft)');
    expect(row.mode).toBe('Commercial Refrigeration');
    expect(row.men).toBe(3);
  });
});
