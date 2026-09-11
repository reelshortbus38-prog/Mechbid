import { describe, it, expect } from 'vitest';
import {
  csvCell, toCsv, parseCsv, detectColumns, findHeader, parsePrice,
  rowsToEntries, mergeIntoBook, importSummary, CSV_HEADER,
} from './priceCsv.js';

// ── THE BUG THE EXPORT SHIPPED WITH ─────────────────────────────────────────
describe('writing CSV', () => {
  it('escapes the inch mark that is in nearly every description here', () => {
    // The old export wrote `"Pipe — 1-1/8" copper"`, which any reader splits in
    // the wrong place. A quote inside a quoted field has to be doubled.
    expect(csvCell('Pipe — 1-1/8" copper')).toBe('"Pipe — 1-1/8"" copper"');
  });

  it('quotes a description containing a comma', () => {
    expect(csvCell('Elbow, long radius')).toBe('"Elbow, long radius"');
  });

  it('leaves a plain value alone', () => {
    expect(csvCell('Copper')).toBe('Copper');
    expect(csvCell(12.5)).toBe('12.5');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(null)).toBe('');
  });

  it('writes a file this app can read back', () => {
    // The old export could not round-trip its own output.
    const entries = [
      { category: 'Pipe', desc: 'Copper 1-1/8" type L, hard drawn', partId: 'CU-118', unit: 'ft', price: 12.4 },
      { category: 'Misc', desc: 'Elbow, 90°', partId: '', unit: 'ea', price: 3.15 },
    ];
    const back = rowsToEntries(parseCsv(toCsv(entries))).entries;
    expect(back).toHaveLength(2);
    expect(back[0].desc).toBe('Copper 1-1/8" type L, hard drawn');
    expect(back[0].price).toBe(12.4);
    expect(back[1].desc).toBe('Elbow, 90°');
  });

  it('starts with the header it promises', () => {
    expect(toCsv([]).split('\r\n')[0]).toBe(CSV_HEADER.join(','));
  });
});

