import { describe, it, expect } from 'vitest';
import { hasTakeoffSignal, isNonTakeoffSheet, filterVisionPages, takeoffScore, selectVisionPages } from './pageSkip.js';

// Text is excerpted verbatim from the 16-sheet 90% design review set.
const SHEET_INDEX = 'MECHANICAL SHEET LIST SHEET NUMBER SHEET NAME 60% REVIEW 90% REVIEW M-00001 MECHANICAL SHEET INDEX M-00002 MECHANICAL SYMBOLS, ABBREVIATIONS & GENERAL NOTES M-20300 MECHANICAL ROOF OVERALL PLAN Grand total: 16 SHEET NO: TITLE: PROJECT:';
const COVER = 'SHEET NO: TITLE: PROJECT: THE LICENSED PROFESSIONAL SEAL AFFIXED TO THIS SHEET APPLIES ONLY TO THE MATERIAL AND ITEMS SHOWN ON THIS SHEET. SEAL/SIGNATURE PROJECT DELIVERY PACKAGE CONFIDENTIAL AHJ STAMP SUPERSEDED PRELIMINARY THESE DOCUMENTS ARE INCOMPLETE AND NOT FOR REGULATORY APPROVAL, PERMIT OR CONSTRUCTION. SCALE: 1/2" = 1\'-0"';
const COMCHECK = 'COMcheck Mechanical Compliance Certificate 2015 IECC Inspection Checklist Plan Review Footing/Foundation Mechanical Rough-In Final Inspection Complies Does Not Not Observable Not Applicable SHEET NO: TITLE: PROJECT: THE LICENSED PROFESSIONAL SEAL AFFIXED TO THIS SHEET.';
const ROOF_PLAN = '1 2 3 4 5 6 A B C D E A.1 D.8 B.6 CU 1-3 CU 1-5 TYP 2 M-90000 | 1/8" = 1\'-0" MECHANICAL ROOF PARTIAL PLAN - SECTOR 01 SHEET NOTES 1 OUTDOOR HEAT PUMP/CONDENSING UNIT. PROVIDE 71"L x 71"W PREFABRICATED ROOF CURB WITH TEMPORARY INSULATED CAP FOR UPBLAST EXHAUST FAN.';
const DETAILS = 'HEAT PUMP OUTDOOR UNIT ON ROOF SECURELY ANCHOR THE CONDENSING UNIT TO THE WALL BRACKET. PROVIDE REFRIGERANT LINE SET AND INSULATION. INSTALL PIPE SUPPORTS AT 8\'-0" ON CENTER. PROVIDE 15.5"L x 15.5"W x 14"H PREFABRICATED ROOF CURB. CU 1-10 HP 1-4 CONDENSATE DRAIN.';
const KEY_PLAN = '1 2 3 4 5 6 7 8 9 10 11 12 13 14 A B C D E F G 15 19 16 17 18 SECTOR 1 SECTOR 3 SECTOR 5 AREA 518 LEVEL 01 | 1" = 20\'-0" SHEET NO: TITLE: PROJECT: THE LICENSED PROFESSIONAL SEAL AFFIXED TO THIS SHEET.';

describe('hasTakeoffSignal', () => {
  it('sees priceable content on real drawing sheets', () => {
    expect(hasTakeoffSignal(ROOF_PLAN)).toBe(true);
    expect(hasTakeoffSignal(DETAILS)).toBe(true);
  });

  it('finds none on cover, index and checklist sheets', () => {
    [SHEET_INDEX, COVER, COMCHECK].forEach(t => expect(hasTakeoffSignal(t), t.slice(0, 30)).toBe(false));
  });

  it('does not count a title-block scale as evidence of a drawing', () => {
    // Every sheet carries a SCALE field, including sheets with no drawing.
    expect(hasTakeoffSignal('SCALE: 1/2" = 1\'-0" SHEET NO: TITLE: PROJECT:')).toBe(false);
  });

  it('does not mistake a grid or area label for an equipment tag', () => {
    // "LEVEL 01" and "AREA 518" matched a looser pattern and kept every page.
    expect(hasTakeoffSignal('SECTOR 1 LEVEL 01 AREA 518 A.1 D.8 B.6')).toBe(false);
    expect(hasTakeoffSignal('CU 1-3 CU 1-5')).toBe(true);   // space-separated tags are real
    expect(hasTakeoffSignal('RTU-01 EF-2')).toBe(true);
  });
});

