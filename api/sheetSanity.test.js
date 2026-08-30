import { describe, it, expect } from 'vitest';
import ss from './sheetSanity.js';

const { countCircuitShapedRows, extractionSanity, looksLikePipeSize, MIN_SHAPED } = ss;

// Rows shaped like the real ones on FL 701's Remote Hdr 1: a numbered line, an
// application, and pipe sizes. Trimmed to the columns that matter.
const row = (id, app, run, sucH, sucR, liqH) => [id, '', '', '', '', '', app, '', '', '', '', '', '', '', '', '', '', '', '', '', run, sucH, sucR, liqH];

const SHEET_701 = [
  ['Sys', 'Size', 'Model', 'Heat', 'Expansion', 'Temp', 'Application'],
  ['No', 'Size', 'Model', 'Exchr.', 'Valve', 'Probe', 'Application'],
  row(1, 'Deli Cooler', 170, '7/8', '5/8', '1/2'),
  row(2, 'MD Fresh Meat 18,19,22', 45, '1 3/8', '1 3/8', '5/8'),
  row(3, 'MD Fresh Meat 23-25', 80, '1 3/8', '1 3/8', '5/8'),
  row(4, 'SPARE', '', '', '', ''),
  row(5, 'Meat Cooler', 150, '13/8', '13/8', '5/8'),
];

describe('recognising a circuit row without knowing the format', () => {
  it('counts the rows that carry an id, an application and a pipe size', () => {
    // Four real rows; SPARE has no sizes and the two header rows have no id.
    expect(countCircuitShapedRows(SHEET_701)).toBe(4);
  });

  it('ignores header rows', () => {
    expect(countCircuitShapedRows([['Sys', 'Size', 'Model', 'Application']])).toBe(0);
  });

  it('ignores a numbered list that carries no pipe size', () => {
    // A parts list is numbered and has text. It is not a circuit schedule.
    const parts = [[1, 'CPC Temp Sensor'], [2, 'Ball valve assembly'], [3, 'Sight glass']];
    expect(countCircuitShapedRows(parts)).toBe(0);
  });

  it('ignores rows with sizes but no application text', () => {
    expect(countCircuitShapedRows([[1, '', '7/8', '5/8']])).toBe(0);
  });

  it('survives junk input', () => {
    expect(countCircuitShapedRows([])).toBe(0);
    expect(countCircuitShapedRows(undefined)).toBe(0);
    expect(countCircuitShapedRows([null, 'not a row', 42])).toBe(0);
  });
});

describe('pipe sizes, as they are actually written', () => {
  it('accepts the forms that appear on real sheets', () => {
    for (const s of ['7/8', '5/8', '1/2', '1 3/8', '13/8', '1 5/8', '2 1/8', '3/4"']) {
      expect(looksLikePipeSize(s)).toBe(true);
    }
  });

  it('rejects things that are not sizes', () => {
    for (const s of ['', 'Off Cycle', 'REMOVE', 'SORIT 15', '170', 'Deli Cooler', null]) {
      expect(looksLikePipeSize(s)).toBe(false);
    }
  });
});

describe('the check that would have caught store 701 on day one', () => {
  it('warns when a sheet full of circuits produced none', () => {
    // This is the whole point. "No circuits yet" and "this job has no new work"
    // looked identical, and the difference was most of the copper.
    const s = extractionSanity({ shaped: 40, extracted: 0, fileName: 'FL_0701_WR_BPR1.xlsx' });
    expect(s).toBeTruthy();
    expect(s.message).toContain('40 rows that look like circuits');
    expect(s.message).toContain('NONE were extracted');
  });

  it('names BOTH explanations rather than accusing the parser', () => {
    // A remodel where everything is existing work is a real, correct outcome.
    // The estimator can tell which; the parser cannot.
    const s = extractionSanity({ shaped: 40, extracted: 0 });
    expect(s.message).toMatch(/existing work/);
    expect(s.message).toMatch(/does not recognise/);
  });

  it('stays silent once circuits are found', () => {
    expect(extractionSanity({ shaped: 40, extracted: 11 })).toBe(null);
    expect(extractionSanity({ shaped: 40, extracted: 1 })).toBe(null);
  });

  it('does NOT fire on a low ratio — that is a normal remodel', () => {
    // Eleven of twenty on 701 was correct. A rule that cried wolf on every
    // right answer would be switched off before the job that needed it.
    expect(extractionSanity({ shaped: 100, extracted: 2 })).toBe(null);
  });

  it('ignores a sheet with only a row or two that vaguely match', () => {
    expect(extractionSanity({ shaped: MIN_SHAPED - 1, extracted: 0 })).toBe(null);
  });

  it('survives being called with nothing', () => {
    expect(extractionSanity()).toBe(null);
    expect(extractionSanity({})).toBe(null);
  });
});
