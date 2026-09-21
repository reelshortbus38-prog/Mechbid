import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  SECTION, SUCTION_FILTER_SIZES, suctionFilterLines,
  liquidLineSizes, liquidDrierLine, filterDrierLines,
} from './filtersDriers.js';

// "Can we add suction filters 3"-4"-5" and liquid line dryers to materials
//  list."
//
// They were on no list at all — not folded into another line, not priced at a
// guess, simply absent. On a rack job that is a set of parts that get bought
// and never bid.

const norm = s => String(s || '').replace(/"/g, '').trim();

describe('suction filters', () => {
  const lines = suctionFilterLines();

  it('is the three sizes he named, and only those', () => {
    // Unlike the saddles, no rule was given that would let a fourth size be
    // derived. Inventing one would be making up a spec rather than encoding
    // one, and a 6" line on the bid is a part nobody asked for.
    expect(SUCTION_FILTER_SIZES).toEqual([3, 4, 5]);
    expect(lines.map(l => l.filterSize)).toEqual([3, 4, 5]);
  });

  it('puts the size at the front where it can be read down a column', () => {
    expect(lines.map(l => l.desc.slice(0, 2))).toEqual(['3"', '4"', '5"']);
  });

  it('generates at zero, because the app cannot count suction groups', () => {
    // A suction filter goes in at the rack, one per group, and the group count
    // is a rack question this module has no access to. Same rule as the
    // trapeze lines: a zero gets filled in, a confident wrong number does not.
    for (const l of lines) {
      expect(l.qty).toBe(0);
      expect(l.total).toBe(0);
    }
  });

  it('says what drives the count instead of leaving a bare zero', () => {
    for (const l of lines) expect(l.desc).toMatch(/one per suction group/i);
  });

  it('mentions the cores, which are a separate order', () => {
    // The shell is bought once; the core is what gets changed at start-up and
    // is a line somebody forgets.
    for (const l of lines) expect(l.desc).toMatch(/core/i);
  });
});

describe('liquid line driers', () => {
  const circuits = [
    { id: 'a', liqHoriz: '5/8', sucHoriz: '1-3/8', tempType: 'low' },
    { id: 'b', liqHoriz: '1/2', sucHoriz: '7/8', tempType: 'medium' },
    { id: 'c', liqHoriz: '5/8', sucHoriz: '1-1/8', tempType: 'medium' },
  ];

  it('reads the liquid sizes off the takeoff rather than from memory', () => {
    expect(liquidLineSizes(circuits, norm)).toEqual(['1/2', '5/8']);
  });

  it('counts a riser-only drop, which still has a liquid line', () => {
    // It is the horizontal run that is missing, not the circuit.
    const withRiser = [...circuits, { id: 'r', isRiserOnly: true, liqRiser: '3/8' }];
    expect(liquidLineSizes(withRiser, norm)).toContain('3/8');
  });

  it('puts those sizes on the line', () => {
    expect(liquidDrierLine(circuits, norm).desc).toMatch(/Liquid lines on this job: 1\/2", 5\/8"/);
  });

  it('says so plainly when the takeoff has no sizes to give', () => {
    // The dangerous version of this line is one that prints an empty list and
    // reads as "there are none".
    const blank = liquidDrierLine([], norm).desc;
    expect(blank).toMatch(/cannot be read/i);
    expect(blank).not.toMatch(/Liquid lines on this job:/);
  });

  it('generates at zero and says what the count depends on', () => {
    const l = liquidDrierLine(circuits, norm);
    expect(l.qty).toBe(0);
    expect(l.desc).toMatch(/one per liquid line off the rack/i);
    expect(l.desc).toMatch(/spec calls for/i);
  });

  it('leaves the shell-versus-sealed choice to the spec', () => {
    expect(liquidDrierLine(circuits, norm).desc).toMatch(/replaceable-core|sealed/i);
  });
});

describe('the section they land in', () => {
  it('is its own, so they read as a checklist rather than as hardware', () => {
    expect(SECTION).toBe('Filters & Driers');
    for (const l of filterDrierLines([], norm)) expect(l.section).toBe(SECTION);
  });

  it('is four lines — three filters and the drier', () => {
    expect(filterDrierLines([], norm)).toHaveLength(4);
  });
});

// ── A NEW SECTION HAS TO BE ADDED TO THE PRICE AUTOFILL TOO ─────────────────
// The autofill runs price book → shipped default → $0, and it returns early
// on any section not in its list. A new section that is not added there gets
// NO pricing at all — not the shipped defaults, and more to the point not the
// shop's own saved prices. Every line in it would be free, and nothing would
// say so.
describe('the new section is priced', () => {
  const src = readFileSync(new URL('../steps/Step4_Materials.jsx', import.meta.url), 'utf8');

  it('is listed among the sections the autofill covers', () => {
    expect(src).toMatch(/const PRICED_SECTIONS = \[[^\]]*FILTER_SECTION/);
  });

  it('gates on that list rather than on hardcoded section names', () => {
    // The old form named two sections inline, which is why adding a third was
    // an easy thing to miss.
    expect(src).toMatch(/PRICED_SECTIONS\.includes\(it\.section\)/);
    expect(src).not.toMatch(/it\.section !== 'Hardware' && it\.section !== 'Consumables'/);
  });

  it('generates them on both lists, from the shared builder', () => {
    // Same discipline as the silicone line: an item on the bid and not on the
    // supply house list is an order that does not match the estimate.
    expect((src.match(/filterDrierLines\(/g) || []).length).toBe(2);
  });
});
