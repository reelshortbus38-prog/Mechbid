import { describe, it, expect } from 'vitest';
import {
  parseCaseSizes, modelTotalFt, sizesAgree, caseTopFeet, circuitCaseTopFeet,
  CASE_TOP_EXTRA_FT, strutPerCase, caseTopSupports, circuitCaseTopSupports,
  STRUT_SPACING_FT, MIN_STRUT_PER_CASE,
} from './caseSizes.js';

// ── EVERY ROW HERE IS REAL ───────────────────────────────────────────────────
// Lifted from the Kysor Warren summary for Food Lion 774 (Lexington, VA), the
// file the owner sent. Size column and Model column, as written — commas on
// some rows and not on others, in the same sheet.
const KWRS_774 = [
  // [circuit, Size, Model]
  ['A1', "8'8'12'12'12'12'", "64' IDD5SL"],
  ['A2', "6',8',12',6'", "Q4,VR3HV,S6S,ID5SL"],
  ['A3', "12'12'12'12',6'", "48' D6L1, 6' IDD5SL"],
  ['A6', "12'12'12'", "36' IM5SL"],
  ['A7', "21'", "21' IM-04"],
  ['A8', "12'12'12'", "36' D61 w/Ret Drs"],
  ['A9', "8'12'12'", "32'  MX5HN"],
  ['A10', "8'8'", "16' IDD5SL"],
  ['B4', "8'8'12',4'", "28' DX6LN, 4' PF"],
  ['B5', "12'12',8'", "24' QD6L1, 8' ID5SL"],
  ['B6', "8',12'12'", "8' DX6LD, 24' D6L1 w/Red Drs"],
  ['B7', "12'12'12'", "36' D6L1 w/Ret Drs"],
];

// Rows in the same column that are NOT lineups.
const NOT_LINEUPS = [
  ['A4', "16' x 27' x 8.5'", 'walkin'],   // Meat Cooler
  ['A5', "4' x 10' x 8.5'", 'walkin'],    // Tray Cooler
  ['B1', "22' x 36' x 10'", 'walkin'],    // Meat Prep
  ['B3', "12' x 27' x 8.5'", 'walkin'],   // Produce Cooler
  ['B2', '773 sq.ft.', 'area'],           // Produce Prep
  ['B8', '', 'none'],                     // Spare
  ['B9', 'Spare', 'none'],
];

describe('reading the Size column', () => {
  it('splits a run of cases written with no separators', () => {
    expect(parseCaseSizes("8'8'12'12'12'12'").cases).toEqual([8, 8, 12, 12, 12, 12]);
  });

  it('splits one written with commas', () => {
    expect(parseCaseSizes("6',8',12',6'").cases).toEqual([6, 8, 12, 6]);
  });

  it('splits one written with both, which the same file does', () => {
    expect(parseCaseSizes("12'12'12'12',6'").cases).toEqual([12, 12, 12, 12, 6]);
    expect(parseCaseSizes("8'8'12',4'").cases).toEqual([8, 8, 12, 4]);
  });

  it('handles a single case', () => {
    expect(parseCaseSizes("21'").cases).toEqual([21]);
  });

  it.each(KWRS_774)('%s is read as a lineup', (_id, size) => {
    expect(parseCaseSizes(size).kind).toBe('lineup');
  });
});

// ── A COOLER HAS NO CASE TOPS ────────────────────────────────────────────────
// "16' x 27' x 8.5'" is a box. Read as three cases it would put 48 ft of
// copper — and 51 ft of case-top run — on a walk-in that has none.
describe('rows that are not lineups', () => {
  it.each(NOT_LINEUPS)('%s is %s, not a lineup', (_id, size, kind) => {
    const p = parseCaseSizes(size);
    expect(p.kind).toBe(kind);
    expect(p.cases).toEqual([]);
    expect(p.totalFt).toBe(0);
  });

  it('gives a walk-in no case-top copper at all', () => {
    expect(circuitCaseTopFeet({ caseSizes: parseCaseSizes("16' x 27' x 8.5'").cases }).ft).toBe(0);
  });
});

