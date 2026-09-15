import { describe, it, expect } from 'vitest';
import { mergeIntoBook, preparePriceImport } from './priceCsv.js';
import { findPriceMatch } from './PriceBook.jsx';

// ── CATALOGS, PLURAL ────────────────────────────────────────────────────────
// "Contractors should definitely be able to add their catalog or catalogs from
// suppliers so they have their price on materials."
//
// The book was one flat list keyed by part number. A second catalog did not sit
// beside the first — it OVERWROTE it, row by row, wherever two houses stock the
// same part. A shop that imported Ferguson after Bond lost every overlapping
// Bond price and never saw it happen.

const row = (partId, desc, price, unit = 'ft') => ({ partId, desc, price, unit, category: 'Copper' });

describe('two catalogs in one book', () => {
  const bond = [row('CU-118', 'Copper tube 1-1/8', 11.00)];

  it('keeps both houses’ price for the same part', () => {
    const afterBond = mergeIntoBook([], bond, { supplier: 'Bond' }).merged;
    const after = mergeIntoBook(afterBond, [row('CU-118', 'Copper tube 1-1/8', 12.40)], { supplier: 'Ferguson' });

    expect(after.merged).toHaveLength(2);
    expect(after.added).toHaveLength(1);
    expect(after.updated).toHaveLength(0);   // nothing was overwritten
    const prices = after.merged.map(e => [e.supplier, e.price]);
    expect(prices).toEqual([['Bond', 11], ['Ferguson', 12.4]]);
  });

  it('still updates the SAME house’s price on a re-import', () => {
    // A catalog refresh from one supplier must land on that supplier's rows.
    const first = mergeIntoBook([], bond, { supplier: 'Bond' }).merged;
    const again = mergeIntoBook(first, [row('CU-118', 'Copper tube 1-1/8', 11.80)], { supplier: 'Bond' });
    expect(again.merged).toHaveLength(1);
    expect(again.updated).toHaveLength(1);
    expect(again.merged[0].price).toBe(11.8);
    expect(again.updated[0].supplier).toBe('Bond');
  });

  it('stamps the whole incoming catalog with whose it is', () => {
    const r = mergeIntoBook([], [row('A', 'a', 1), row('B', 'b', 2)], { supplier: 'Ferguson' });
    expect(r.merged.every(e => e.supplier === 'Ferguson')).toBe(true);
  });

  it('leaves a book with no catalogs behaving exactly as it always did', () => {
    // Every book already on a device looks like this. Nothing may change for it.
    const first = mergeIntoBook([], bond).merged;
    const again = mergeIntoBook(first, [row('CU-118', 'Copper tube 1-1/8', 12.40)]);
    expect(again.merged).toHaveLength(1);
    expect(again.updated).toHaveLength(1);
    expect(again.updated[0].supplier).toBeUndefined();   // no stray field
    expect(again.merged[0].price).toBe(12.4);
  });

  it('still refuses a unit disagreement, per supplier', () => {
    // The guard that exists because a per-box price once met a footage
    // quantity and multiplied 25x.
    const first = mergeIntoBook([], bond, { supplier: 'Bond' }).merged;
    const bad = mergeIntoBook(first, [row('CU-118', 'Copper tube 1-1/8', 260, 'box')], { supplier: 'Bond' });
    expect(bad.conflicts).toHaveLength(1);
    expect(bad.conflicts[0].supplier).toBe('Bond');
    expect(bad.merged[0].price).toBe(11);   // not applied
  });
});

