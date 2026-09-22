import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { stickRounding, isHardCopperLine, roundingNote } from './stickRounding.js';
import { HARD_STICK_FT } from './copperRates.js';

// "So after all copper lengths are gathered from drops-main pipe run-case tops
//  the number needs to round up to the nearest 20."

const cu = (pipeSize, qty, extra = {}) => ({ section: 'Copper', pipeSize, qty, unit: 'ft', ...extra });
const hookup = (pipeSize, qty, desc = 'Case drops — suction') =>
  ({ section: 'Case Hookups', material: 'copper', pipeSize, qty, unit: 'ft', desc });

describe('the purchase, pooled across the whole job', () => {
  it('rounds one size up to the next stick', () => {
    const [r] = stickRounding([cu('1-3/8', 73)]);
    expect(r.takeoffFt).toBe(73);
    expect(r.sticks).toBe(4);
    expect(r.purchaseFt).toBe(80);
    expect(r.addFt).toBe(7);
  });

  // ── THE POINT OF POOLING ──────────────────────────────────────────────────
  // Rounding each LINE to 20 would buy a stick for a 5 ft case drop and
  // another for a 7 ft jog — three sticks where the job takes one.
  it('pools the lines instead of rounding each one', () => {
    const lines = [cu('5/8', 5), hookup('5/8', 5), hookup('5/8', 7, 'Case-top run — liquid')];
    const [r] = stickRounding(lines);
    expect(r.takeoffFt).toBe(17);
    expect(r.sticks).toBe(1);
    expect(r.addFt).toBe(3);
  });

  it('reaches every part of the job, not just the Copper section', () => {
    // Drops, main run, case tops and spares all come off the same pile.
    const lines = [
      cu('1-1/8', 150),
      hookup('1-1/8', 40, 'Case drops — suction'),
      hookup('1-1/8', 26, 'Case-top run — suction'),
      cu('1-1/8', 20, { desc: 'spare for unfound drops' }),
    ];
    const [r] = stickRounding(lines);
    expect(r.takeoffFt).toBe(236);
    expect(r.sticks).toBe(12);
    expect(r.addFt).toBe(4);
  });

  it('keeps the sizes apart', () => {
    const out = stickRounding([cu('7/8', 30), cu('1-3/8', 45)]);
    expect(out.map(r => [r.pipeSize, r.addFt]).sort())
      .toEqual([['1-3/8', 15], ['7/8', 10]]);
  });

  it('says nothing for a size already on a whole stick', () => {
    // A row that adds zero feet and zero dollars is a row that says nothing.
    expect(stickRounding([cu('7/8', 40)])).toEqual([]);
    expect(stickRounding([cu('7/8', 20), hookup('7/8', 20)])).toEqual([]);
  });
});

// ── SOFT COPPER IS COIL, NOT STICKS ──────────────────────────────────────────
// The in-floor lines are cut to length off a coil and are already out of every
// other stick calculation in the app.
describe('what it does not round', () => {
  it('leaves soft copper alone', () => {
    expect(stickRounding([cu('5/8', 37, { softCopper: true })])).toEqual([]);
  });

  it('does not touch insulation, which is bought by the foot', () => {
    // Insulation carries a pipeSize too, which is why the test is what the
    // line IS rather than whether it has a size on it.
    const insul = { section: 'Insulation', pipeSize: '1-3/8', qty: 73, insulCategory: 'medSuction' };
    expect(isHardCopperLine(insul)).toBe(false);
    expect(stickRounding([insul])).toEqual([]);
  });

  it('does not touch case-top insulation either', () => {
    const insul = { section: 'Case Hookups', material: 'insulation', pipeSize: '1-1/8', qty: 70 };
    expect(stickRounding([insul])).toEqual([]);
  });

  it('ignores lines with no size and no footage', () => {
    expect(stickRounding([{ section: 'Copper', qty: 50 }])).toEqual([]);
    expect(stickRounding([cu('7/8', 0)])).toEqual([]);
    expect(stickRounding([])).toEqual([]);
    expect(stickRounding(undefined)).toEqual([]);
  });
});

describe('the stick length', () => {
  it('is twenty feet, which is how hard drawn comes', () => {
    expect(HARD_STICK_FT).toBe(20);
  });

  it('takes another length for a shop that buys differently', () => {
    const [r] = stickRounding([cu('7/8', 25)], 12);
    expect(r.sticks).toBe(3);
    expect(r.purchaseFt).toBe(36);
  });

  it('falls back to twenty on a junk length rather than dividing by zero', () => {
    for (const junk of [0, -5, null, 'x']) {
      const [r] = stickRounding([cu('7/8', 25)], junk);
      expect(r.purchaseFt, String(junk)).toBe(40);
    }
  });
});

describe('what the line says', () => {
  it('shows the takeoff, the sticks and the order', () => {
    const [r] = stickRounding([cu('1-3/8', 73)]);
    const note = roundingNote(r);
    expect(note).toMatch(/73 ft of 1-3\/8"/);
    expect(note).toMatch(/4 stick\(s\) = 80 ft/);
    expect(note).toMatch(/drops, run, case tops and spares/);
  });
});

describe('the materials step runs it last', () => {
  const src = readFileSync(new URL('../steps/Step4_Materials.jsx', import.meta.url), 'utf8');

  it('pools after everything else is on the list', () => {
    // It has to see the case tops, which are generated well after the copper.
    const at = src.indexOf('stickRounding(items, stick)');
    expect(at).toBeGreaterThan(src.indexOf('caseTopLines(state.circuits'));
    expect(at).toBeGreaterThan(src.indexOf('caseHookupLines({'));
  });

  it('runs after the fittings allowance is CALCULATED, not merely after some mention of it', () => {
    // The allowance is a percentage of the copper this job USES. Rounding up
    // to the next stick is a purchase, not more pipe in the store, so it must
    // not inflate the percentage.
    //
    // The first version of this anchored on /isFittingsAllowance/, which also
    // appears further down where old manual fittings are preserved — so
    // moving the rounding to just before THAT still satisfied it, and the
    // break passed. Anchored on the push that computes the amount now.
    const allowance = src.indexOf('Fittings Allowance (${fittingsPct}% of copper)');
    expect(allowance, 'the fittings allowance line was renamed').toBeGreaterThan(-1);
    expect(src.indexOf('stickRounding(items, stick)')).toBeGreaterThan(allowance);
  });

  it('tags the main copper lines so the pooler can see them', () => {
    // It was reaching them by section; the case lines by material. Both are
    // tagged now, so a line that moves section does not fall out of the pool.
    expect(src).toMatch(/pipeSize:size,material:'copper',baseQty:footage/);
  });

  it('can be switched off', () => {
    expect(src).toMatch(/rates\.roundCopperToSticks !== false/);
  });
});