// ── READING WHAT A BRANCH ACTUALLY SENDS ────────────────────────────────────
describe('parseCsv', () => {
  it('keeps a quoted comma inside its field', () => {
    expect(parseCsv('a,"b,c",d')).toEqual([['a', 'b,c', 'd']]);
  });

  it('reads a doubled quote as one quote', () => {
    expect(parseCsv('"1-1/8"" copper",12.40')).toEqual([['1-1/8" copper', '12.40']]);
  });

  it('handles CRLF, which is what a Windows export writes', () => {
    expect(parseCsv('a,b\r\nc,d\r\n')).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('survives a byte order mark', () => {
    expect(parseCsv('﻿Description,Price\nCopper,3')[0][0]).toBe('Description');
  });

  it('keeps a newline inside a quoted field', () => {
    expect(parseCsv('"line one\nline two",2')).toEqual([['line one\nline two', '2']]);
  });

  it('drops blank rows rather than importing empties', () => {
    expect(parseCsv('a,b\n\n\nc,d\n')).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('is empty rather than broken on nothing', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv(null)).toEqual([]);
  });
});

describe('detectColumns — every branch names them differently', () => {
  it('reads a plain header', () => {
    const m = detectColumns(['Category', 'Description', 'Part Number', 'Unit', 'Price']);
    expect(m).toEqual({ category: 0, desc: 1, partId: 2, unit: 3, price: 4 });
  });

  it('reads the names suppliers actually use', () => {
    const m = detectColumns(['Item #', 'Item Description', 'U/M', 'Your Price']);
    expect(m.partId).toBe(0);
    expect(m.desc).toBe(1);
    expect(m.unit).toBe(2);
    expect(m.price).toBe(3);
  });

  it('does not read "Unit Price" as the unit', () => {
    // The one that would quietly put a dollar figure in the unit column and a
    // unit string where the price goes.
    const m = detectColumns(['Description', 'Unit Price']);
    expect(m.price).toBe(1);
    expect(m.unit).toBeUndefined();
  });

  it('copes with a file that has only what it needs', () => {
    const m = detectColumns(['DESC', 'COST']);
    expect(m.desc).toBe(0);
    expect(m.price).toBe(1);
  });
});

describe('findHeader — the file does not start at row one', () => {
  it('skips a title row and the blank line under it', () => {
    const rows = parseCsv('ACME SUPPLY — CONTRACT PRICING\nExported 03/14\nDescription,Unit,Net Price\nCopper 1-1/8,ft,12.40');
    const h = findHeader(rows);
    expect(h.index).toBe(2);
    expect(h.map.price).toBe(2);
  });

  it('gives up rather than guessing on a file with no prices', () => {
    expect(findHeader(parseCsv('Name,Address\nBob,Main St'))).toBe(null);
  });
});

describe('parsePrice', () => {
  it('reads what a catalog writes', () => {
    expect(parsePrice('$1,234.56')).toBe(1234.56);
    expect(parsePrice('12.40')).toBe(12.4);
    expect(parsePrice(' $3 ')).toBe(3);
    expect(parsePrice('12.50 EA')).toBe(12.5);
  });

  it('reads a European decimal comma', () => {
    expect(parsePrice('1.234,56')).toBe(1234.56);
    expect(parsePrice('12,40')).toBe(12.4);
  });

  it('does not turn a thousands comma into a decimal', () => {
    expect(parsePrice('1,234')).toBe(1234);
  });

  it('reads a bracketed credit as negative, so it can be refused', () => {
    expect(parsePrice('(12.50)')).toBe(-12.5);
  });

  it('is null, not zero, when there is no price', () => {
    // Zero is a price. Treating a blank as zero would overwrite a real one
    // with nothing.
    expect(parsePrice('')).toBe(null);
    expect(parsePrice(null)).toBe(null);
    expect(parsePrice('call for pricing')).toBe(null);
    expect(parsePrice('0')).toBe(0);
  });
});

describe('rowsToEntries', () => {
  const csv = [
    'Item #,Item Description,U/M,Your Price',
    'CU-118,"Copper tube, 1-1/8"" type L",FT,12.40',
    'EL-90,"Elbow 90°, wrot",EA,$3.15',
    ',,,',
    'NP-1,No price line,EA,call for pricing',
    'CR-1,Returned goods,EA,(8.00)',
  ].join('\n');

  it('builds entries from a real-looking file', () => {
    const { entries } = rowsToEntries(parseCsv(csv));
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ partId: 'CU-118', unit: 'ft', price: 12.4 });
    expect(entries[0].desc).toBe('Copper tube, 1-1/8" type L');
  });

  it('says why it skipped what it skipped', () => {
    // "imported 412 of 900" with no explanation is not something anybody can
    // act on.
    const { skipped } = rowsToEntries(parseCsv(csv));
    const reasons = skipped.map(s => s.reason).join(' | ');
    expect(reasons).toMatch(/no price/);
    expect(reasons).toMatch(/negative price/);
  });

  it('files an uncategorised line rather than dropping it', () => {
    const { entries } = rowsToEntries(parseCsv('Description,Price\nCopper,12'));
    expect(entries[0].category).toBe('Imported');
  });

  it('reports a file it cannot read at all', () => {
    const { entries, skipped } = rowsToEntries(parseCsv('Name,Address\nBob,Main St'));
    expect(entries).toEqual([]);
    expect(skipped[0].reason).toMatch(/no header row/);
  });

  it('is empty rather than broken on nothing', () => {
    expect(rowsToEntries([]).entries).toEqual([]);
    expect(rowsToEntries().entries).toEqual([]);
  });
});

