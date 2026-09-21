import { describe, it, expect } from 'vitest';
import { reducer, initialState, DELETED_TRAIL_MAX, defaultHardwarePrice } from './store.js';
import {
  captureOtRule, companyOtRule, captureCompanyDefaults, hasCompanyDefaults,
  describeCompanyDefaults, OT_RULE_KEY,
} from './companyDefaults.js';

// ── "if you delete a material and didn't mean to how can you get it back" ────
// You could not. The × removed the row and that was the end of it.
//
// On a generated line that is not a small retype. The description carries the
// sizing, the spacing spec and the note saying where the quantity came from —
// `3" Pipe Saddles (Insuguard) @ 6ft spacing — 7/8" MT suction, 1-1/8" MT
// suction` is not something anybody types back from memory. And the obvious
// recovery, regenerating from circuits, overwrites every hand edit on the
// whole list: the fix was worse than the mistake.

const row = (id, desc) => ({ id, section: 'Hardware', desc, qty: 4, unit: 'ea', unitCost: 3, total: 12 });
const LIST = [row('a', 'first'), row('b', 'second'), row('c', 'third')];
const start = { ...initialState, lineItems: LIST, deletedLineItems: [] };

const del = (state, id) => reducer(state, { type: 'REMOVE_LINE_ITEM', id });
const undo = (state, at) => reducer(state, { type: 'RESTORE_LINE_ITEM', ...(at === undefined ? {} : { at }) });

