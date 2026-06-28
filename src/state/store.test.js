import { describe, it, expect } from 'vitest';
import {
  normalizePipeSize, pipeSizeBucket,
  calcLaborPeriodCost, calcRackTaskCost, calcRackLaborTotal,
  calcFieldTaskCost, calcFieldTasksTotal, avgCrewRate,
  estimateCircuitLabor, DEFAULT_LABOR_UNITS,
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
