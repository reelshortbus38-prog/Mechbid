import { describe, it, expect } from 'vitest';
import {
  findCircuitRows, headerRowIndex, rowWindow, usedColumns, scheduleView,
  workbookView,
} from './scheduleRows.js';

// A BPR as SheetJS hands it over: rows of cells, a title block on top, a
// header row, then the circuits. Empty columns between groups are real — a
// Food Lion legend is twenty-five wide with gaps.
const GRID = [
  ['KWRS Legend', '', '', '', '', '', '', ''],
  ['Store', '2417', '', '', '', '', '', ''],
  [],
  ['Circuit', 'Rack', 'Heat Exchanger', '', 'Application', '', 'Run', 'Suction'],
  ['B10', 'B', 'Existing', '', 'Dairy 4-door', '', 120, '7/8'],
  ['B11', 'B', 'NEW', '', 'Dairy 2-door', '', '', ''],
  ['B12', 'B', 'Existing', '', 'Juice', '', 80, '7/8'],
  ['C6', 'C', 'NEW COIL', '', 'Meat Prep', '', '', ''],
  ['C7', 'C', 'Existing', '', 'Deli', '', 200, '1-1/8'],
];

describe('findCircuitRows', () => {
  it('finds the row whose circuit-ID cell IS the circuit', () => {
    expect(findCircuitRows(GRID, ['B11'])).toEqual([{ row: 5, id: 'B11' }]);
  });

  it('finds several, in sheet order, whatever order they were asked for', () => {
    expect(findCircuitRows(GRID, ['C6', 'B11'])).toEqual([
      { row: 5, id: 'B11' }, { row: 7, id: 'C6' },
    ]);
  });

  it('is case-insensitive and ignores padding', () => {
    expect(findCircuitRows(GRID, ['  b11 '])).toEqual([{ row: 5, id: 'B11' }]);
  });

  // ── THE RULE THAT KEEPS THE BUTTON HONEST ─────────────────────────────────
  // A substring search would box the wrong row, and a verify button that opens
  // the wrong row is worse than no button at all.
  it('does not match a longer ID that starts the same', () => {
    const grid = [['B110', 'B', '', '', 'Frozen', '', 40, '7/8']];
    expect(findCircuitRows(grid, ['B11'])).toEqual([]);
  });

  it('does not match the circuit named inside another cell', () => {
    const grid = [['A1', 'A', '', '', 'Tie into B11 riser', '', 40, '7/8']];
    expect(findCircuitRows(grid, ['B11'])).toEqual([]);
  });

  it('returns one hit per row even if the ID appears twice on it', () => {
    const grid = [['B11', 'B11', '', '', 'Dairy', '', '', '']];
    expect(findCircuitRows(grid, ['B11'])).toHaveLength(1);
  });

  it('is empty rather than wrong when nothing was asked for', () => {
    expect(findCircuitRows(GRID, [])).toEqual([]);
    expect(findCircuitRows(GRID, ['', null, undefined])).toEqual([]);
    expect(findCircuitRows([], ['B11'])).toEqual([]);
    expect(findCircuitRows(null, ['B11'])).toEqual([]);
  });

  it('survives a ragged grid', () => {
    expect(findCircuitRows([[], null, ['B11'], 'not a row'], ['B11']))
      .toEqual([{ row: 2, id: 'B11' }]);
  });
});

describe('headerRowIndex', () => {
  it('picks the row of words over the title block and the data', () => {
    expect(headerRowIndex(GRID, 5)).toBe(3);
  });

  it('only looks above the row in question', () => {
    // Nothing above row 1 but the one-word title, which is not a header.
    expect(headerRowIndex(GRID, 1)).toBe(null);
  });

  it('gives no header rather than a wrong one', () => {
    expect(headerRowIndex([['12', '3.5'], ['B11', '7/8']], 1)).toBe(null);
    expect(headerRowIndex([], 5)).toBe(null);
  });
});

describe('rowWindow', () => {
  it('pads either side so the row reads against its neighbours', () => {
    expect(rowWindow(GRID, [{ row: 5 }], 2)).toEqual({ from: 3, to: 7 });
  });

  it('spans every hit', () => {
    expect(rowWindow(GRID, [{ row: 5 }, { row: 7 }], 1)).toEqual({ from: 4, to: 8 });
  });

  it('stays inside the sheet', () => {
    expect(rowWindow(GRID, [{ row: 0 }], 4)).toEqual({ from: 0, to: 4 });
    expect(rowWindow(GRID, [{ row: 8 }], 4)).toEqual({ from: 4, to: 8 });
  });

  it('is null with nothing to centre on', () => {
    expect(rowWindow(GRID, [])).toBe(null);
  });
});

