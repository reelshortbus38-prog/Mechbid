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
import { caseTopLines } from './caseTops.js';

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

  it('takes a different piece length', () => {
    const long = caseTopLines([A1], { normalize: norm, strutPieceFt: 4 });
    expect(lineFor(long, /Unistrut — case tops/).qty).toBe(Math.ceil((16 * 4) / 10));
  });

  it('says the piece length is an assumption, because nobody gave me one', () => {
    expect(lineFor(caseTopLines([A1], { normalize: norm }), /Unistrut/).notes)
      .toMatch(/PIECE LENGTH is an assumption/);
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
