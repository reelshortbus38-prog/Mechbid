import { describe, it, expect } from 'vitest';
import {
  casesFromApplication, caseHookupLines,
  DEFAULT_STUB_FT, DEFAULT_CASE_FT, LINEUP_POSITIONS,
  END_CASE_SUCTION, END_CASE_LIQUID, START_CASE_SUCTION, START_CASE_LIQUID,
  MIDDLE_CASE_SUCTION, MIDDLE_CASE_LIQUID,
} from './caseHookup.js';
import { fittingPrice } from './fittingPrices.js';

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
    expect(drain.unit).toBe('ft');
    expect(lines.some(l => /drain fittings/i.test(l.desc) && l.unit === 'lot')).toBe(true);
  });

  it('runs a drain the LENGTH OF THE CASE, not a walk to a hub', () => {
    // "They try to have a hub under every case, so the longest run would be 12
    // ft on a 12 ft case, 8 ft on a 8 ft case." This was modelled as distance
    // to a hub and defaulted to 15 ft — the wrong shape, not just the wrong
    // number, because it gave a shop with 8 ft cases no way to be right.
    const twelve = caseHookupLines({ ...base, caseFt: 12 });
    const eight = caseHookupLines({ ...base, caseFt: 8 });
    expect(twelve.find(l => /PVC case drain/.test(l.desc)).qty).toBe(8 * 12);
    expect(eight.find(l => /PVC case drain/.test(l.desc)).qty).toBe(8 * 8);
    expect(DEFAULT_CASE_FT).toBe(12);
  });

  it('says on the line that the quantity is the case length', () => {
    const drain = caseHookupLines(base).find(l => /PVC case drain/.test(l.desc));
    expect(drain.notes).toMatch(/CASE LENGTH/);
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

  it('honours stub and case lengths set for the job', () => {
    const lines = caseHookupLines({ ...base, stubFt: 8, caseFt: 10 });
    expect(lines.find(l => /suction stubs/.test(l.desc)).qty).toBe(64);
    expect(lines.find(l => /PVC case drain/.test(l.desc)).qty).toBe(80);
  });

  it('drops the drain lines when the case length is zeroed out', () => {
    expect(descs({ caseFt: 0 })).not.toMatch(/drain/i);
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

// ── WHERE A CASE SITS DECIDES ITS FITTINGS ──────────────────────────────────
// "For piping on top of the cases, just for the top of the case on the end
//  case, there is usually 2 ells, 1 street ell, a coupling, and a bushing for
//  suction. For liquid it would be 2 ells, a coupling and a bushing."
//
// "For cases that start the line up it would be one coupling, one bushing, a
//  tee, and one ell for liquid and 2 for suction."
describe('lineup fittings', () => {
  const lines = caseHookupLines({ cases: 8, sucSize: '1-1/8"', liqSize: '1/2"' });
  const at = (size, type, line, pos) =>
    lines.find(l => l.desc === `${size} ${type} — ${line} at ${pos}`);

  it('terminates the end case with no tee', () => {
    // Nothing continues past it, which is exactly why it has no tee.
    expect(at('1-1/8"', 'Elbow 90°', 'suction', 'end case').qty).toBe(2);
    expect(at('1-1/8"', 'Street Ell', 'suction', 'end case').qty).toBe(1);
    expect(at('1-1/8"', 'Coupling', 'suction', 'end case').qty).toBe(1);
    expect(at('1-1/8"', 'Bushing', 'suction', 'end case').qty).toBe(1);
    expect(at('1-1/8"', 'Tee', 'suction', 'end case')).toBeUndefined();
    expect(at('1/2"', 'Elbow 90°', 'liquid', 'end case').qty).toBe(2);
    expect(at('1/2"', 'Street Ell', 'liquid', 'end case')).toBeUndefined();
    expect(at('1/2"', 'Tee', 'liquid', 'end case')).toBeUndefined();
  });

  it('tees the start case, because the run carries on past it', () => {
    expect(at('1-1/8"', 'Tee', 'suction', 'start case').qty).toBe(1);
    expect(at('1-1/8"', 'Elbow 90°', 'suction', 'start case').qty).toBe(2);
    expect(at('1-1/8"', 'Coupling', 'suction', 'start case').qty).toBe(1);
    expect(at('1-1/8"', 'Bushing', 'suction', 'start case').qty).toBe(1);
    // Liquid takes ONE ell where suction takes two — the only difference
    // between the two lines at this position.
    expect(at('1/2"', 'Elbow 90°', 'liquid', 'start case').qty).toBe(1);
    expect(at('1/2"', 'Tee', 'liquid', 'start case').qty).toBe(1);
    expect(at('1/2"', 'Coupling', 'liquid', 'start case').qty).toBe(1);
    expect(at('1/2"', 'Bushing', 'liquid', 'start case').qty).toBe(1);
  });

  it('gives no street ell to the start case', () => {
    expect(at('1-1/8"', 'Street Ell', 'suction', 'start case')).toBeUndefined();
  });

  it('taps every case in the middle, and that is the part that multiplies', () => {
    // "The middle cases just get a tee and 2 ells and coupling and bushing."
    // Eight cases = six middles. Until this was filled in the middle of every
    // lineup was free.
    expect(at('1-1/8"', 'Tee', 'suction', 'middle case').qty).toBe(6);
    expect(at('1-1/8"', 'Elbow 90°', 'suction', 'middle case').qty).toBe(12);
    expect(at('1-1/8"', 'Coupling', 'suction', 'middle case').qty).toBe(6);
    expect(at('1-1/8"', 'Bushing', 'suction', 'middle case').qty).toBe(6);
    // Two ells on BOTH lines here — not the 1-vs-2 split the start case has.
    expect(at('1/2"', 'Elbow 90°', 'liquid', 'middle case').qty).toBe(12);
    expect(at('1/2"', 'Tee', 'liquid', 'middle case').qty).toBe(6);
  });

  it('scales the middle with the case count and leaves the ends alone', () => {
    const count = (ls, pos, type, line) =>
      ls.find(l => l.lineupPosition === pos && l.fittingType === type && new RegExp(line).test(l.desc))?.qty ?? 0;
    const four = caseHookupLines({ cases: 4, sucSize: '1-1/8"', liqSize: '1/2"' });
    const twenty = caseHookupLines({ cases: 20, sucSize: '1-1/8"', liqSize: '1/2"' });
    expect(count(four, 'middle', 'Tee', 'suction')).toBe(2);
    expect(count(twenty, 'middle', 'Tee', 'suction')).toBe(18);
    // The ends do not move.
    expect(count(twenty, 'start', 'Tee', 'suction')).toBe(count(four, 'start', 'Tee', 'suction'));
    expect(count(twenty, 'end', 'Street Ell', 'suction')).toBe(count(four, 'end', 'Street Ell', 'suction'));
  });

  it('has no middle on a two-case lineup', () => {
    const two = caseHookupLines({ cases: 2, sucSize: '1-1/8"', liqSize: '1/2"' });
    expect(two.some(l => l.lineupPosition === 'middle')).toBe(false);
    expect(two.some(l => l.lineupPosition === 'start')).toBe(true);
    expect(two.some(l => l.lineupPosition === 'end')).toBe(true);
  });

  it('gives a single-case lineup only the end set', () => {
    // It starts and ends at the same case. There is nothing for a tee to carry
    // the run on to.
    const one = caseHookupLines({ cases: 1, sucSize: '1-1/8"', liqSize: '1/2"' });
    expect(one.some(l => l.lineupPosition === 'start')).toBe(false);
    expect(one.some(l => l.lineupPosition === 'middle')).toBe(false);
    expect(one.some(l => l.lineupPosition === 'end')).toBe(true);
    expect(one.some(l => l.fittingType === 'Tee')).toBe(false);
  });

  it('says the bushing size is the one thing the takeoff cannot know', () => {
    // "...and bushing depending on the size the case is stubbed up." The run
    // size is known; what the case is stubbed with is not.
    const bushings = lines.filter(l => l.fittingType === 'Bushing');
    expect(bushings.length).toBeGreaterThan(0);
    for (const b of bushings) expect(b.notes).toMatch(/case stub size/);
  });

  it('names fitting types the ACR price table can actually price', () => {
    // These carry fittingType so the caller prices them off the same quoted
    // table the fitting picker uses, instead of a percentage.
    const all = [...END_CASE_SUCTION, ...END_CASE_LIQUID, ...START_CASE_SUCTION,
      ...START_CASE_LIQUID, ...MIDDLE_CASE_SUCTION, ...MIDDLE_CASE_LIQUID];
    for (const f of all) expect(fittingPrice(f.type, '1-1/8')).toBeTruthy();
  });

  it('covers the whole lineup — both ends and everything between', () => {
    expect(LINEUP_POSITIONS.map(p => p.key)).toEqual(['start', 'middle', 'end']);
    // Only the middle is per-case. Getting that backwards is the difference
    // between six sets of fittings and one.
    expect(LINEUP_POSITIONS.filter(p => p.per === 'case').map(p => p.key)).toEqual(['middle']);
  });

  it('accounts for every case in the lineup exactly once', () => {
    for (const n of [1, 2, 3, 8, 20]) {
      const total = LINEUP_POSITIONS.reduce((s, p) => s + p.count(n), 0);
      expect(total, `${n}-case lineup`).toBe(n);
    }
  });

  it('can be switched off for a job that itemises fittings by hand', () => {
    expect(caseHookupLines({ cases: 8, sucSize: '1-1/8"', liqSize: '1/2"', endFittings: false })
      .some(l => l.fittingType)).toBe(false);
  });

  it('skips a side whose size nobody has set', () => {
    const noLiq = caseHookupLines({ cases: 8, sucSize: '1-1/8"', liqSize: '' });
    expect(noLiq.some(l => l.fittingType && /liquid/.test(l.desc))).toBe(false);
    expect(noLiq.some(l => l.fittingType && /suction/.test(l.desc))).toBe(true);
  });
});
