import { describe, it, expect } from 'vitest';
import { suspectDuctSize, pairedDimensions, recheckDuctSize, recheckDuctRuns, isRoundInText } from './sizeRecheck.js';

// The vision model reads a rendered IMAGE; the text layer is what the drafter
// typed. They fail in different ways, so one is a real check on the other —
// a label that rasterizes as "32x0" often sits in the text layer as "32x20".

describe('suspectDuctSize', () => {
  it('spots the missing side and the dropped digit', () => {
    expect(suspectDuctSize('32x0')).toEqual({ kind: 'zeroSide', known: 32 });
    expect(suspectDuctSize('0x24')).toEqual({ kind: 'zeroSide', known: 24 });
    expect(suspectDuctSize('19x1')).toEqual({ kind: 'droppedDigit', known: 19 });
    expect(suspectDuctSize('40" x 0"')).toEqual({ kind: 'zeroSide', known: 40 });
  });

  it('leaves ordinary sizes alone', () => {
    expect(suspectDuctSize('24x12')).toBeNull();
    expect(suspectDuctSize('13x10')).toBeNull();   // an oval VAV inlet
    expect(suspectDuctSize('12" round duct')).toBeNull();
    expect(suspectDuctSize('')).toBeNull();
  });

  it('will not search on a known side too small to trust', () => {
    expect(suspectDuctSize('2x0')).toBeNull();
  });
});

describe('pairedDimensions', () => {
  const page = 'MAIN SA TRUNK 32x20 DOWN TO 24x12 · RETURN 32 x 18 · ROOF OPENING 71"L x 71"W';

  it('finds the dimension the sheet pairs with the known side, either way round', () => {
    expect(pairedDimensions(24, 'branch duct 24x12 typical')).toEqual([12]);
    expect(pairedDimensions(12, 'branch duct 24x12 typical')).toEqual([24]);
  });

  it('returns every distinct pairing, sorted', () => {
    expect(pairedDimensions(32, page)).toEqual([18, 20]);
  });

  it('ignores numbers that are not plausible duct sides', () => {
    expect(pairedDimensions(40, 'BOD 40 x 2 ELEV')).toEqual([]);      // 2" is not a side
    expect(pairedDimensions(40, 'GRID 40 x 480')).toEqual([]);        // 480" is not a side
  });

  it('ignores L x W callouts — those are openings and curbs, not duct labels', () => {
    // Verbatim from a roof sheet: PROVIDE 71"L x 71"W PREFABRICATED ROOF CURB.
    // A duct label never carries L/W suffixes, and pairing a curb size into a
    // duct correction would invent sheet metal that does not exist.
    expect(pairedDimensions(71, 'PROVIDE 71"L x 71"W PREFABRICATED ROOF CURB')).toEqual([]);
    expect(pairedDimensions(15.5, 'PROVIDE 15.5"L x 15.5"W x 14"H ROOF CURB')).toEqual([]);
  });

  it('does not pair numbers that merely appear on the same sheet', () => {
    expect(pairedDimensions(32, 'trunk is 32 inches · elsewhere a 20 inch branch')).toEqual([]);
  });
});

describe('recheckDuctSize', () => {
  it('recovers the dropped digit exactly when the text layer has it', () => {
    expect(recheckDuctSize('32x0', 'MAIN SUPPLY TRUNK 32x20 BOD 36\'-2"')).toEqual({
      status: 'corrected', size: '32x20', from: '32x0', basis: "the drawing's own text layer",
    });
  });

  it('refuses to choose when the sheet pairs the side two ways', () => {
    const v = recheckDuctSize('32x0', 'SA 32x20 · RA 32x18');
    expect(v.status).toBe('ambiguous');
    expect(v.candidates).toEqual([18, 20]);
  });

  it('says so when the text layer has no opinion', () => {
    expect(recheckDuctSize('32x0', 'nothing useful here').status).toBe('unconfirmed');
  });

  it('stays silent on a size that was never suspect', () => {
    expect(recheckDuctSize('24x12', 'MAIN 24x12')).toBeNull();
  });
});