describe('which price a job gets', () => {
  const book = [
    { partId: 'CU-118', desc: 'Copper tube 1-1/8', price: 11.00, unit: 'ft', supplier: 'Bond' },
    { partId: 'CU-118', desc: 'Copper tube 1-1/8', price: 12.40, unit: 'ft', supplier: 'Ferguson' },
    { partId: 'NITRO', desc: 'Nitrogen cylinder', price: 85, unit: 'ea', supplier: 'Bond' },
    { partId: 'TAPE', desc: 'Duct tape', price: 6, unit: 'roll' },
  ];

  it('prefers the house this job is buying from', () => {
    const m = findPriceMatch(book, { partId: 'CU-118', supplier: 'Ferguson' });
    expect(m.entry.price).toBe(12.4);
    expect(m.entry.supplier).toBe('Ferguson');
    expect(m.fromSupplier).toBeUndefined();   // it IS their price
  });

  it('offers another house’s price rather than a blank — and SAYS whose', () => {
    // Silently handing over Bond's number on a Ferguson job is the app
    // inventing a price. Showing nothing leaves a blank where a real figure
    // exists. Labelling it is the only honest answer.
    const m = findPriceMatch(book, { partId: 'NITRO', supplier: 'Ferguson' });
    expect(m.entry.price).toBe(85);
    expect(m.fromSupplier).toBe('Bond');
  });

  it('puts the estimator’s OWN typed entries above another house’s catalog', () => {
    // An unassigned row is a number he typed himself. That outranks a price
    // from a house he is not buying from.
    const withOwn = [...book, { partId: 'NITRO', desc: 'Nitrogen cylinder', price: 92, unit: 'ea' }];
    const m = findPriceMatch(withOwn, { partId: 'NITRO', supplier: 'Ferguson' });
    expect(m.entry.price).toBe(92);
    expect(m.fromSupplier).toBeUndefined();
  });

  it('finds an unassigned entry when no catalog has it', () => {
    const m = findPriceMatch(book, { partId: 'TAPE', supplier: 'Ferguson' });
    expect(m.entry.price).toBe(6);
  });

  it('behaves exactly as before when the job names no supplier', () => {
    const m = findPriceMatch(book, { partId: 'CU-118' });
    expect(m.entry.price).toBe(11);          // first match wins, as it always did
    expect(m.confidence).toBe('exact');
  });

  it('behaves exactly as before on a book with no suppliers at all', () => {
    const plain = [{ partId: 'CU-118', desc: 'Copper tube 1-1/8', price: 11, unit: 'ft' }];
    expect(findPriceMatch(plain, { partId: 'CU-118', supplier: 'Ferguson' }).entry.price).toBe(11);
    expect(findPriceMatch(plain, { partId: 'CU-118' }).entry.price).toBe(11);
  });

  it('still matches on description and still goes fuzzy', () => {
    expect(findPriceMatch(book, { desc: 'Nitrogen cylinder', supplier: 'Bond' }).confidence).toBe('exact');
    expect(findPriceMatch(book, { desc: 'Nitrogen cylinder — pressure test', supplier: 'Bond' }).confidence).toBe('fuzzy');
  });

  it('is null rather than broken on nothing', () => {
    expect(findPriceMatch([], { partId: 'X', supplier: 'Bond' })).toBe(null);
    expect(findPriceMatch(book, { supplier: 'Bond' })).toBe(null);
    expect(findPriceMatch(null, {})).toBe(null);
    expect(findPriceMatch(book)).toBe(null);
  });
});

// ── FILE TO PROPOSED MERGE, IN ONE TESTABLE CALL ────────────────────────────
// Every step of this used to live inside a FileReader callback, where no test
// can reach it. Dropping the supplier on the way through left the whole suite
// green — the pieces were covered and the wiring between them was not.
describe('preparePriceImport', () => {
  const CSV = 'Category,Description,Part Number,Unit,Price\nCopper,Copper tube 1-1/8,CU-118,ft,12.40\n';

  it('carries the supplier all the way from the picker to the rows', () => {
    const r = preparePriceImport([], CSV, 'Ferguson');
    expect(r.ok).toBe(true);
    expect(r.supplier).toBe('Ferguson');
    expect(r.result.merged.every(e => e.supplier === 'Ferguson')).toBe(true);
  });

  it('lands beside another house rather than on top of it', () => {
    const bond = preparePriceImport([], CSV, 'Bond').result.merged;
    const both = preparePriceImport(bond, CSV, 'Ferguson');
    expect(both.result.merged).toHaveLength(2);
    expect(both.result.updated).toHaveLength(0);
  });

  it('takes no supplier at all, which is what an existing book looks like', () => {
    const r = preparePriceImport([], CSV);
    expect(r.supplier).toBe('');
    expect(r.result.merged[0].supplier).toBeUndefined();
  });

  it('reports an empty file rather than proposing nothing', () => {
    const r = preparePriceImport([], 'Category,Description,Part Number,Unit,Price\n');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Nothing to import/);
  });

  it('reports a file that is not a price list', () => {
    const r = preparePriceImport([], 'this is not a csv at all');
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('is an error rather than a throw on nothing', () => {
    expect(preparePriceImport([], '').ok).toBe(false);
    expect(preparePriceImport([], null).ok).toBe(false);
  });
});
