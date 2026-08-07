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