// ── THE MODEL COLUMN SAYS IT AGAIN ───────────────────────────────────────────
// "48' D6L1, 6' IDD5SL" is 54 ft and so is "12'12'12'12',6'". Two independent
// readings of the same lineup: worth more together than either alone, and a
// disagreement is worth saying out loud rather than picking a winner.
describe('the Model column as a second reading', () => {
  it.each(KWRS_774.filter(r => /\d\s*'/.test(r[2])))(
    '%s: the Size column and the Model column agree', (_id, size, model) => {
      const check = sizesAgree(size, model);
      expect(check, 'no comparison was possible').toBeTruthy();
      expect(check.agrees, `Size ${check.sizeFt} ft vs Model ${check.modelFt} ft`).toBe(true);
    },
  );

  it('reports a disagreement rather than hiding it', () => {
    const check = sizesAgree("12'12'", "36' D6L1");
    expect(check.agrees).toBe(false);
    expect(check.sizeFt).toBe(24);
    expect(check.modelFt).toBe(36);
  });

  it('says nothing when there is nothing to compare', () => {
    // A2's model is "Q4,VR3HV,S6S,ID5SL" — model numbers, no footage.
    expect(sizesAgree("6',8',12',6'", 'Q4,VR3HV,S6S,ID5SL')).toBeNull();
    expect(sizesAgree("16' x 27' x 8.5'", "64' IDD5SL")).toBeNull();
  });
});

// ── THE COPPER ───────────────────────────────────────────────────────────────
// "a 12' case would need 13' for the top. 8' case would need 9'."
describe('copper along the tops', () => {
  it('is the case length plus a foot, per case', () => {
    expect(CASE_TOP_EXTRA_FT).toBe(1);
    expect(caseTopFeet([12])).toBe(13);
    expect(caseTopFeet([8])).toBe(9);
  });

  it('adds up across a lineup', () => {
    // A1: 8'8'12'12'12'12' → 9+9+13+13+13+13
    expect(caseTopFeet(parseCaseSizes("8'8'12'12'12'12'").cases)).toBe(70);
    // A3: 12'12'12'12',6' → 13×4 + 7
    expect(caseTopFeet(parseCaseSizes("12'12'12'12',6'").cases)).toBe(59);
  });

  it('is NOT the lineup length — the jogs are the whole point', () => {
    const cases = parseCaseSizes("8'8'12'12'12'12'").cases;
    const lineup = cases.reduce((a, b) => a + b, 0);
    expect(lineup).toBe(64);
    expect(caseTopFeet(cases)).toBe(lineup + cases.length);
  });

  it('takes a different jog when a shop runs one', () => {
    expect(caseTopFeet([12, 12], 2)).toBe(28);
    expect(caseTopFeet([12, 12], 0)).toBe(24);
  });

  it('ignores junk in the list rather than adding a foot to it', () => {
    expect(caseTopFeet([12, 0, null, undefined, 'x', 8])).toBe(13 + 9);
  });
});

describe('what a circuit contributes', () => {
  it('uses the sizes when the schedule gave them', () => {
    const r = circuitCaseTopFeet({ caseSizes: [8, 8, 12], caseCount: 99 });
    expect(r.ft).toBe(9 + 9 + 13);
    expect(r.basis).toBe('sizes');
    expect(r.cases).toBe(3);
    // The sizes win over a count that disagrees — a count is what you have
    // when nobody wrote the lengths down.
  });

  it('falls back to the count at the job default length', () => {
    const r = circuitCaseTopFeet({ caseCount: 3 }, { defaultCaseFt: 12 });
    expect(r.ft).toBe(39);
    expect(r.basis).toBe('count');
  });

  it('follows the job default rather than assuming twelve', () => {
    expect(circuitCaseTopFeet({ caseCount: 2 }, { defaultCaseFt: 8 }).ft).toBe(18);
  });

  // ── A ZERO HAS TO BE TELLABLE FROM AN UNKNOWN ────────────────────────────
  // "this lineup has no tops" and "nobody told us how many cases" are both 0
  // ft, and only one of them is finished.
  it('says when it does not know, instead of returning a confident zero', () => {
    const r = circuitCaseTopFeet({});
    expect(r.ft).toBe(0);
    expect(r.basis).toBe('unknown');
  });
});

// ── "3 on 12' case 2 on 8' and below" ────────────────────────────────────────
// The case-top copper shipped with no supports at all, on my assumption that
// the pipe sits on the cases and hangs off nothing. It was flagged as an
// assumption and it was wrong.
describe('strut across the case tops', () => {
  it('is the two numbers he gave', () => {
    expect(strutPerCase(12)).toBe(3);
    expect(strutPerCase(8)).toBe(2);
  });

  // ── THE RULE IS THE SPACING, NOT A LOOKUP OF HIS TWO SIZES ───────────────
  // Both of his numbers are one support every four feet. Encoding the spacing
  // means a 10 ft case or a 21 ft island lands somewhere sensible rather than
  // nowhere — the same reason the saddle sizes were built as geometry.
  it('is one support every four feet, which is what those two numbers are', () => {
    expect(STRUT_SPACING_FT).toBe(4);
    expect(strutPerCase(16)).toBe(4);
    expect(strutPerCase(21)).toBe(6);
    expect(strutPerCase(10)).toBe(3);
  });

  it('never puts fewer than two under a case', () => {
    // "2 on 8' and below" — a 6 ft case still takes two, and a 4 ft panel
    // cannot be held up by one.
    expect(MIN_STRUT_PER_CASE).toBe(2);
    for (const len of [8, 6, 4, 3, 1]) expect(strutPerCase(len), `${len} ft`).toBe(2);
  });

  it('takes a different spacing when a chain runs one', () => {
    // "Not sure if every grocery chain does this but food lion most definitely
    // does." A spec, like the 6 ft hanger spacing — so it is a setting.
    expect(strutPerCase(12, 6)).toBe(2);
    expect(strutPerCase(24, 6)).toBe(4);
  });

  it('gives nothing to a case with no length', () => {
    for (const junk of [0, -4, null, undefined, 'x']) expect(strutPerCase(junk), String(junk)).toBe(0);
  });

  it('adds up across a lineup', () => {
    // A1: 8'8'12'12'12'12' → 2+2+3+3+3+3
    expect(caseTopSupports(parseCaseSizes("8'8'12'12'12'12'").cases)).toBe(16);
  });

  it('falls back to the case count at the default length', () => {
    expect(circuitCaseTopSupports({ caseCount: 4 }, { defaultCaseFt: 12 })).toBe(12);
    expect(circuitCaseTopSupports({ caseSizeText: "12'12'" })).toBe(6);
  });

  it('gives a walk-in none, same as it gets no copper', () => {
    expect(circuitCaseTopSupports({ caseSizeText: "16' x 27' x 8.5'" })).toBe(0);
  });
});