// ── MERGING INTO THE BOOK ───────────────────────────────────────────────────
describe('mergeIntoBook', () => {
  const book = [
    { id: '1', desc: 'Copper tube 1-1/8', partId: 'CU-118', unit: 'ft', price: 11.0 },
    { id: '2', desc: 'Elbow 90', partId: '', unit: 'ea', price: 3.0 },
  ];

  it('adds what is new', () => {
    const r = mergeIntoBook(book, [{ desc: 'Tee 1-1/8', partId: 'TE-118', unit: 'ea', price: 6.2 }]);
    expect(r.added).toHaveLength(1);
    expect(r.merged).toHaveLength(3);
  });

  it('updates a price by part number', () => {
    const r = mergeIntoBook(book, [{ desc: 'anything', partId: 'CU-118', unit: 'ft', price: 12.4 }]);
    expect(r.updated).toEqual([{ desc: 'Copper tube 1-1/8', partId: 'CU-118', from: 11, to: 12.4 }]);
    expect(r.merged.find(e => e.partId === 'CU-118').price).toBe(12.4);
  });

  it('falls back to matching on description when there is no part number', () => {
    const r = mergeIntoBook(book, [{ desc: 'Elbow 90', partId: '', unit: 'ea', price: 3.4 }]);
    expect(r.updated).toHaveLength(1);
    expect(r.added).toHaveLength(0);
  });

  it('leaves a matching price alone rather than claiming a change', () => {
    const r = mergeIntoBook(book, [{ desc: 'Elbow 90', partId: '', unit: 'ea', price: 3.0 }]);
    expect(r.unchanged).toBe(1);
    expect(r.updated).toEqual([]);
  });

  it('can add without touching any price already on the book', () => {
    const r = mergeIntoBook(book, [{ desc: 'Elbow 90', partId: '', unit: 'ea', price: 99 }], { updatePrices: false });
    expect(r.updated).toEqual([]);
    expect(r.merged.find(e => e.desc === 'Elbow 90').price).toBe(3.0);
  });

  // ── THE ONE THAT COSTS MONEY ──────────────────────────────────────────────
  it('HOLDS BACK a price whose unit disagrees', () => {
    // This app already shipped a bug where a per-box price met a footage
    // quantity and multiplied 25×. A catalog saying 'box' against a book
    // saying 'ft' is exactly that, and a computer cannot tell which is right.
    const r = mergeIntoBook(book, [{ desc: 'Copper tube 1-1/8', partId: 'CU-118', unit: 'box', price: 310 }]);
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0]).toMatchObject({ was: 'ft', now: 'box', price: 310, oldPrice: 11 });
    expect(r.updated).toEqual([]);
    expect(r.merged.find(e => e.partId === 'CU-118').price).toBe(11);
  });

  it('takes the catalog unit when the book has none — that is new information', () => {
    const noUnit = [{ id: '9', desc: 'Hanger rod', partId: 'ROD', unit: '', price: 4 }];
    const r = mergeIntoBook(noUnit, [{ desc: 'Hanger rod', partId: 'ROD', unit: 'ft', price: 5 }]);
    expect(r.conflicts).toEqual([]);
    expect(r.merged[0]).toMatchObject({ unit: 'ft', price: 5 });
  });

  it('does not invent changes out of an empty import', () => {
    const r = mergeIntoBook(book, []);
    expect(r.merged).toEqual(book);
    expect(r.added).toEqual([]);
    expect(r.updated).toEqual([]);
  });

  it('works on an empty book', () => {
    const r = mergeIntoBook([], [{ desc: 'A', partId: '', unit: 'ea', price: 1 }]);
    expect(r.added).toHaveLength(1);
    expect(r.merged).toHaveLength(1);
  });
});

describe('importSummary', () => {
  it('reads as a sentence before anybody agrees to it', () => {
    expect(importSummary({ added: [1, 2], updated: [3], unchanged: 4, conflicts: [5] }))
      .toBe('2 new · 1 price changed · 4 already matched · 1 held back');
  });

  it('says so when there is nothing to do', () => {
    expect(importSummary({ added: [], updated: [], unchanged: 0, conflicts: [] })).toBe('nothing to import');
    expect(importSummary()).toBe('nothing to import');
  });
});
