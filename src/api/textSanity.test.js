import { describe, it, expect } from 'vitest';
import {
  looksLikeScopeLine, countScopeShapedLines,
  looksLikeScheduleLine, countScheduleShapedLines,
  textExtractionSanity, MIN_SHAPED,
} from './textSanity.js';

// Lines in the shape the real documents use. Store 1086's schedule and a
// Food Lion redline set, trimmed.
const SCHEDULE = `
WEEK 3
Jun 2 - RC to relocate MD cases 18,19,22 (C1) overnight
Night- Jun 3 - RC to move frozen food doors (B6)
Jun 4 - GC to complete floor patching in produce
Jun 5 - RC to run new refrigeration lines to the deli cooler
Jun 6 - Energy Team will conduct a complete store RCC
6/9 - RC to set and connect new dairy cases (A9)
`.trim();

const REDLINE = `
NEW 3/4 LIQUID LINE TO CASE, INSULATE FULL RUN
REMOVE EXISTING SUCTION LINE BACK TO RACK A
SET NEW EVAP COIL IN MEAT COOLER
RUN NEW COPPER TO TOP STUB, BRAZE AND PRESSURE TEST
RELOCATE CASE (C4) AND RECONNECT
GC TO PATCH FLOOR AFTER CASE REMOVAL
`.trim();

describe('recognising a scope line without knowing the format', () => {
  it('reads a circuit tag as the definitive signal', () => {
    // A parenthesised circuit tag is how a schedule marks RC work whatever
    // the wording around it says.
    expect(looksLikeScopeLine('Jun 2 - relocate MD cases 18,19,22 (C1) overnight')).toBe(true);
    expect(looksLikeScopeLine('move frozen food doors (B6)')).toBe(true);
  });

  it('reads refrigeration vocabulary plus a verb', () => {
    expect(looksLikeScopeLine('RUN NEW COPPER TO TOP STUB, BRAZE AND PRESSURE TEST')).toBe(true);
    expect(looksLikeScopeLine('SET NEW EVAP COIL IN MEAT COOLER')).toBe(true);
  });

  it('does not fire on a noun with nothing being done to it', () => {
    // A legend, a title block, a materials list.
    expect(looksLikeScopeLine('SUCTION')).toBe(false);
    expect(looksLikeScopeLine('RACK A')).toBe(false);
    expect(looksLikeScopeLine('COPPER')).toBe(false);
  });

  it('does not fire on other trades', () => {
    expect(looksLikeScopeLine('PATCH DRYWALL AND PAINT TO MATCH')).toBe(false);
    expect(looksLikeScopeLine('INSTALL NEW LIGHT FIXTURES IN AISLE 4')).toBe(false);
  });

  it('counts the real lines in a real-shaped redline', () => {
    // Five RC lines; the GC floor-patching line is not one.
    expect(countScopeShapedLines(REDLINE)).toBe(5);
  });

  it('survives junk', () => {
    expect(countScopeShapedLines('')).toBe(0);
    expect(countScopeShapedLines(undefined)).toBe(0);
    expect(countScopeShapedLines(null)).toBe(0);
    expect(looksLikeScopeLine(undefined)).toBe(false);
  });
});

describe('recognising a dated schedule line', () => {
  it('reads the date formats a construction schedule actually uses', () => {
    for (const s of ['Jun 2 - RC to relocate cases', 'June 14 — night work begins',
      '6/9 - RC to set new cases', '06-09-2026 mobilize', 'Mon, Jun 2 - pre-con meeting',
      '- Jun 5 - RC to run lines']) {
      expect(looksLikeScheduleLine(s), s).toBe(true);
    }
  });

  it('does not call every line with a number a date', () => {
    for (const s of ['Rack A - 4 circuits', 'INSTALL 150 FT OF 1-3/8 SUCTION', 'WEEK 3', '']) {
      expect(looksLikeScheduleLine(s), s).toBe(false);
    }
  });

  it('counts the dated rows in a real-shaped schedule', () => {
    expect(countScheduleShapedLines(SCHEDULE)).toBe(6);
  });
});

describe('the check that would have caught store 701 on the other two readers', () => {
  it('warns when a document full of scope produced no tasks', () => {
    const s = textExtractionSanity({ shaped: 22, extracted: 0, kind: 'scope', fileName: 'FL0701_Redlines.pdf' });
    expect(s).toBeTruthy();
    expect(s.message).toContain('22 lines that look like refrigeration scope');
    expect(s.message).toContain('NO field tasks were extracted');
    expect(s.message).toContain('FL0701_Redlines.pdf');
  });

  it('warns when a schedule full of dates produced none', () => {
    const s = textExtractionSanity({ shaped: 40, extracted: 0, kind: 'schedule' });
    expect(s.message).toContain('40 dated schedule lines');
    expect(s.message).toContain('NO schedule dates were extracted');
  });

  it('names BOTH explanations rather than accusing the reader', () => {
    // A set that really is all existing work is a correct outcome. The
    // estimator can tell which; the reader cannot, and saying so is the
    // difference between a useful warning and one that gets ignored.
    const s = textExtractionSanity({ shaped: 20, extracted: 0 });
    expect(s.message).toMatch(/real and correct answer/);
    expect(s.message).toMatch(/does not recognise/);
  });

  it('stays silent the moment anything came out', () => {
    // A low yield is normal. Eleven circuits from twenty rows on 701 was right.
    expect(textExtractionSanity({ shaped: 40, extracted: 1 })).toBe(null);
    expect(textExtractionSanity({ shaped: 100, extracted: 2 })).toBe(null);
  });

  it('ignores a document with only a line or two that vaguely match', () => {
    expect(textExtractionSanity({ shaped: MIN_SHAPED - 1, extracted: 0 })).toBe(null);
  });

  it('survives being called with nothing', () => {
    expect(textExtractionSanity()).toBe(null);
    expect(textExtractionSanity({})).toBe(null);
  });

  it('falls back to the scope wording for an unknown kind', () => {
    // A new caller passing a kind nobody added must still get a message, not
    // a crash or an empty sentence.
    const s = textExtractionSanity({ shaped: 20, extracted: 0, kind: 'somethingNew' });
    expect(s.message).toContain('refrigeration scope');
  });
});

describe('the real documents this was written against', () => {
  it('would have fired on a schedule read that came back empty', () => {
    const shaped = countScheduleShapedLines(SCHEDULE);
    // Six dated lines is exactly the threshold — a schedule this short is the
    // smallest one worth complaining about.
    expect(textExtractionSanity({ shaped, extracted: 0, kind: 'schedule' })).toBeTruthy();
  });

  it('stays quiet on the same schedule once it reads', () => {
    const shaped = countScheduleShapedLines(SCHEDULE);
    expect(textExtractionSanity({ shaped, extracted: 4, kind: 'schedule' })).toBe(null);
  });
});
