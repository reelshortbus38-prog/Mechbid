import { describe, it, expect } from 'vitest';
import {
  casesFromApplication, caseHookupLines,
  DEFAULT_STUB_FT, DEFAULT_CASE_FT, LINEUP_POSITIONS,
  END_CASE_SUCTION, END_CASE_LIQUID, START_CASE_SUCTION, START_CASE_LIQUID,
  MIDDLE_CASE_SUCTION, MIDDLE_CASE_LIQUID,
  DEFAULT_STUB_SUCTION, DEFAULT_STUB_LIQUID,
} from './caseHookup.js';
import { fittingPrice, fittingPriceForPair } from './fittingPrices.js';

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
    const suc = lines.find(l => /Case drops — suction/.test(l.desc));
    expect(suc.qty).toBe(8 * DEFAULT_STUB_FT);
    expect(suc.unit).toBe('ft');
  });

  it('drops to the case in RUN-size copper, because the reduction is at the case', () => {
    // "We reduce at the case so the ells are run size." If the ells are run
    // size the pipe between them is too. This was briefly modelled the other
    // way — reduce at the tee and run small — which under-buys the drop.
    const lines = caseHookupLines(base);   // run is 1-1/8" suction, 1/2" liquid
    expect(lines.find(l => /Case drops — suction/.test(l.desc)).pipeSize).toBe('1-1/8"');
    expect(lines.find(l => /Case drops — liquid/.test(l.desc)).pipeSize).toBe('1/2"');
  });

  it('insulates the drop at the run size', () => {
    expect(caseHookupLines(base).find(l => /insulation/i.test(l.desc)).pipeSize).toBe('1-1/8"');
  });

  it('says on the drop what it reduces to at the bottom', () => {
    const suc = caseHookupLines(base).find(l => /Case drops — suction/.test(l.desc));
    expect(suc.notes).toMatch(/reduced at the case to 5\/8"/);
  });

  it('takes the RISER size on suction once the drop passes 5 ft', () => {
    // "We run the same size all the way to the case except when there are
    // drops over 5 ft, and with those we change the suction line only and run
    // the riser size."
    const long = caseHookupLines({ ...base, stubFt: 9, sucRiser: '1-3/8"' });
    const suc = long.find(l => /Case drops — suction/.test(l.desc));
    expect(suc.pipeSize).toBe('1-3/8"');
    expect(suc.notes).toMatch(/over 5 ft, so the suction drop takes the RISER size/);
    // Liquid does not change, however far it falls.
    expect(long.find(l => /Case drops — liquid/.test(l.desc)).pipeSize).toBe('1/2"');
    // Insulation follows the pipe it goes on.
    expect(long.find(l => /insulation/i.test(l.desc)).pipeSize).toBe('1-3/8"');
  });

  it('carries the riser size through to the suction fittings', () => {
    const long = caseHookupLines({ ...base, stubFt: 9, sucRiser: '1-3/8"' });
    const tee = long.find(l => l.fittingType === 'Tee' && /suction/.test(l.desc));
    expect(tee.pipeSize).toBe('1-3/8"');
    // The liquid side is untouched.
    expect(long.find(l => l.fittingType === 'Tee' && /liquid/.test(l.desc)).pipeSize).toBe('1/2"');
  });

  it('stays run size at exactly 5 ft, and when no riser size is set', () => {
    expect(caseHookupLines({ ...base, stubFt: 5, sucRiser: '1-3/8"' })
      .find(l => /Case drops — suction/.test(l.desc)).pipeSize).toBe('1-1/8"');
    // Nothing to switch to — better the run size than a blank line.
    expect(caseHookupLines({ ...base, stubFt: 9 })
      .find(l => /Case drops — suction/.test(l.desc)).pipeSize).toBe('1-1/8"');
  });

  it('uses the case-stub size for the bushing and nothing else', () => {
    // "Some are different but that's what I would set as a default." Changing
    // it moves the bushing and leaves every run-size part alone.
    const std = caseHookupLines(base);
    const alt = caseHookupLines({ ...base, stubSuc: '7/8"', stubLiq: '1/2"' });
    const notBushing = ls => ls.filter(l => l.fittingType !== 'Bushing')
      .map(l => `${l.desc}:${l.qty}`).sort().join('|');
    expect(notBushing(alt)).toBe(notBushing(std));
    expect(alt.find(l => l.fittingType === 'Bushing' && /suction/.test(l.desc)).desc)
      .toContain('1-1/8" × 7/8"');
    expect(DEFAULT_STUB_SUCTION).toBe('5/8"');
    expect(DEFAULT_STUB_LIQUID).toBe('3/8"');
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
  });

  it('skips insulation when the job does not insulate', () => {
    expect(descs({ insulate: false })).not.toMatch(/insulation/i);
  });

  it('generates nothing for a job with no cases', () => {
    expect(caseHookupLines({ ...base, cases: 0 })).toEqual([]);
    expect(caseHookupLines({})).toEqual([]);
  });

  it('skips a drop whose run size nobody has set', () => {
    // Better an absent line than one reading '" Case drops — liquid'.
    expect(descs({ liqSize: '' })).not.toMatch(/Case drops — liquid/);
  });

  it('honours stub and case lengths set for the job', () => {
    const lines = caseHookupLines({ ...base, stubFt: 8, caseFt: 10 });
    expect(lines.find(l => /Case drops — suction/.test(l.desc)).qty).toBe(64);
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
  // Find by what a fitting IS and where it sits, not by its rendered size —
  // the size now depends on whether the fitting is on the run or the stub.
  const at = (type, line, pos, ls = lines) =>
    ls.find(l => l.fittingType === type && l.lineupPosition === pos
      && new RegExp(`${line} at `).test(l.desc));

  it('terminates the end case with no tee', () => {
    // Nothing continues past it, which is exactly why it has no tee.
    expect(at('Elbow 90°', 'suction', 'end').qty).toBe(2);
    expect(at('Street Ell', 'suction', 'end').qty).toBe(1);
    expect(at('Coupling', 'suction', 'end').qty).toBe(1);
    expect(at('Bushing', 'suction', 'end').qty).toBe(1);
    expect(at('Tee', 'suction', 'end')).toBeUndefined();
    expect(at('Elbow 90°', 'liquid', 'end').qty).toBe(2);
    expect(at('Street Ell', 'liquid', 'end')).toBeUndefined();
    expect(at('Tee', 'liquid', 'end')).toBeUndefined();
  });

  it('tees the start case, because the run carries on past it', () => {
    expect(at('Tee', 'suction', 'start').qty).toBe(1);
    expect(at('Elbow 90°', 'suction', 'start').qty).toBe(2);
    expect(at('Coupling', 'suction', 'start').qty).toBe(1);
    expect(at('Bushing', 'suction', 'start').qty).toBe(1);
    // Liquid takes ONE ell where suction takes two — the only difference
    // between the two lines at this position.
    expect(at('Elbow 90°', 'liquid', 'start').qty).toBe(1);
    expect(at('Tee', 'liquid', 'start').qty).toBe(1);
    expect(at('Coupling', 'liquid', 'start').qty).toBe(1);
    expect(at('Bushing', 'liquid', 'start').qty).toBe(1);
  });

  it('gives no street ell to the start case', () => {
    expect(at('Street Ell', 'suction', 'start')).toBeUndefined();
  });

  it('taps every case in the middle, and that is the part that multiplies', () => {
    // "The middle cases just get a tee and 2 ells and coupling and bushing."
    // Eight cases = six middles. Until this was filled in the middle of every
    // lineup was free.
    expect(at('Tee', 'suction', 'middle').qty).toBe(6);
    expect(at('Elbow 90°', 'suction', 'middle').qty).toBe(12);
    expect(at('Coupling', 'suction', 'middle').qty).toBe(6);
    expect(at('Bushing', 'suction', 'middle').qty).toBe(6);
    // Two ells on BOTH lines here — not the 1-vs-2 split the start case has.
    expect(at('Elbow 90°', 'liquid', 'middle').qty).toBe(12);
    expect(at('Tee', 'liquid', 'middle').qty).toBe(6);
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

  it('makes the bushing a real run-by-stub part, not a caveat', () => {
    // "...and bushing depending on the size the case is stubbed up." It is the
    // ONE fitting that spans the two sizes, which is why the estimator tied
    // the caveat to it and to nothing else.
    const b = lines.find(l => l.fittingType === 'Bushing' && /suction/.test(l.desc));
    expect(b.desc).toContain('1-1/8" × 5/8"');
    expect(b.spanSize).toBe('1-1/8"');
    expect(b.pipeSize).toBe('5/8"');
    expect(b.notes).toMatch(/reduces the 1-1\/8" run to the 5\/8" case stub/);
    // It prices on the larger body, which is what fittingPriceForPair is for.
    expect(fittingPriceForPair('Bushing', '1-1/8', '5/8').price)
      .toBe(fittingPrice('Bushing', '1-1/8').price);
  });

  it('keeps every fitting at RUN size except the bushing', () => {
    // "We reduce at the case so the ells are run size." The reduction happens
    // once, at the last fitting. Sizing the ells small instead would be $9.60
    // against $24.30 across two dozen ells a lineup — an under-bid every time.
    expect(at('Tee', 'suction', 'middle').pipeSize).toBe('1-1/8"');
    expect(at('Elbow 90°', 'suction', 'middle').pipeSize).toBe('1-1/8"');
    expect(at('Coupling', 'suction', 'middle').pipeSize).toBe('1-1/8"');
    expect(at('Street Ell', 'suction', 'end').pipeSize).toBe('1-1/8"');
    // Only this one steps down.
    expect(at('Bushing', 'suction', 'middle').spanSize).toBe('1-1/8"');
    expect(at('Bushing', 'suction', 'middle').pipeSize).toBe('5/8"');
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

  it('generates no fittings for a side whose run size is missing', () => {
    // Every fitting is sized off the run now, including the bushing's large
    // end, so without a run size there is nothing on that side to size.
    const noLiq = caseHookupLines({ cases: 8, sucSize: '1-1/8"', liqSize: '' });
    expect(noLiq.some(l => l.fittingType && /liquid/.test(l.desc))).toBe(false);
    expect(at('Tee', 'suction', 'middle', noLiq).pipeSize).toBe('1-1/8"');
  });
});
