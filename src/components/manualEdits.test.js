import { describe, it, expect } from 'vitest';
import {
  markEdited, isEdited, rescuedEdits, applyRescued, CARRIED_FIELDS,
} from './manualEdits.js';

const line = (o = {}) => ({
  id: 'a', src: 'HVAC pipe.pdf', desc: 'Pipe — 3/4" HWS', qty: 220,
  unit: 'ft', unitCost: 0, total: 0, ...o,
});

describe('markEdited', () => {
  it('records the field a person changed', () => {
    const r = markEdited(line(), 'qty');
    expect(isEdited(r, 'qty')).toBe(true);
    expect(isEdited(r, 'unit')).toBe(false);
  });

  it('accumulates rather than replacing', () => {
    let r = markEdited(line(), 'qty');
    r = markEdited(r, 'unit');
    expect(r.editedFields.sort()).toEqual(['qty', 'unit']);
  });

  it('does not mark a field that is nobody\'s to correct', () => {
    // `total` is qty × unitCost. Marking it would preserve a stale product.
    expect(markEdited(line(), 'total').editedFields).toBeUndefined();
    expect(markEdited(line(), 'src').editedFields).toBeUndefined();
  });

  it('leaves the row alone when nothing changes', () => {
    const r = markEdited(line(), 'qty');
    expect(markEdited(r, 'qty')).toBe(r);
  });
});

// ── THE BUG ─────────────────────────────────────────────────────────────────
describe('a corrected quantity survives re-reading the sheet', () => {
  it('carries the number somebody measured', () => {
    // The sheet says 220. Somebody walked it and it is 260. Re-analyze the
    // same sheet and it used to go quietly back to 220.
    const corrected = markEdited(line({ qty: 260 }), 'qty');
    const fresh = line({ id: 'b', qty: 220 });
    const merged = applyRescued(fresh, rescuedEdits(corrected));
    expect(merged.qty).toBe(260);
  });

  it('carries a corrected unit', () => {
    const corrected = markEdited(line({ unit: 'ft' }), 'unit');
    const fresh = line({ id: 'b', unit: 'ea' });
    expect(applyRescued(fresh, rescuedEdits(corrected)).unit).toBe('ft');
  });

  it('still carries a typed price, the half that already worked', () => {
    const priced = line({ unitCost: 12.4 });
    const fresh = line({ id: 'b', unitCost: 0 });
    expect(applyRescued(fresh, rescuedEdits(priced)).unitCost).toBe(12.4);
  });

  it('keeps the total honest rather than carrying a stale product', () => {
    const corrected = markEdited(line({ qty: 260, unitCost: 10, total: 2600 }), 'qty');
    const fresh = line({ id: 'b', qty: 220, unitCost: 10, total: 2200 });
    const merged = applyRescued(fresh, rescuedEdits(corrected));
    expect(merged.qty).toBe(260);
    expect(merged.total).toBe(2600);
  });

  it('survives a SECOND re-read', () => {
    // The marks travel with the values, or the correction only lasts one round.
    const corrected = markEdited(line({ qty: 260 }), 'qty');
    const once = applyRescued(line({ id: 'b', qty: 220 }), rescuedEdits(corrected));
    const twice = applyRescued(line({ id: 'c', qty: 220 }), rescuedEdits(once));
    expect(twice.qty).toBe(260);
  });

  it('carries a deliberate zero', () => {
    // "There is none of this on the job" is an answer, not a blank.
    const zeroed = markEdited(line({ qty: 0 }), 'qty');
    expect(applyRescued(line({ id: 'b', qty: 220 }), rescuedEdits(zeroed)).qty).toBe(0);
  });
});

// ── WHAT MUST STILL GET THROUGH ─────────────────────────────────────────────
describe('a better read still lands where nobody corrected anything', () => {
  it('takes the new quantity on an untouched row', () => {
    const untouched = line({ qty: 220 });
    const fresh = line({ id: 'b', qty: 245 });
    expect(applyRescued(fresh, rescuedEdits(untouched)).qty).toBe(245);
  });

  it('takes the new description even on a row whose quantity was fixed', () => {
    // This is why it is per field and not one flag per row. A row frozen
    // because somebody fixed its quantity would never accept a better read of
    // anything else.
    const corrected = markEdited(line({ qty: 260, desc: 'Pipe — 3/4" HWS/HWR' }), 'qty');
    const fresh = line({ id: 'b', qty: 220, desc: 'Pipe — 3/4" HWS' });
    const merged = applyRescued(fresh, rescuedEdits(corrected));
    expect(merged.qty).toBe(260);
    expect(merged.desc).toBe('Pipe — 3/4" HWS');
  });

  it('description is never carried — it is the key, and it says so', () => {
    expect(CARRIED_FIELDS).not.toContain('desc');
  });
});

describe('jobs saved before any of this existed', () => {
  it('behave exactly as they did', () => {
    // The old rule was: a non-zero unit cost carries, nothing else does. A row
    // with no editedFields must still do precisely that and no more.
    const old = { desc: 'x', qty: 100, unit: 'ea', unitCost: 5, total: 500 };
    expect(rescuedEdits(old)).toEqual({ unitCost: 5 });
  });

  it('rescues nothing from an untouched, unpriced row', () => {
    expect(rescuedEdits(line())).toEqual({});
    expect(rescuedEdits(null)).toEqual({});
  });

  it('returns the line untouched when there is nothing to lay over it', () => {
    const fresh = line({ id: 'b' });
    expect(applyRescued(fresh, {})).toBe(fresh);
  });
});
