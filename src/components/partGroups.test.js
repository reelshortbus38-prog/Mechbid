import { describe, it, expect } from 'vitest';
import { partGroupOf, groupHvacParts, sortGroupParts } from './partGroups.js';

// The grouping that turns the ~100-line flat parts pile (real two-school set)
// into collapsible sections. Wrong group = a line hides where the estimator
// won't look for it, so the classifier is pinned here.

const p = (desc, over = {}) => ({ id: desc, desc, qty: 10, unitCost: 0, total: 0, ...over });

describe('partGroupOf', () => {
  it('classifies the real takeoff line shapes', () => {
    expect(partGroupOf(p('Ductwork — 22x16 duct (supply/return trunk)'))).toBe('duct-rect');
    expect(partGroupOf(p('Ductwork — 8"ø round duct (branch supply)'))).toBe('duct-round');
    expect(partGroupOf(p('Ductwork — 6" flex duct'))).toBe('duct-round');
    expect(partGroupOf(p('Pipe — 3/4" HWR'))).toBe('pipe');
    expect(partGroupOf(p('VAV Box · 6Ø · Nailor 3001'))).toBe('terminal');
    expect(partGroupOf(p('VAV box with reheat · 13x10 oval · Nailor 3001'))).toBe('terminal');
    expect(partGroupOf(p('Programmable / BMS thermostat'))).toBe('other');
    expect(partGroupOf(p('Supply diffuser · 24x24 face · 8" neck'))).toBe('other');
  });

  it('routes generated purchase lines by their dgen flag, not their wording', () => {
    // "Galvanized sheet metal (26 ga)" has no size in it — the flag is the signal.
    expect(partGroupOf(p('Galvanized sheet metal — 26 ga', { dgen: true }))).toBe('purchase');
    expect(partGroupOf(p('Ductwork — 12x12 duct', { dgen: true }))).toBe('purchase');
  });

  it('drain/condensate lines are PIPE even when labeled as duct', () => {
    // Real extraction labeled condensate drains "1 1/4"ø round duct (drain)" —
    // grouping them as duct would let the purchase converter price drain pipe
    // as pounds of sheet metal.
    expect(partGroupOf(p('Ductwork — 1 1/4"ø round duct (drain)'))).toBe('pipe');
    expect(partGroupOf(p('Ductwork — 1"ø round duct (drain)'))).toBe('pipe');
    expect(partGroupOf(p('Condensate drain — 3/4" PVC'))).toBe('pipe');
    expect(partGroupOf(p('Ductwork — 8"ø round duct (exhaust air)'))).toBe('duct-round'); // real duct untouched
  });

  it('a VAV-with-oval-size line is terminal, never rect duct', () => {
    // "13x10 oval" could parse as a rect size; the VAV wording must win.
    expect(partGroupOf(p('VAV box · 13x10 oval · Nailor 3001'))).toBe('terminal');
  });
});

describe('sortGroupParts', () => {
  it('orders duct by service (supply first) then biggest size first', () => {
    const lines = [
      p('Ductwork — 10x10 duct (return branch)'),
      p('Ductwork — 24x48 duct (supply)'),
      p('Ductwork — 8x8 duct (exhaust)'),
      p('Ductwork — 12x12 duct (supply)'),
    ];
    const sorted = sortGroupParts('duct-rect', lines).map(x => x.desc);
    expect(sorted).toEqual([
      'Ductwork — 24x48 duct (supply)',
      'Ductwork — 12x12 duct (supply)',
      'Ductwork — 10x10 duct (return branch)',
      'Ductwork — 8x8 duct (exhaust)',
    ]);
  });
});

describe('groupHvacParts', () => {
  it('builds ordered sections with count, footage, priced tally, and subtotal', () => {
    const parts = [
      p('VAV Box · 6Ø · Nailor 3001', { qty: 26, unitCost: 850, total: 22100 }),
      p('Ductwork — 22x16 duct (supply trunk)', { qty: 20 }),
      p('Ductwork — 10"ø round duct (supply branch)', { qty: 6 }),
      p('Galvanized sheet metal — 26 ga', { dgen: true, qty: 900, unitCost: 2.1, total: 1890 }),
      p('Pipe — 3/4" HWS', { qty: 0 }),
      p('Programmable / BMS thermostat', { qty: 1 }),
    ];
    const groups = groupHvacParts(parts);
    expect(groups.map(g => g.key)).toEqual(['duct-rect', 'duct-round', 'purchase', 'terminal', 'pipe', 'other']);
    const term = groups.find(g => g.key === 'terminal');
    expect(term.count).toBe(1);
    expect(term.qtySum).toBe(26);
    expect(term.pricedCount).toBe(1);
    expect(term.subtotal).toBe(22100);
    const rect = groups.find(g => g.key === 'duct-rect');
    expect(rect.qtySum).toBe(20);
    expect(rect.pricedCount).toBe(0);
  });

  it('omits empty groups', () => {
    const groups = groupHvacParts([p('Thermostat')]);
    expect(groups.map(g => g.key)).toEqual(['other']);
  });
});

// The proposal itemizes HVAC materials from these groups. Every priced part in
// the bid total must land in exactly one group, or the customer sees a total
// they can't reconcile from the printed lines — the same dispute the
// refrigeration proposal avoids by itemizing its materials.
describe('proposal coverage', () => {
  it('every priced part lands in exactly one group and subtotals reconcile', () => {
    const parts = [
      p('Ductwork — 22x16 duct (supply trunk)', { qty: 20, unitCost: 4, total: 80 }),
      p('Ductwork — 8"ø round duct', { qty: 6, unitCost: 5, total: 30 }),
      p('Ductwork — 1"ø round duct (drain)', { qty: 10, unitCost: 3, total: 30 }),
      p('VAV Box · 6Ø · Nailor 3001', { qty: 26, unitCost: 850, total: 22100 }),
      p('Galvanized sheet metal — 24 ga', { dgen: true, qty: 900, unitCost: 2.1, total: 1890 }),
      p('Programmable / BMS thermostat', { qty: 4, unitCost: 180, total: 720 }),
      p('Curb adapter', { qty: 2, unitCost: 450, total: 900 }),
    ];
    const groups = groupHvacParts(parts);
    const lineCount = groups.reduce((s, g) => s + g.count, 0);
    expect(lineCount).toBe(parts.length);                       // nothing dropped
    const grandTotal = groups.reduce((s, g) => s + g.subtotal, 0);
    expect(grandTotal).toBe(parts.reduce((s, x) => s + x.total, 0)); // dollars reconcile
    // and no part appears twice
    const ids = groups.flatMap(g => g.parts.map(x => x.id));
    expect(new Set(ids).size).toBe(parts.length);
  });
});
