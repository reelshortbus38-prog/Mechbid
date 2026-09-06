import { describe, it, expect } from 'vitest';
import {
  casesFromApplication, caseHookupLines, caseHookupJoints,
  DEFAULT_STUB_FT, DEFAULT_DRAIN_FT, JOINTS_PER_CASE,
} from './caseHookup.js';

// ── READING THE COUNT OFF THE LEGEND ────────────────────────────────────────
// "The legend that I upload usually says what cases are hooked to each
// circuit." It already reaches the app in the circuit's application field —
// the UI placeholder has read "MD Produce 2-4, N71" from the beginning.
describe('casesFromApplication', () => {
  it('reads a case range', () => {
    const r = casesFromApplication('MD Produce 2-4, N71');
    expect(r.cases).toBe(3);
    expect(r.basis).toContain('cases 2 through 4');
  });

  it('reads a longer range', () => {
    expect(casesFromApplication('DAIRY 12-18').cases).toBe(7);
  });

  it('reads an en dash and the word "to"', () => {
    expect(casesFromApplication('Frozen 3–6').cases).toBe(4);
    expect(casesFromApplication('Meat 1 to 5').cases).toBe(5);
  });

  it('reads a comma or ampersand list', () => {
    expect(casesFromApplication('Deli 6, 7, 8').cases).toBe(3);
    expect(casesFromApplication('Produce 2 & 3').cases).toBe(2);
    expect(casesFromApplication('Bakery 4 and 5').cases).toBe(2);
  });

  it('does not read a pipe size as a case range', () => {
    // "1-1/8" is a suction line, not cases one through eight. This is the read
    // that would multiply a circuit's labor by eight.
    expect(casesFromApplication('1-1/8 suction')).toBeNull();
    expect(casesFromApplication('MD 1-1/8 to case')).toBeNull();
  });

  it('does not read a drawing tag as a count', () => {
    expect(casesFromApplication('N71')).toBeNull();
    expect(casesFromApplication('Rack A')).toBeNull();
  });

  it('rejects a descending or absurd range', () => {
    expect(casesFromApplication('Produce 9-2')).toBeNull();
    expect(casesFromApplication('Aisle 2-400')).toBeNull();
  });

  it('is null on nothing useful', () => {
    expect(casesFromApplication('')).toBeNull();
    expect(casesFromApplication(undefined)).toBeNull();
    expect(casesFromApplication('Produce')).toBeNull();
    // A single number is a case NUMBER, not a count of cases.
    expect(casesFromApplication('Produce 4')).toBeNull();
  });
});

// ── THE MATERIAL ────────────────────────────────────────────────────────────
describe('caseHookupLines', () => {
  const base = { cases: 8, sucSize: '1-1/8"', liqSize: '1/2"' };
  const descs = opts => caseHookupLines({ ...base, ...opts }).map(l => l.desc).join(' | ');

  it('multiplies stubs by the case count', () => {
    const lines = caseHookupLines(base);
    const suc = lines.find(l => /suction stubs/.test(l.desc));
    expect(suc.qty).toBe(8 * DEFAULT_STUB_FT);
    expect(suc.unit).toBe('ft');
  });

  it('does NOT price a liquid ball valve at the case', () => {
    // "For the ones I've done that's not a loop system the EPR and liquid ball
    // valves are on the rack." Forty valves in the motor room, not forty at
    // the cases — they are rack parts and already on that list.
    expect(descs()).not.toMatch(/ball valve/i);
    expect(descs()).not.toMatch(/\bEPR\b/i);
  });

  it('runs the drains, because those are in scope', () => {
    // "We run all drains from the case to the drain hub on the floor." The
    // first draft of this module left them out entirely.
    const lines = caseHookupLines(base);
    const drain = lines.find(l => /PVC case drain/.test(l.desc));
    expect(drain).toBeTruthy();
    expect(drain.qty).toBe(8 * DEFAULT_DRAIN_FT);
    expect(drain.unit).toBe('ft');
    expect(lines.some(l => /drain fittings/i.test(l.desc) && l.unit === 'lot')).toBe(true);
  });

  it('leaves TXVs off by default', () => {
    // "I think the energy team comes in and sets them now."
    expect(descs()).not.toMatch(/TXV/);
  });

  it('adds TXVs for a shop that sets its own', () => {
    const lines = caseHookupLines({ ...base, setsTxv: true });
    const txv = lines.find(l => /TXV/.test(l.desc));
    expect(txv.qty).toBe(8);
    expect(txv.unit).toBe('ea');
  });

  it('insulates the suction stub and not the liquid', () => {
    const lines = caseHookupLines(base);
    expect(lines.filter(l => /insulation/i.test(l.desc))).toHaveLength(1);
    expect(lines.find(l => /insulation/i.test(l.desc)).pipeSize).toBe('1-1/8"');
  });

  it('skips insulation when the job does not insulate', () => {
    expect(descs({ insulate: false })).not.toMatch(/insulation/i);
  });

  it('generates nothing for a job with no cases', () => {
    expect(caseHookupLines({ ...base, cases: 0 })).toEqual([]);
    expect(caseHookupLines({})).toEqual([]);
  });

  it('skips a stub whose size nobody has set', () => {
    // Better an absent line than a line reading '" Case liquid stubs'.
    expect(descs({ liqSize: '' })).not.toMatch(/liquid stubs/);
  });

  it('honours stub and drain lengths set for the job', () => {
    const lines = caseHookupLines({ ...base, stubFt: 8, drainFt: 30 });
    expect(lines.find(l => /suction stubs/.test(l.desc)).qty).toBe(64);
    expect(lines.find(l => /PVC case drain/.test(l.desc)).qty).toBe(240);
  });

  it('drops the drain lines when the hub distance is zeroed out', () => {
    expect(descs({ drainFt: 0 })).not.toMatch(/drain/i);
  });

  it('carries a correct unit on every line', () => {
    for (const l of caseHookupLines({ ...base, setsTxv: true })) {
      expect(['ft', 'ea', 'lot']).toContain(l.unit);
    }
  });

  it('says what each quantity is built from', () => {
    // These lines are an assumption about a store nobody has walked. A quantity
    // an estimator cannot trace is one they cannot correct.
    for (const l of caseHookupLines(base)) expect(l.notes).toBeTruthy();
  });
});

describe('caseHookupJoints', () => {
  it('is four per case — suction on and off, liquid on and off', () => {
    expect(caseHookupJoints(8)).toBe(8 * JOINTS_PER_CASE);
    expect(caseHookupJoints(0)).toBe(0);
    expect(caseHookupJoints()).toBe(0);
  });
});