describe('recheckDuctRuns', () => {
  it('corrects the run and explains that it was recovered, not guessed', () => {
    const { runs, flags } = recheckDuctRuns(
      [{ size: '32x0', estLengthFt: 80 }], 'MAIN SA TRUNK 32x20', 'Page 4');
    expect(runs[0].size).toBe('32x20');
    expect(runs[0].sizeCorrectedFrom).toBe('32x0');
    expect(runs[0].estLengthFt).toBe(80);         // footage untouched
    expect(flags[0].type).toBe('info');
    expect(flags[0].text).toMatch(/recovered rather than guessed/);
  });

  it('turns "go find it" into "pick one" when ambiguous', () => {
    const { runs, flags } = recheckDuctRuns([{ size: '32x0' }], 'SA 32x20 · RA 32x18', 'Page 4');
    expect(runs[0].size).toBe('32x0');            // never silently altered
    expect(flags[0].type).toBe('warn');
    expect(flags[0].text).toMatch(/32x18 and 32x20/);
  });

  it('leaves good runs and unconfirmable ones exactly as they were', () => {
    const runs = [{ size: '24x12' }, { size: '38x0' }];
    const out = recheckDuctRuns(runs, 'no sizes in this text layer');
    expect(out.runs).toEqual(runs);
    expect(out.flags).toEqual([]);
  });

  it('handles an empty page and no runs', () => {
    expect(recheckDuctRuns()).toEqual({ runs: [], flags: [] });
  });
});

// ── WHERE THE TWO RULES MEET ─────────────────────────────────────────────────
// Both features fire on the same input — a size with one side missing — and
// they disagree about what it means. The recheck wants to restore a lost
// rectangular dimension; the round-duct rule says one dimension IS the label.
// The recheck runs first, so without a guard it would win every time and turn
// a genuine spiral main into rectangular duct off some unrelated branch
// elsewhere on the sheet.

describe('isRoundInText', () => {
  it('recognises the ways a diameter gets written', () => {
    ['32"ø SA MAIN', '32 DIA', '32" DIAMETER', 'Ø32', '32" ROUND', '32 SPIRAL']
      .forEach(t => expect(isRoundInText(32, t), t).toBe(true));
  });

  it('does not see a diameter in a rectangular label', () => {
    expect(isRoundInText(32, 'MAIN SA TRUNK 32x20')).toBe(false);
    expect(isRoundInText(32, 'BOD 32\'-6" AFF')).toBe(false);
  });
});

describe('the round rule and the recheck do not fight', () => {
  it('will not rectangularise a round main because a 32x20 branch is on the same sheet', () => {
    // The dangerous case: both labels present. The diameter marker on THIS
    // dimension is the authority on its own shape.
    const v = recheckDuctSize('32x0', 'SA MAIN 32"ø DOWN TO BRANCH 32x20');
    expect(v.status).toBe('round');
    expect(v.known).toBe(32);
  });

  it('leaves the size untouched and marks the shape confirmed', () => {
    const { runs, flags } = recheckDuctRuns([{ size: '32x0', estLengthFt: 80 }], 'SA MAIN 32"ø', 'Page 4');
    expect(runs[0].size).toBe('32x0');          // parseDuctDesc reads this as 32" round
    expect(runs[0].shapeConfirmed).toBe('round');
    expect(flags[0].type).toBe('info');
    expect(flags[0].text).toMatch(/confirmed, not assumed/);
  });

  it('still corrects to rectangular when NO diameter marker exists', () => {
    const v = recheckDuctSize('32x0', 'MAIN SUPPLY TRUNK 32x20 BOD 36\'-2"');
    expect(v.status).toBe('corrected');
    expect(v.size).toBe('32x20');
  });

  it('falls back to the round-duct convention when the text layer is silent', () => {
    // No marker, no pairing — nothing is added, and parseDuctDesc still reads
    // "32x0" as 32" round with inferred:true, which raises its own warning.
    const { runs, flags } = recheckDuctRuns([{ size: '32x0' }], 'no sizes here');
    expect(runs[0].shapeConfirmed).toBeUndefined();
    expect(flags).toEqual([]);
  });
});
