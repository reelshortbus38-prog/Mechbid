import { describe, it, expect } from 'vitest';
import pof from './partsOrderForm.js';

const { isPartsOrderForm, parsePartsOrderForm, formTypeOf, storeNumberOf, parseQty, isLegendRow } = pof;

// Rows lifted verbatim from FL 701's real forms (07/08/24 rack parts and
// 07/11/24 case ends), trimmed to the columns that carry anything. Column
// indices are the real ones: 0 part, 1 qty, 4 and 7 description, 11 color,
// 13 where-used, 14+ the legend block.
const at = (pairs) => { const r = []; for (const [c, v] of pairs) r[c] = v; return r; };

const HEADER = at([[0, 'Part Number'], [1, 'Qty'], [2, 'Description'], [11, 'Color'], [13, 'Where used']]);

const RACK_PARTS = [
  at([[0, 'Parts Order Form']]),
  at([[0, 'Ship To: '], [1, 'FL# 701'], [8, 'Refrigeration Contractor`'], [13, '701 Rack Parts']]),
  HEADER,
  at([[0, '08A12068'], [1, 8], [4, 'CPC Temp Sensor']]),
  at([[1, 3], [4, '3 5/8 ball valve']]),
  at([[0, '03B119051'], [1, 1], [4, '2 1/8 ball valve']]),
  at([[0, '03F10351'], [1, 2], [4, '3 1/8 ball valve']]),
  at([[0, '03E10225'], [1, 1], [4, 'ORIT-15']]),
  at([[0, '03B10132'], [1, 1], [4, 'MKC-2 208V coil']]),
  at([[14, 'CE   Engineering']]),
  at([[14, 'KW   KwikWorks'], [16, '599  Nobody']]),
  at([[14, 'LO  S/O Entry  Error'], [15, 'Yes'], [16, '812  Ray Bishop'], [18, 'Best Way'], [19, 'AL']]),
  at([[16, '818  Mark Leftwich'], [19, 'CA']]),
];

const CASE_ENDS = [
  at([[0, 'Parts Order Form']]),
  at([[0, 'Ship To: '], [1, 'FL# 701'], [13, '701 Case Ends']]),
  HEADER,
  at([[4, 'Produce']]),
  at([[1, 1], [4, 'DX6LN  1305000630'], [7, 'RH boxed end 3000 IS BRT, OS & yoder SB'], [13, 7]]),
  at([[4, 'Meat']]),
  at([[1, 1], [4, 'MX5HN'], [7, 'RH contoured end 3000, IS BRT, OS & yoder SB w/EPR'], [13, 23]]),
  at([[1, 1], [7, 'LH boxed end 3000, IS BRT, OS & yoder SB'], [13, 19]]),
  at([[1, 1], [7, 'Arneg/MX5HN boxed mutual end , 3000 both pnels BRT & yoder'], [13, '33/22']]),
  at([[4, 'FF & IC']]),
  at([[1, 1], [4, 'LV5V14 0212000264'], [7, 'RH end 3000, IS WSG, OS & yoder SB'], [13, 68]]),
  at([[1, 18], [4, 'Silicone']]),
  at([[14, 'CE   Engineering']]),
  at([[14, 'DV  Defective Vendor']]),
];

describe('recognising the form', () => {
  it('recognises both of FL 701s forms', () => {
    expect(isPartsOrderForm(RACK_PARTS)).toBe(true);
    expect(isPartsOrderForm(CASE_ENDS)).toBe(true);
  });

  it('does not claim an unrelated sheet', () => {
    expect(isPartsOrderForm([['Sys', 'Size', 'Model'], [1, '8ft', 'DX6LN']])).toBe(false);
  });

  it('reads which form it is, and the store', () => {
    expect(formTypeOf(RACK_PARTS, 'fl_701_070824_OCR3_Rack_Parts.xls')).toBe('rack parts');
    expect(formTypeOf(CASE_ENDS, 'FL_701_071124_OCR3_Case_Ends.xls')).toBe('case ends');
    expect(storeNumberOf(RACK_PARTS)).toBe('701');
  });
});

