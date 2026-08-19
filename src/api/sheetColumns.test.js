import { describe, it, expect } from 'vitest';
import {
  centerX, rowsFrom, columnRange, findHeaders, valueUnder, markOf,
  columnByMark, tableRows, groupOver, GAP_FACTOR,
} from './sheetColumns.js';

const it_ = (s, x, y, w = 10) => ({ s, x, y, w });

// ── A REAL SCHEDULE, TO SCALE ────────────────────────────────────────────────
// Positions measured off the Edmonds SD College Place equipment sheet. The
// GLYCOL % header centres at 352.9 and every heat pump's value centres at
// 352.9 — schedules are machine-drawn, so the columns line up exactly.
const SHEET = [
  // group band
  it_('SOURCE WATER', 234.8, 556, 21.7),
  it_('LOAD WATER', 311.4, 556, 17.6),
  it_('HEATING', 407.9, 556, 11.9),
  // sub-headers
  it_('FLOW', 232.9, 551.6, 7.7),
  it_('CONTROL', 266.2, 551.6, 12.9),
  it_('FLOW', 299.7, 551.6, 7.7),
  it_('CONTROL', 331.6, 551.6, 12.9),
  it_('GLYCOL %', 346.0, 551.6, 13.9),
  it_('CAPACITY', 364.0, 551.6, 14.0),
  // units row — no mark, must not end the table or be read as data
  it_('(GPM)', 232.9, 547.6, 7.7),
  // heat pump rows
  it_('WWHP-01', 38.8, 540, 20), it_('150.8', 232.9, 540, 7.7), it_('25', 350.5, 540, 5), it_('703.7', 364, 540, 12),
  it_('WWHP-02', 38.8, 536, 20), it_('150.8', 232.9, 536, 7.7), it_('25', 350.5, 536, 5), it_('703.7', 364, 536, 12),
  it_('WWHP-03', 38.8, 532, 20), it_('150.8', 232.9, 532, 7.7), it_('25', 350.5, 532, 5), it_('703.7', 364, 532, 12),
  // a different schedule far below, with its own numbers under the same x
  it_('HEB-01', 38.8, 444, 18), it_('160.3', 349.0, 444, 12),
  it_('HWP-01', 38.8, 408, 20), it_('580', 349.0, 408, 10),
];

describe('geometry', () => {
  it('centres an item on its span', () => {
    expect(centerX(it_('X', 100, 500, 20))).toBe(110);
  });

  it('groups a printed line into one row despite a point of drift', () => {
    const rows = rowsFrom([it_('A', 10, 500), it_('B', 40, 501.5), it_('C', 70, 480)]);
    expect(rows.length).toBe(2);
    expect(rows[0].items.map(i => i.s)).toEqual(['A', 'B']);
  });

  it('orders rows down the page and items across it', () => {
    const rows = rowsFrom([it_('low', 10, 100), it_('right', 90, 500), it_('left', 10, 500)]);
    expect(rows[0].y).toBe(500);
    expect(rows[0].items.map(i => i.s)).toEqual(['left', 'right']);
  });

  it('widens a column in proportion to its header, with a floor', () => {
    const wide = columnRange(it_('GLYCOL %', 346, 551, 13.9));
    expect(wide.lo).toBeCloseTo(337.66, 1);
    expect(wide.hi).toBeCloseTo(368.24, 1);
    // A one-character header still gets a usable width.
    const narrow = columnRange(it_('%', 100, 500, 3));
    expect(narrow.hi - narrow.lo).toBeGreaterThan(12);
  });
});

describe('reading a value under its header', () => {
  const gly = SHEET.find(i => i.s === 'GLYCOL %');

  it('picks the value centred under the header', () => {
    const row = rowsFrom(SHEET).find(r => markOf(r) === 'WWHP-01');
    expect(valueUnder(row, gly).value).toBe(25);
  });

  it('does not reach into the next column', () => {
    // CAPACITY's 703.7 centres at 370, outside the GLYCOL column's range.
    const row = rowsFrom(SHEET).find(r => markOf(r) === 'WWHP-01');
    expect(valueUnder(row, gly).text).not.toBe('703.7');
  });

  it('returns null for a blank cell instead of borrowing a neighbour', () => {
    // This is the failure mode that turns a gap in a schedule into a confident
    // wrong answer.
    const row = { y: 520, items: [it_('WWHP-09', 38.8, 520, 20), it_('703.7', 364, 520, 12)] };
    expect(valueUnder(row, gly)).toBeNull();
  });

  it('ignores non-numeric text in the column', () => {
    const row = { y: 520, items: [it_('WWHP-09', 38.8, 520, 20), it_('N/A', 350.5, 520, 5)] };
    expect(valueUnder(row, gly)).toBeNull();
  });
});

