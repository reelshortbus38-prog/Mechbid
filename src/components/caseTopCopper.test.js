import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { circuitCaseTopFeet, circuitCaseSizes, circuitSizeCheck } from './caseSizes.js';

// ── THE WHOLE CHAIN, ON THE STORE HE SENT ────────────────────────────────────
// Food Lion 774, rack A, as the Kysor summary writes it. The circuits below
// carry the RAW Size and Model text exactly as api/parse-excel.js now hands it
// out — the endpoint reads the column and does not interpret it, because it is
// CommonJS and the reader is a module.
const RACK_A = [
  { circuitId: 'A1', caseSizeText: "8'8'12'12'12'12'", caseModelText: "64' IDD5SL", sucHoriz: '1-3/8', liqHoriz: '1/2', tempType: 'medium' },
  { circuitId: 'A4', caseSizeText: "16' x 27' x 8.5'", caseModelText: '1) KRD66A-340', sucHoriz: '1-1/8', liqHoriz: '5/8', tempType: 'medium' },
  { circuitId: 'A7', caseSizeText: "21'", caseModelText: "21' IM-04", sucHoriz: '7/8', liqHoriz: '1/2', tempType: 'medium' },
  { circuitId: 'A10', caseSizeText: "8'8'", caseModelText: "16' IDD5SL", sucHoriz: '7/8', liqHoriz: '1/2', tempType: 'medium' },
];

describe('the case tops on Food Lion 774 rack A', () => {
  it('reads A1 as six cases straight off the schedule', () => {
    const info = circuitCaseSizes(RACK_A[0]);
    expect(info.cases).toEqual([8, 8, 12, 12, 12, 12]);
    expect(info.source).toBe('schedule');
  });

  it('prices A1 at 70 ft per line', () => {
    // 9 + 9 + 13 + 13 + 13 + 13. Twice over, because suction and liquid both
    // run the tops — 140 ft of copper that was on no line.
    const r = circuitCaseTopFeet(RACK_A[0]);
    expect(r.ft).toBe(70);
    expect(r.basis).toBe('sizes');
    expect(r.cases).toBe(6);
  });

  it('gives the Meat Cooler nothing, because a box has no case tops', () => {
    // "16' x 27' x 8.5'" read as cases would be 51 ft on a walk-in.
    const r = circuitCaseTopFeet(RACK_A[1]);
    expect(r.ft).toBe(0);
    expect(r.basis).toBe('unknown');
  });

  it('handles the single 21 ft island', () => {
    expect(circuitCaseTopFeet(RACK_A[2]).ft).toBe(22);
  });

  it('checks the Size column against the Model column', () => {
    expect(circuitSizeCheck(RACK_A[0])).toEqual({ sizeFt: 64, modelFt: 64, agrees: true });
    expect(circuitSizeCheck(RACK_A[3])).toEqual({ sizeFt: 16, modelFt: 16, agrees: true });
    // A model with no footage in it is not a disagreement.
    expect(circuitSizeCheck(RACK_A[1])).toBeNull();
  });

  it('adds up across the rack without counting the cooler', () => {
    const total = RACK_A.reduce((ft, c) => ft + circuitCaseTopFeet(c).ft, 0);
    expect(total).toBe(70 + 0 + 22 + 18);
  });
});

// ── BEHAVIOUR, NOT GREP ──────────────────────────────────────────────────────
// Everything below used to be a source-grep over Step4_Materials.jsx, and a
// grep cannot see a dead code path. Short-circuiting the support count to zero
// left every one of those checks green while the generator produced no strut
// and no saddles at all — the second time in three days a grep has held a dead
// branch up as working. The logic moved into components/caseTops.js so a test
// can ask what is on the list.
import { caseTopLines, piecesPerStick, strutSticks } from './caseTops.js';

