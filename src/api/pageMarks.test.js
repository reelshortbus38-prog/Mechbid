import { describe, it, expect } from 'vitest';
import { searchTerms, itemMatches, findTermBoxes } from './pageMarks.js';

// Flag wording verbatim from live runs. Opening the right sheet is most of the
// job; the thing in question is still a half-inch label on four feet of paper.

describe('searchTerms', () => {
  it('takes the quoted value the flag is naming, before any gloss', () => {
    const t = searchTerms('Page 7: duct "40x0 (40"ø SA labeled)" is 40" ROUND — the sheet\'s text layer labels that dimension as a diameter.');
    expect(t[0]).toBe('40x0');
  });

  it('never yields a bare service abbreviation', () => {
    // The inch mark IS a double quote, so "6\" EA (exhaust air…)" parses as the
    // fragment EA — which matched every exhaust-air label on the sheet. A live
    // page came back with four red boxes for a flag about one 6" run.
    const t = searchTerms('Page 7: "6" EA (exhaust air duct labeled as pipe-like run)" was read as pipe, and "6" exhaust air (EA)" is already on the duct list.');
    expect(t).not.toContain('EA');
    expect(t).not.toContain('exhaust air');
    expect(t).toContain('6" EA');
  });

  it('finds a size even when nothing is quoted', () => {
    expect(searchTerms('Duct size 32x20 was corrected from 32x0')).toContain('32x20');
  });

  it('finds an equipment tag', () => {
    expect(searchTerms('1 equipment tag appears on the drawings but was never scheduled: EF-09.')).toContain('EF-09');
  });

  it('returns nothing to search for on a general note', () => {
    expect(searchTerms('FOR ALL EXTERIOR WALL/ROOF PENETRATIONS, COORDINATE WITH ARCHITECTURAL DRAWINGS.')).toEqual([]);
  });
});

describe('itemMatches', () => {
  it('ignores inch marks and spacing, which vary between flag and drawing', () => {
    expect(itemMatches('40"x0', '40x0')).toBe(true);
    expect(itemMatches('  32 X 20 ', '32x20')).toBe(true);
    expect(itemMatches('EF-09 EXHAUST FAN', 'EF-09')).toBe(true);
  });

  it('does not match something else on the sheet', () => {
    expect(itemMatches('24x12', '40x0')).toBe(false);
    expect(itemMatches('', '40x0')).toBe(false);
  });
});

describe('findTermBoxes', () => {
  // pdf.js transforms: [a,b,c,d,x,y] with y from the BOTTOM of the page.
  const items = [
    { str: '24x12', transform: [1, 0, 0, 10, 100, 700], width: 40, height: 10 },
    { str: '40"x0 SA', transform: [1, 0, 0, 12, 300, 500], width: 60, height: 12 },
  ];

  it('locates the label and flips y to measure from the top', () => {
    const [box] = findTermBoxes(items, ['40x0'], 800);
    expect(box.x).toBe(300);
    expect(box.y).toBe(800 - 500 - 12); // 288
    expect(box.str).toBe('40"x0 SA');
  });

  it('stops at the first term that hits, so broad fallbacks add no noise', () => {
    const boxes = findTermBoxes(items, ['40x0', '24x12'], 800);
    expect(boxes).toHaveLength(1);
  });

  it('marks nothing when the sheet has no text layer', () => {
    expect(findTermBoxes([], ['40x0'], 800)).toEqual([]);
    expect(findTermBoxes(items, [], 800)).toEqual([]);
  });
});

// ── ONE FLAG, ONE MARK ───────────────────────────────────────────────────────
// Marking everything is the same as marking nothing, except it also misleads.

const sheet = ['6"ø EA', '16"ø EA', '14"ø EA', '12"ø EA', '40"ø SA']
  .map((str, i) => ({ str, transform: [1, 0, 0, 10, 100, 700 - i * 20], width: 40, height: 10 }));

describe('the live over-marking case', () => {
  const sixInch = 'Page 7: "6" EA (exhaust air duct labeled as pipe-like run)" was read as pipe, but the label reads as an air service — and "6" exhaust air (EA)" is already on the duct list.';

  it('boxes only the 6" run, not every EA label on the sheet', () => {
    const boxes = findTermBoxes(sheet, searchTerms(sixInch), 800);
    expect(boxes.map(b => b.str)).toEqual(['6"ø EA']);
  });

  it('finds the 40" main from a flag written about "40x0"', () => {
    const boxes = findTermBoxes(sheet, searchTerms('Page 7: duct "40x0 (40"ø SA labeled)" is 40" ROUND.'), 800);
    expect(boxes.map(b => b.str)).toEqual(['40"ø SA']);
  });
});

describe('matching a size against the drawing', () => {
  it('treats 6" EA and 6"ø EA as the same run', () => {
    // The flag drops the diameter symbol the drawing carries.
    expect(itemMatches('6"ø EA', '6" EA')).toBe(true);
  });

  it('does not match a search for 6 against 16', () => {
    expect(itemMatches('16"ø EA', '6" EA')).toBe(false);
    expect(itemMatches('14"ø EA', '6" EA')).toBe(false);
  });

  it('survives the case change on the diameter symbol', () => {
    // toUpperCase turns ø into Ø; a strip list holding only the lowercase form
    // silently stopped matching anything at all.
    expect(itemMatches('40"Ø SA', '40"ø SA')).toBe(true);
  });
});

describe('a term that hits half the sheet marks nothing', () => {
  it('refuses to box everything', () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      ({ str: `12"ø EA ${i}`, transform: [1, 0, 0, 10, 10, 700], width: 40, height: 10 }));
    expect(findTermBoxes(many, ['12"ø EA'], 800)).toEqual([]);
  });
});
