import { describe, it, expect } from 'vitest';
import { sheetRole, resolveHvacPartCounts, tallyNote, cfmNote } from './sheetOverlap.js';

// Sheet titles are verbatim from the industrial set.
const OVERALL = 'M0.01 — MECHANICAL OVERALL PLAN';
const HIGH_BAY = 'M1.03 — Enlarged First Floor Plan - Building East High Bay';
const FLOOR_1 = 'M1.01 — FIRST FLOOR PLAN';
const FLOOR_2 = 'M1.02 — SECOND FLOOR PLAN';

const c = (desc, qty, drawing, fileName = 'set.pdf') => ({ desc, qty, drawing, fileName });

describe('sheetRole', () => {
  it('spots a blow-up of an area another sheet already covers', () => {
    expect(sheetRole(HIGH_BAY)).toBe('enlarged');
    expect(sheetRole('M2.04 PARTIAL PLAN - MECHANICAL ROOM')).toBe('enlarged');
    expect(sheetRole('ENLARGEMENT AT AHU-1')).toBe('enlarged');
  });

  it('treats ordinary plan sheets as additive', () => {
    expect(sheetRole(OVERALL)).toBe('plan');
    expect(sheetRole(FLOOR_1)).toBe('plan');
    expect(sheetRole('')).toBe('plan');
    expect(sheetRole(undefined)).toBe('plan');
  });
});

describe('resolveHvacPartCounts', () => {
  it('does not add an enlarged sheet on top of the plan that contains it', () => {
    // The six high-bay diffusers are drawn on both sheets. They are six.
    const [out] = resolveHvacPartCounts([
      c('SD-1 — Supply diffuser · 24x24 face', 40, OVERALL),
      c('SD-1 — Supply diffuser · 24x24 face', 6, HIGH_BAY),
    ]);
    expect(out.qty).toBe(40);
    expect(out.summedQty).toBe(46);
    expect(out.overlapTrimmed).toBe(true);
  });

  it('still adds two genuine floors together', () => {
    const [out] = resolveHvacPartCounts([
      c('SD-1 — Supply diffuser', 22, FLOOR_1),
      c('SD-1 — Supply diffuser', 18, FLOOR_2),
    ]);
    expect(out.qty).toBe(40);
    expect(out.overlapTrimmed).toBe(false);
  });

  it('sums several enlarged sheets with each other', () => {
    // Two different blow-ups are two different areas — additive between
    // themselves, and only capped against the plan pool.
    const [out] = resolveHvacPartCounts([
      c('EG-1 — Exhaust grille', 4, 'M1.03 ENLARGED PLAN - HIGH BAY'),
      c('EG-1 — Exhaust grille', 3, 'M1.04 ENLARGED PLAN - PAINT BOOTH'),
    ]);
    expect(out.qty).toBe(7);
  });

  it('keeps devices only an enlarged sheet showed', () => {
    // The overall plan drew the mechanical room as an empty box.
    const [out] = resolveHvacPartCounts([
      c('RG-2 — Return grille', 0, OVERALL),
      c('RG-2 — Return grille', 5, 'M2.04 PARTIAL PLAN - MECHANICAL ROOM'),
    ]);
    expect(out.qty).toBe(5);
  });

  it('takes the larger pool when the enlarged sheet read more than the plan', () => {
    const [out] = resolveHvacPartCounts([
      c('SD-1 — Supply diffuser', 3, OVERALL),
      c('SD-1 — Supply diffuser', 8, HIGH_BAY),
    ]);
    expect(out.qty).toBe(8);
    expect(out.summedQty).toBe(11);
  });

  it('keeps distinct descriptions apart and preserves first-seen order', () => {
    const out = resolveHvacPartCounts([
      c('SD-1 — Supply diffuser', 10, FLOOR_1),
      c('EG-1 — Exhaust grille', 4, FLOOR_1),
      c('SD-1 — Supply diffuser', 5, FLOOR_2),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].qty).toBe(15);
    expect(out[1].qty).toBe(4);
  });

  it('carries the first entry\'s other fields through', () => {
    const [out] = resolveHvacPartCounts([
      { desc: 'SD-1 — Supply diffuser', qty: 3, drawing: FLOOR_1, fileName: 'a.pdf', unitCost: 0, notes: '500 CFM' },
      { desc: 'SD-1  supply  DIFFUSER', qty: 2, drawing: FLOOR_2, fileName: 'b.pdf' },
    ]);
    expect(out.notes).toBe('500 CFM');
    expect(out.qty).toBe(5);
    expect(out.sources).toEqual(['a.pdf', 'b.pdf']);
  });

  it('survives empty input and junk entries', () => {
    expect(resolveHvacPartCounts()).toEqual([]);
    expect(resolveHvacPartCounts([null, { desc: '', qty: 4 }])).toEqual([]);
  });
});