const norm = s => String(s || '').replace(/"/g, '').trim();
const A1 = { circuitId: 'A1', caseSizeText: "8'8'12'12'12'12'", sucHoriz: '1-3/8', liqHoriz: '1/2', tempType: 'medium' };
const lineFor = (lines, re) => lines.find(l => re.test(l.desc));

describe('what comes back for a lineup', () => {
  const lines = caseTopLines([A1], { normalize: norm });

  it('runs BOTH lines down the tops', () => {
    expect(lineFor(lines, /Case-top run — suction/).qty).toBe(70);
    expect(lineFor(lines, /Case-top run — liquid/).qty).toBe(70);
  });

  it('insulates them at the circuit temperature', () => {
    const suc = lineFor(lines, /Case-top insulation — suction/);
    expect(suc.insulCategory).toBe('medSuction');
    expect(suc.qty).toBe(70);
  });

  it('buys strut, in the sticks it comes in', () => {
    // 8'8'12'12'12'12' → 2+2+3+3+3+3 = 16 supports, 2 ft each, 32 ft, 4 sticks.
    const strut = lineFor(lines, /Unistrut — case tops/);
    expect(strut.supports).toBe(16);
    expect(strut.qty).toBe(4);
    expect(strut.unit).toBe('stick');
  });

  it('buys a saddle per insulated line at every support', () => {
    // 1-3/8 MT suction → 4"; 1/2 liquid at 1/2" wall → 2". Sixteen of each.
    expect(lineFor(lines, /^4" Pipe Saddles .* case tops/).qty).toBe(16);
    expect(lineFor(lines, /^2" Pipe Saddles .* case tops/).qty).toBe(16);
  });

  it('prices nothing itself', () => {
    // The caller prices these through the same path as every other case-hookup
    // line, so the shop's price book beats the shipped defaults. A line that
    // arrives carrying a cost skips that entirely.
    for (const l of lines) expect(l.unitCost, l.desc).toBeUndefined();
  });
});

describe('what it refuses to do', () => {
  it('gives a walk-in nothing at all', () => {
    expect(caseTopLines([{ caseSizeText: "16' x 27' x 8.5'", sucHoriz: '1-1/8' }], { normalize: norm }))
      .toEqual([]);
  });

  it('skips a riser-only drop, which has no lineup under it', () => {
    const riser = { ...A1, isRiserOnly: true };
    expect(caseTopLines([riser], { normalize: norm })).toEqual([]);
  });

  it('returns an empty list rather than empty lines when there are no cases', () => {
    expect(caseTopLines([], { normalize: norm })).toEqual([]);
    expect(caseTopLines([{ sucHoriz: '7/8' }], { normalize: norm })).toEqual([]);
  });

  // A saddle protects insulation. A line carrying none has nothing to protect.
  it('does not cradle a liquid line the job leaves bare', () => {
    const bare = caseTopLines([A1], { normalize: norm, insulMedLiquid: false });
    expect(lineFor(bare, /Case-top insulation — liquid/)).toBeFalsy();
    expect(lineFor(bare, /^2" Pipe Saddles/)).toBeFalsy();
    // The suction side is untouched — it is insulated either way.
    expect(lineFor(bare, /^4" Pipe Saddles/).qty).toBe(16);
    expect(lineFor(bare, /Case-top run — liquid/).qty).toBe(70);
  });
});

describe('two circuits at one size and two temperatures', () => {
  // The mistake made twice already: bucketing insulation on size alone puts
  // them on one line and charges one wall for both.
  const med = { caseSizeText: "12'", sucHoriz: '1-1/8', liqHoriz: '1/2', tempType: 'medium' };
  const low = { caseSizeText: "12'", sucHoriz: '1-1/8', liqHoriz: '1/2', tempType: 'low' };
  const lines = caseTopLines([med, low], { normalize: norm });

  it('gives them separate insulation lines', () => {
    const cats = lines.filter(l => l.material === 'insulation' && l.pipeSize === '1-1/8')
      .map(l => l.insulCategory).sort();
    expect(cats).toEqual(['lowSuction', 'medSuction']);
  });

  it('still merges the copper, which does not care about temperature', () => {
    expect(lines.filter(l => /Case-top run — suction/.test(l.desc))).toHaveLength(1);
    expect(lineFor(lines, /Case-top run — suction/).qty).toBe(26);
  });
});

describe('the settings a chain can change', () => {
  it('takes a different strut spacing', () => {
    // "Not sure if every grocery chain does this but food lion most definitely
    // does." A spec, like the 6 ft hanger spacing.
    const wide = caseTopLines([A1], { normalize: norm, strutSpacingFt: 6 });
    expect(lineFor(wide, /Unistrut — case tops/).supports).toBe(12);
  });

  it('takes a different piece length, and counts PIECES not feet', () => {
    // 16 pieces at 4 ft. By footage that is 64 ft and seven sticks; by the cut
    // it is two whole pieces per stick and EIGHT. The footage answer leaves
    // the job a piece short, because the 2 ft offcut off each stick cannot be
    // joined to the next one.
    const long = caseTopLines([A1], { normalize: norm, strutPieceFt: 4 });
    expect(lineFor(long, /Unistrut — case tops/).qty).toBe(8);
    expect(Math.ceil((16 * 4) / 10)).toBe(7);
  });

  it('says how the sticks were counted, so the number can be checked', () => {
    // The piece length is his now, not a guess — "usually no longer than 2' or
    // so" — so the line states the yield rather than apologising for a number
    // nobody gave.
    const strut = lineFor(caseTopLines([A1], { normalize: norm }), /Unistrut/);
    expect(strut.notes).toMatch(/16 piece\(s\)/);
    expect(strut.notes).toMatch(/5 per stick/);
    expect(strut.notes).toMatch(/Set the piece length on the rates panel/);
  });

  it('says whether the case lengths came off the schedule or off a default', () => {
    const fromSchedule = lineFor(caseTopLines([A1], { normalize: norm }), /Case-top run — suction/);
    expect(fromSchedule.notes).toMatch(/case lengths off the schedule/);
    const fromCount = lineFor(
      caseTopLines([{ caseCount: 3, sucHoriz: '7/8', tempType: 'medium' }], { normalize: norm, defaultCaseFt: 12 }),
      /Case-top run — suction/,
    );
    expect(fromCount.notes).toMatch(/no case lengths on the schedule/);
  });
});

describe('the materials step still wires it up', () => {
  const src = readFileSync(new URL('../steps/Step4_Materials.jsx', import.meta.url), 'utf8');

  it('calls the module and can be switched off', () => {
    expect(src).toMatch(/const caseTops = rates\.caseTopCopper !== false/);
    expect(src).toMatch(/caseTopLines\(state\.circuits, \{/);
  });

  it('prices the hardware through the price book first', () => {
    expect(src).toMatch(/l\.material === 'hardware'/);
    expect(src).toMatch(/findPriceMatch\(priceBookNow, \{ desc: l\.desc \}\)/);
  });
});

// ── STRUT IS BOUGHT IN STICKS AND USED IN PIECES ─────────────────────────────
// "we get 5 2' struts from one stick which is enough to pipe a 12' and 8' case"
//
// The 2 ft default was right. The sentence after it corrected the arithmetic:
// this was counting FOOTAGE and dividing by ten, which assumes the offcut from
// one stick joins to the next. It does not.
describe('how many sticks of strut', () => {
  it('gets five 2 ft pieces out of a 10 ft stick', () => {
    expect(piecesPerStick(2)).toBe(5);
    expect(strutSticks(5, 2)).toBe(1);
    expect(strutSticks(6, 2)).toBe(2);
  });

  it('agrees with his own check of the spacing rule', () => {
    // "enough to pipe a 12' and 8' case" — 3 on the twelve, 2 on the eight.
    const lines = caseTopLines([{ caseSizeText: "12'8'", sucHoriz: '1-1/8', tempType: 'medium' }], { normalize: norm });
    const strut = lineFor(lines, /Unistrut — case tops/);
    expect(strut.supports).toBe(5);
    expect(strut.qty).toBe(1);
  });

  // ── WHERE THE OLD ARITHMETIC WAS WRONG ────────────────────────────────────
  // At 2 ft the two models agree, which is why it looked fine. At 4 ft they do
  // not: five pieces is 20 ft, which by footage is two sticks — but a 10 ft
  // stick yields two 4 ft pieces and a 2 ft offcut, so five pieces takes
  // three. The footage model under-buys.
  it('does not assume the offcut joins to the next stick', () => {
    expect(piecesPerStick(4)).toBe(2);
    expect(strutSticks(5, 4)).toBe(3);
    expect(Math.ceil((5 * 4) / 10)).toBe(2);   // what it used to say
  });

  it('handles a piece that is longer than a stick', () => {
    // Not a cut — a splice. Footage is the right answer for that one.
    expect(piecesPerStick(12)).toBe(0);
    expect(strutSticks(2, 12)).toBe(3);
  });

  it('buys nothing for no pieces', () => {
    expect(strutSticks(0, 2)).toBe(0);
    expect(strutSticks(null, 2)).toBe(0);
  });

  it('says the yield on the line, so the count can be checked', () => {
    const strut = lineFor(caseTopLines([A1], { normalize: norm }), /Unistrut — case tops/);
    expect(strut.piecesPerStick).toBe(5);
    expect(strut.notes).toMatch(/5 per stick/);
    expect(strut.desc).toMatch(/cut to 2 ft/);
  });
});