describe('usedColumns', () => {
  it('drops the columns that are empty across the whole window', () => {
    // Columns 3 and 5 are blank in every row of GRID.
    expect(usedColumns(GRID, 4, 8, 3)).toEqual([0, 1, 2, 4, 6, 7]);
  });

  it('keeps a column the header uses even when the window does not', () => {
    const grid = [['Circuit', 'Note'], ['B11', '']];
    expect(usedColumns(grid, 1, 1, 0)).toEqual([0, 1]);
  });
});

describe('scheduleView', () => {
  const sheets = [
    { name: 'Rack A', grid: [['Circuit'], ['A1'], ['A2']] },
    { name: 'Rack B', grid: GRID },
  ];

  it('picks the tab the circuit is actually on, not the first tab', () => {
    const v = scheduleView(sheets, ['B11']);
    expect(v.sheetName).toBe('Rack B');
    expect(v.hits).toEqual([{ row: 5, id: 'B11' }]);
    expect(v.found).toEqual(['B11']);
  });

  it('carries everything the table needs to draw itself', () => {
    const v = scheduleView(sheets, ['B11'], 2);
    expect(v.to).toBe(7);
    expect(v.headerIdx).toBe(3);
    expect(v.columns.length).toBeGreaterThan(0);
    expect(v.hitRows.has(5)).toBe(true);
    expect(v.hitRows.has(6)).toBe(false);
  });

  // The header sits a couple of rows above the first circuit on a real BPR, so
  // any padding at all reaches past it. Looking for it above the WINDOW instead
  // of above the hit lost it in exactly the common case, and the table came out
  // as twenty-five unlabelled numbers.
  it('finds the header even when the padding reaches back past it', () => {
    for (const pad of [0, 1, 2, 4, 8]) {
      const v = scheduleView(sheets, ['B11'], pad);
      expect(v.headerIdx, `pad ${pad}`).toBe(3);
    }
  });

  it('does not draw the header a second time as a data row', () => {
    const v = scheduleView(sheets, ['B11'], 4);   // window would start at row 1
    expect(v.headerIdx).toBe(3);
    expect(v.from).toBeGreaterThan(3);
  });

  it('never skips past the row it is meant to be showing', () => {
    const v = scheduleView(sheets, ['B11'], 0);
    expect(v.from).toBeLessThanOrEqual(5);
    expect(v.to).toBeGreaterThanOrEqual(5);
  });

  it('says which circuits it could NOT place rather than showing the rest as the whole finding', () => {
    const v = scheduleView(sheets, ['B11', 'Z99']);
    expect(v.found).toEqual(['B11']);
    expect(v.missing).toEqual(['Z99']);
  });

  it('is null when the workbook has none of them — nothing is shown instead of the nearest row', () => {
    expect(scheduleView(sheets, ['Z99'])).toBe(null);
    expect(scheduleView([], ['B11'])).toBe(null);
    expect(scheduleView(null, ['B11'])).toBe(null);
  });
});

// ── THE FLAGS WITH NO ROW TO POINT AT ────────────────────────────────────────
// "This BPR uses three different highlight colours", "four rows looked like
// circuits but had no readable ID" — the last one cannot name a row by
// definition, because the ID is the thing that was missing. They still say go
// and check the schedule.
describe('workbookView', () => {
  const sheets = [
    { name: 'Notes', grid: [['see legend'], [], []] },
    { name: 'Rack B', grid: GRID },
  ];

  it('opens the tab with the most in it, not the first', () => {
    expect(workbookView(sheets).sheetName).toBe('Rack B');
  });

  it('marks nothing, and says so', () => {
    const v = workbookView(sheets);
    expect(v.hits).toEqual([]);
    expect(v.hitRows.size).toBe(0);
    expect(v.wholeSheet).toBe(true);
  });

  it('still finds the header, so the columns are labelled', () => {
    const v = workbookView(sheets);
    expect(v.headerIdx).toBe(3);
    expect(v.from).toBe(4);
    expect(v.columns.length).toBeGreaterThan(0);
  });

  it('starts at the top when there is no header to skip', () => {
    const v = workbookView([{ name: 'X', grid: [['B11', '7/8'], ['B12', '7/8']] }]);
    expect(v.headerIdx).toBe(null);
    expect(v.from).toBe(0);
  });

  it('never runs past the end of a short sheet', () => {
    const v = workbookView([{ name: 'X', grid: [['B11']] }]);
    expect(v.to).toBe(0);
    expect(v.from).toBeLessThanOrEqual(v.to);
  });

  it('is null for a workbook with nothing in it', () => {
    expect(workbookView([])).toBe(null);
    expect(workbookView([{ name: 'Empty', grid: [[], ['', '']] }])).toBe(null);
    expect(workbookView(null)).toBe(null);
  });
});