describe('the rack parts order', () => {
  const { items } = parsePartsOrderForm(RACK_PARTS);

  it('finds every line and nothing else', () => {
    expect(items).toHaveLength(6);
  });

  it('reads part number, quantity and description together', () => {
    expect(items[0]).toMatchObject({ qty: 8, partNumber: '08A12068', description: 'CPC Temp Sensor' });
  });

  it('keeps a line that has a quantity but NO part number', () => {
    // Three 3 5/8 ball valves with no part number is still three ball valves.
    expect(items[1]).toMatchObject({ qty: 3, partNumber: '', description: '3 5/8 ball valve' });
  });

  it('never reads the legend block as parts', () => {
    // "CE Engineering", "812 Ray Bishop", "Best Way", "AL" are reason codes,
    // technician names and states. An AI reading this sheet as text can and
    // does pull them in; the quantity rule cannot.
    const all = items.map(i => `${i.partNumber} ${i.description}`).join(' ');
    for (const junk of ['Engineering', 'KwikWorks', 'Ray Bishop', 'Best Way', 'Nobody']) {
      expect(all).not.toContain(junk);
    }
  });
});

describe('the case ends order', () => {
  const { items } = parsePartsOrderForm(CASE_ENDS);

  it('finds all six lines', () => {
    expect(items).toHaveLength(6);
  });

  it('attributes each end to its department', () => {
    // Three of these rows carry no model number at all — the heading above
    // them is the only thing saying which case they belong to.
    expect(items.map(i => i.section)).toEqual(['Produce', 'Meat', 'Meat', 'Meat', 'FF & IC', 'FF & IC']);
  });

  it('joins a description split across two columns', () => {
    expect(items[0].description).toBe('DX6LN 1305000630 · RH boxed end 3000 IS BRT, OS & yoder SB');
  });

  it('keeps a row whose description is only in the second column', () => {
    expect(items[2].description).toBe('LH boxed end 3000, IS BRT, OS & yoder SB');
  });

  it('reads where-used, including a two-case value', () => {
    expect(items.map(i => String(i.whereUsed))).toEqual(['7', '23', '19', '33/22', '68', '']);
  });

  it('does not treat a department heading as an item', () => {
    const d = items.map(i => i.description);
    expect(d).not.toContain('Produce');
    expect(d).not.toContain('Meat');
  });

  it('keeps the consumable line', () => {
    // 18 tubes of silicone is a real line on the order.
    expect(items[5]).toMatchObject({ qty: 18, description: 'Silicone' });
  });
});

describe('the quantity rule, which is what separates the three kinds of row', () => {
  it('accepts a positive number as a quantity', () => {
    expect(parseQty(3)).toBe(3);
    expect(parseQty(' 18 ')).toBe(18);
    expect(parseQty('1,200')).toBe(1200);
  });

  it('rejects everything a legend row puts in a cell', () => {
    for (const v of ['', '   ', 'Yes', 'AL', 'Case', null, undefined, '0', -1]) {
      expect(parseQty(v)).toBe(null);
    }
  });
});

describe('where the order stops', () => {
  it('a row living only in the legend columns ends the order', () => {
    expect(isLegendRow(at([[14, 'CE   Engineering']]))).toBe(true);
    expect(isLegendRow(at([[16, '812  Ray Bishop'], [19, 'AL']]))).toBe(true);
  });

  it('a real item row is not a legend row, even with a where-used value', () => {
    expect(isLegendRow(at([[1, 1], [7, 'RH boxed end'], [13, 7]]))).toBe(false);
  });

  it('an empty row is not a legend row — blank spacers must not end the order', () => {
    // The rack form has a blank row between the last part and the legend.
    expect(isLegendRow([])).toBe(false);
    expect(isLegendRow(at([[0, '   ']]))).toBe(false);
  });
});

describe('a form it does not recognise', () => {
  it('reports failure rather than inventing items, so the AI can take over', () => {
    const r = parsePartsOrderForm([['something', 'else'], [1, 2]]);
    expect(r.ok).toBe(false);
    expect(r.items).toEqual([]);
    expect(r.reason).toBeTruthy();
  });
});