describe('isNonTakeoffSheet', () => {
  it('identifies the sheet index and the code-compliance checklist', () => {
    expect(isNonTakeoffSheet(SHEET_INDEX)).toBe(true);
    expect(isNonTakeoffSheet(COMCHECK)).toBe(true);
  });

  it('does not rely on the seal boilerplate, which is on every sheet', () => {
    // ROOF_PLAN would be dropped if the seal text counted as a marker.
    expect(isNonTakeoffSheet(ROOF_PLAN)).toBe(false);
    expect(isNonTakeoffSheet(COVER)).toBe(false); // caught by the twin test instead
  });
});

describe('filterVisionPages', () => {
  it('drops index, checklist and duplicate cover sheets, keeps the drawings', () => {
    const textByPage = { 1: SHEET_INDEX, 2: COVER, 3: COVER, 4: COMCHECK, 5: ROOF_PLAN, 6: DETAILS };
    const { keep, skipped } = filterVisionPages([1, 2, 3, 4, 5, 6], textByPage);
    expect(keep).toEqual([5, 6]);
    expect(skipped.map(s => s.why)).toEqual(['sheet index', 'title block', 'title block', 'code compliance']);
  });

  it('keeps a lone boilerplate page rather than guessing', () => {
    // With no twin to compare against, a page that is merely uninformative is
    // kept — reading a dud costs one call, dropping a sheet costs scope.
    const { keep } = filterVisionPages([1, 2], { 1: COVER, 2: ROOF_PLAN });
    expect(keep).toEqual([1, 2]);
  });

  it('never skips a scanned sheet that has no text layer at all', () => {
    const { keep, skipped } = filterVisionPages([1, 2], { 2: ROOF_PLAN });
    expect(keep).toEqual([1, 2]);
    expect(skipped).toEqual([]);
  });

  it('drops a blank crop', () => {
    const { skipped } = filterVisionPages([1], { 1: '   ' });
    expect(skipped[0].why).toBe('blank');
  });
});

describe('takeoffScore + selectVisionPages', () => {
  it('scores sheets with content above a grid-only key plan', () => {
    // These fixtures are excerpts, so they compress the real gap — on the full
    // pages the details sheet scored 19 against 13 for a roof partial plan.
    // What matters and holds at any length: a key plan whose text layer is
    // nothing but column labels carries no signal at all.
    expect(takeoffScore(KEY_PLAN)).toBe(0);
    expect(takeoffScore(ROOF_PLAN)).toBeGreaterThan(0);
    expect(takeoffScore(DETAILS)).toBeGreaterThanOrEqual(takeoffScore(ROOF_PLAN));
  });

  it('spends a tight budget on content, not on page order', () => {
    // The details sheet is LAST in the document. Page-order rationing dropped
    // it; this must not.
    const textByPage = { 1: SHEET_INDEX, 2: KEY_PLAN, 3: KEY_PLAN + ' extra words to differ', 4: ROOF_PLAN, 5: DETAILS };
    const { selected, skipped, deferred } = selectVisionPages([1, 2, 3, 4, 5], textByPage, 2);
    expect(skipped.map(s => s.pageNum)).toEqual([1]);
    expect(selected).toEqual([4, 5]);   // ascending page order for rendering
    expect(deferred).toEqual([2, 3]);   // reported, not silently lost
  });

  it('reads everything when the budget is not binding', () => {
    const textByPage = { 1: ROOF_PLAN, 2: DETAILS };
    const { selected, deferred } = selectVisionPages([1, 2], textByPage, 10);
    expect(selected).toEqual([1, 2]);
    expect(deferred).toEqual([]);
  });

  it('handles an empty set', () => {
    expect(selectVisionPages()).toEqual({ selected: [], skipped: [], deferred: [] });
  });
});