describe('marks identify a data row', () => {
  it('recognises equipment marks', () => {
    expect(markOf({ items: [it_('WWHP-01', 10, 500)] })).toBe('WWHP-01');
    expect(markOf({ items: [it_('HEB-01', 10, 500)] })).toBe('HEB-01');
  });

  it('rejects header and unit rows, which is what separates them from data', () => {
    expect(markOf({ items: [it_('MARK', 10, 500)] })).toBe('');
    expect(markOf({ items: [it_('(GPM)', 10, 500)] })).toBe('');
    expect(markOf({ items: [] })).toBe('');
  });
});

describe('a table ends somewhere', () => {
  const gly = SHEET.find(i => i.s === 'GLYCOL %');

  it('stops at the gap before the next schedule', () => {
    const rows = tableRows(rowsFrom(SHEET), gly);
    expect(rows.map(markOf)).toEqual(['WWHP-01', 'WWHP-02', 'WWHP-03']);
  });

  it('reads the whole column and NOTHING from the schedules below it', () => {
    // Without the gap rule this returns HEB-01's 160.3 and HWP-01's 580 as
    // glycol concentrations — a boiler flow and a pump weight.
    const got = columnByMark(SHEET, /^GLYCOL\s*%$/);
    expect(got.map(g => g.mark)).toEqual(['WWHP-01', 'WWHP-02', 'WWHP-03']);
    expect(got.every(g => g.value === 25)).toBe(true);
  });

  it('the values land dead-centre, which is what makes the read trustworthy', () => {
    for (const g of columnByMark(SHEET, /^GLYCOL\s*%$/)) expect(g.offset).toBeLessThan(3);
  });

  it('a unit row inside the table does not end it', () => {
    const rows = tableRows(rowsFrom(SHEET), SHEET.find(i => i.s === 'GLYCOL %'));
    expect(rows.length).toBe(3);
  });

  it('a gap under the factor is still the same table', () => {
    const tight = [
      it_('H', 100, 500, 10),
      it_('A-01', 10, 490, 15), it_('1', 102, 490, 4),
      it_('A-02', 10, 486, 15), it_('2', 102, 486, 4),
      // 3x the 4pt spacing is the boundary; 10pt is inside it.
      it_('A-03', 10, 476, 15), it_('3', 102, 476, 4),
    ];
    expect(columnByMark(tight, /^H$/).length).toBe(3);
    expect(GAP_FACTOR).toBe(3);
  });
});

describe('which band a column sits under', () => {
  const G = /^(SOURCE WATER|LOAD WATER|HEATING)$/;

  it('scopes a column that sits under a group band', () => {
    const flows = findHeaders(SHEET, /^FLOW$/);
    expect(groupOver(SHEET, flows[0], G)).toBe('SOURCE WATER');
    expect(groupOver(SHEET, flows[1], G)).toBe('LOAD WATER');
  });

  it('returns nothing for a column that sits under NO band', () => {
    // GLYCOL % starts one point after LOAD WATER's last sub-column and well
    // before HEATING. The sheet does not say which loop it is about, and
    // inventing one from the row text would scope it to the wrong side.
    expect(groupOver(SHEET, SHEET.find(i => i.s === 'GLYCOL %'), G)).toBe('');
  });

  it('will not reach up to a band on a distant row', () => {
    const far = it_('SOMETHING', 346, 400, 13.9);
    expect(groupOver(SHEET, far, G)).toBe('');
  });

  it('will not match a band below the column', () => {
    const above = it_('X', 234.8, 600, 20);
    expect(groupOver(SHEET, above, G)).toBe('');
  });
});
