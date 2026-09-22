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

describe('the materials step generates it', () => {
  const src = readFileSync(new URL('../steps/Step4_Materials.jsx', import.meta.url), 'utf8');

  it('runs both lines down the tops, not just suction', () => {
    expect(src).toMatch(/Case-top run — suction/);
    expect(src).toMatch(/Case-top run — liquid/);
  });

  it('prices it as copper off the rate table', () => {
    expect(src).toMatch(/pushTops\(topSuc, 'Case-top run — suction'\)/);
    expect(src).toMatch(/hpPipeRate\(copperRate\(size, rates\)\.rate/);
  });

  it('skips a riser-only drop, which has no lineup', () => {
    expect(src).toMatch(/if \(c\?\.isRiserOnly\) return;[\s\S]{0,200}circuitCaseTopFeet/);
  });

  // The double-count this could cause, made switchable rather than argued
  // about: a job whose run lengths were measured to the last case already has
  // this pipe.
  // ── THE SWITCH HAS TO REACH THE GENERATOR ────────────────────────────────
  // The first version of this asserted /caseTopCopper !== false/ anywhere in
  // the file — and the CHECKBOX contains that string too. Replacing the
  // generator's read with a hardcoded `true` left the test green: the box
  // still rendered, still toggled, still saved, and the copper generated
  // regardless. A dead switch is worse than no switch, because somebody turns
  // it off and believes they have.
  it('can be turned off for a job whose runs already include it', () => {
    expect(src, 'the generator no longer reads the setting')
      .toMatch(/const caseTops = rates\.caseTopCopper !== false/);
    expect(src).toMatch(/if \(caseTops\)/);
    expect(src).toMatch(/same pipe twice/);
  });

  it('shows the box in the same state the generator reads', () => {
    expect(src).toMatch(/checked=\{state\.rates\?\.caseTopCopper !== false\}/);
  });

  // A number off a schedule and a number off a default are not worth the same,
  // and the line has to say which it is.
  it('says on the line where the case lengths came from', () => {
    expect(src).toMatch(/case lengths off the schedule/);
    expect(src).toMatch(/no case lengths on the schedule/);
  });
});

describe('the endpoint hands out the column without reading it', () => {
  const api = readFileSync(new URL('../../api/parse-excel.js', import.meta.url), 'utf8');

  it('carries the Size and Model text off the Kysor sheet', () => {
    expect(api).toMatch(/const sizeText\s*=\s*String\(row\.getCell\(2\)\.value\|\|''\)/);
    expect(api).toMatch(/const modelText\s*=\s*String\(row\.getCell\(3\)\.value\|\|''\)/);
    expect(api).toMatch(/caseSizeText: sizeText/);
  });

  it('does not carry a second copy of the parser', () => {
    // Two readings of one column, on two sides of the CommonJS line, is how
    // they start disagreeing about what counts as a lineup.
    expect(api).not.toMatch(/parseCaseSizes|sizesAgree/);
  });
});