describe('tallyNote', () => {
  it('shows the arithmetic when a double-count was removed', () => {
    const [out] = resolveHvacPartCounts([
      c('SD-1 — Supply diffuser', 40, OVERALL),
      c('SD-1 — Supply diffuser', 6, HIGH_BAY),
    ]);
    const note = tallyNote(out);
    expect(note).toContain('46 → 40');
    expect(note).toContain(OVERALL);
    expect(note).toContain('NOT added');
  });

  it('just lists the sheets when everything was additive', () => {
    const [out] = resolveHvacPartCounts([
      c('SD-1 — Supply diffuser', 22, FLOOR_1),
      c('SD-1 — Supply diffuser', 18, FLOOR_2),
    ]);
    expect(tallyNote(out)).toBe(`counted per sheet: ${FLOOR_1}: 22, ${FLOOR_2}: 18`);
  });

  it('says nothing when only one sheet reported the item', () => {
    const [out] = resolveHvacPartCounts([c('SD-1 — Supply diffuser', 22, FLOOR_1)]);
    expect(tallyNote(out)).toBe('');
  });
});

// ── THE SHEET LABEL HAS TO BE THE DEVICE'S OWN SHEET ─────────────────────────
// A live 11-sheet set came back with every air device labeled with the FIRST
// sheet's drawing number. Two things broke at once: the per-sheet tally read
// "M3.10a: 6, M3.10a: 1, M3.10a: 1, M3.10a: 2" — unreadable — and, far worse,
// every sheet looked like the same 'plan' sheet, so no enlarged-plan overlap
// could ever be detected for the 132 device types on that job.

describe('air devices pool by their own sheet', () => {
  it('detects the overlap once each sheet is named correctly', () => {
    const [e] = resolveHvacPartCounts([
      { desc: 'A — diffuser/grille · 10ø neck', qty: 6, fileName: 'set.pdf', drawing: 'M3.10a — HVAC PLAN LEVEL 0' },
      { desc: 'A — diffuser/grille · 10ø neck', qty: 4, fileName: 'set.pdf', drawing: 'M3.11 — ENLARGED PLAN AREA A' },
    ]);
    expect(e.qty).toBe(6);            // max across pools, not 10
    expect(e.overlapTrimmed).toBe(true);
  });

  it('still adds two genuine plan sheets', () => {
    const [e] = resolveHvacPartCounts([
      { desc: 'F — grille', qty: 6, fileName: 's.pdf', drawing: 'M3.10 — LEVEL 0' },
      { desc: 'F — grille', qty: 4, fileName: 's.pdf', drawing: 'M3.20 — LEVEL 1' },
    ]);
    expect(e.qty).toBe(10);
  });

  it('collapses repeats of one sheet instead of listing it four times', () => {
    const e = resolveHvacPartCounts([
      { desc: 'A — grille', qty: 6, fileName: 's.pdf', drawing: 'M3.10a' },
      { desc: 'A — grille', qty: 1, fileName: 's.pdf', drawing: 'M3.10a' },
      { desc: 'A — grille', qty: 2, fileName: 's.pdf', drawing: 'M3.10a' },
    ])[0];
    expect(e.qty).toBe(9);
    expect(tallyNote(e)).toBe('');   // one sheet, nothing to reconcile
  });
});

describe('cfmNote', () => {
  const merge = (...cfms) => resolveHvacPartCounts(
    cfms.map(c => ({ desc: 'A — grille · 10ø neck', qty: 1, fileName: 's.pdf', drawing: 'M1', cfm: c })))[0];

  it('prints a single flow as itself', () => {
    expect(cfmNote(merge(100))).toBe('100 CFM');
  });

  it('prints a range when a line covers several flows', () => {
    // The live card said "100 CFM" over 17 devices whose flows differed.
    expect(cfmNote(merge(100, 250, 150))).toBe('100–250 CFM (3 different flows on this line)');
  });

  it('says nothing when no flow was read', () => {
    expect(cfmNote(merge(0))).toBe('');
    expect(cfmNote({})).toBe('');
  });
});