describe('deleting a material row', () => {
  it('removes it and remembers it', () => {
    const after = del(start, 'b');
    expect(after.lineItems.map(i => i.id)).toEqual(['a', 'c']);
    expect(after.deletedLineItems).toHaveLength(1);
    expect(after.deletedLineItems[0].item.desc).toBe('second');
  });

  it('puts it back where it was, not at the end', () => {
    // On a hundred-line list, restoring to the bottom is the difference
    // between an undo and "now go find it again".
    const back = undo(del(start, 'b'));
    expect(back.lineItems.map(i => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('restores the row itself, every field of it', () => {
    const back = undo(del(start, 'b'));
    expect(back.lineItems[1]).toEqual(LIST[1]);
  });

  it('takes the row off the trail once it is back', () => {
    // Otherwise undo twice puts two copies on the bid.
    const back = undo(del(start, 'b'));
    expect(back.deletedLineItems).toHaveLength(0);
    expect(undo(back).lineItems.map(i => i.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('deleting several', () => {
  it('is a trail, newest first — not a single slot', () => {
    // Deleting three and wanting the FIRST one back is exactly when this is
    // needed, and a one-deep undo cannot do it.
    let s = del(del(del(start, 'a'), 'b'), 'c');
    expect(s.lineItems).toHaveLength(0);
    expect(s.deletedLineItems.map(d => d.item.id)).toEqual(['c', 'b', 'a']);
    s = undo(s, 2);                       // the one deleted first
    expect(s.lineItems.map(i => i.id)).toEqual(['a']);
    expect(s.deletedLineItems.map(d => d.item.id)).toEqual(['c', 'b']);
  });

  it('undoes the most recent when nothing says which', () => {
    const s = undo(del(del(start, 'a'), 'c'));
    expect(s.lineItems.map(i => i.id)).toEqual(['b', 'c']);
  });

  it('stops growing at the cap', () => {
    let s = { ...initialState, lineItems: Array.from({ length: 30 }, (_, i) => row(`r${i}`, `row ${i}`)), deletedLineItems: [] };
    for (let i = 0; i < 20; i++) s = del(s, `r${i}`);
    expect(s.deletedLineItems).toHaveLength(DELETED_TRAIL_MAX);
    expect(s.deletedLineItems[0].item.id).toBe('r19');
  });
});

describe('when undo has nothing to do', () => {
  it('an empty trail changes nothing', () => {
    expect(undo(start)).toBe(start);
  });

  it('deleting an id that is not there changes nothing', () => {
    expect(del(start, 'nope')).toBe(start);
  });

  it('survives the list having moved on since the delete', () => {
    // Delete row three, then delete the two above it. The stored index 2 is
    // now past the end of a one-row list; clamping beats throwing the row away
    // or indexing off the end.
    let s = del(start, 'c');
    s = del(del(s, 'a'), 'b');
    const back = undo(s, 2);
    expect(back.lineItems.map(i => i.id)).toEqual(['c']);
  });

  it('clears the trail when asked', () => {
    const s = reducer(del(start, 'b'), { type: 'CLEAR_DELETED_LINE_ITEMS' });
    expect(s.deletedLineItems).toEqual([]);
    expect(s.lineItems.map(i => i.id)).toEqual(['a', 'c']);
  });
});

// ── SADDLES ARE PRICED BY SIZE NOW ───────────────────────────────────────────
// "let's start at $2 for the 2" and go up a dollar for each inch."
describe('the shipped default price for a saddle', () => {
  it('follows the size on the line', () => {
    expect(defaultHardwarePrice('2" Pipe Saddles (Insuguard) @ 6ft spacing — 5/8" MT suction')).toBe(2);
    expect(defaultHardwarePrice('3" Pipe Saddles (Insuguard) @ 6ft spacing — 7/8" MT suction')).toBe(3);
    expect(defaultHardwarePrice('4" Pipe Saddles (Insuguard) @ 6ft spacing — 1-3/8" MT suction')).toBe(4);
    expect(defaultHardwarePrice('5" Pipe Saddles (Insuguard) @ 6ft spacing — 2-1/8" LT suction')).toBe(5);
  });

  it('still prices a saddle line with no size on it', () => {
    // Hand-typed, or generated from copper the app could not read. The middle
    // of the range is the least wrong guess, and it is not zero.
    expect(defaultHardwarePrice('Pipe Saddles (Insuguard)')).toBe(3);
    expect(defaultHardwarePrice('Insuguard saddle')).toBe(3);
  });

  it('does not let the sized entries shadow the rest of the table', () => {
    // These sit above the generic saddle row because .find takes the first
    // match. Anything else matching "2\"" must not have been caught by them.
    expect(defaultHardwarePrice('Unistrut')).toBe(25);
    expect(defaultHardwarePrice('3/8" All-Thread Rod')).toBe(8);
  });
});

// ── THE SHOP'S OVERTIME RULE IS A SHOP FACT ──────────────────────────────────
describe('capturing and seeding the overtime rule', () => {
  it('reads the weekly rule off a job set up correctly', () => {
    const r = captureOtRule({ laborMode: 'flat', flatJob: { weeklyOtHours: 40, otMult: 1.5 } });
    expect(r).toEqual({ basis: 'weekly', afterHours: 0, weeklyHours: 40, mult: 1.5 });
  });

  it('reads a daily rule, and both together', () => {
    expect(captureOtRule({ laborMode: 'flat', flatJob: { otAfterHours: 8, otMult: 1.5 } }).basis).toBe('daily');
    const both = captureOtRule({ laborMode: 'flat', flatJob: { otAfterHours: 8, weeklyOtHours: 40, otMult: 2 } });
    expect(both.basis).toBe('both');
    expect(both.afterHours).toBe(8);
    expect(both.weeklyHours).toBe(40);
  });

  it('takes it off the first labor period when the job is not flat', () => {
    const r = captureOtRule({ laborPeriods: [{ weeklyOtHours: 40, otMult: 1.5 }] });
    expect(r.basis).toBe('weekly');
  });

  it('stores nothing when no threshold is set', () => {
    // Capturing here would store "this shop pays no overtime", which is a
    // claim nobody made.
    expect(captureOtRule({ laborMode: 'flat', flatJob: { otMult: 1.5 } })).toBeNull();
    expect(captureOtRule({})).toBeNull();
  });

  it('refuses to store a 1x multiplier as the shop premium', () => {
    // 1 is the hardcoded default nobody chose. Saving it would make the shop's
    // stored rule the bug — every future job seeded to price overtime at
    // straight time, and this time on purpose.
    expect(captureOtRule({ laborMode: 'flat', flatJob: { weeklyOtHours: 40, otMult: 1 } }).mult).toBe(0);
    expect(companyOtRule({ otRule: { basis: 'weekly', weeklyHours: 40, mult: 0 } }))
      .toEqual({ weeklyOtHours: 40 });
  });

  it('seeds a new period or flat job with it', () => {
    expect(companyOtRule({ otRule: { basis: 'weekly', afterHours: 0, weeklyHours: 40, mult: 1.5 } }))
      .toEqual({ weeklyOtHours: 40, otMult: 1.5 });
    expect(companyOtRule({})).toEqual({});
  });

  it('is carried by the save-my-numbers button', () => {
    const captured = captureCompanyDefaults(
      { laborMode: 'flat', flatJob: { weeklyOtHours: 40, otMult: 1.5 }, markupPct: 20 }, [],
    );
    expect(captured[OT_RULE_KEY].basis).toBe('weekly');
    expect(hasCompanyDefaults({ [OT_RULE_KEY]: { basis: 'weekly' } })).toBe(true);
  });

  it('says so on the settings card, premium and all', () => {
    const lines = describeCompanyDefaults({ [OT_RULE_KEY]: { basis: 'weekly', weeklyHours: 40, mult: 1.5 } });
    expect(lines.join(' ')).toMatch(/overtime past 40 in a week at 1\.5×/);
  });

  it('says plainly when a stored rule has no premium on it', () => {
    // The silent failure: a rule that splits the hours and prices both halves
    // the same. "1×" would read as a setting; "NO premium set" reads as a job
    // to do.
    const lines = describeCompanyDefaults({ [OT_RULE_KEY]: { basis: 'weekly', weeklyHours: 40, mult: 0 } });
    expect(lines.join(' ')).toMatch(/NO premium set/);
  });
});
