import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { SILICONE, SILICONE_COLORS, consumableLine } from './consumables.js';
import { defaultHardwarePrice } from '../state/store.js';

// "Can you add silicone to materials. Maybe with color options. I don't know
//  but definitely need the silicone added to the list."

describe('the silicone line', () => {
  it('says what it is for, not just what it is', () => {
    // A bare "Silicone" on a materials list is a line an estimator has to
    // guess the quantity of. Naming the work it covers is what makes a tube
    // count possible.
    expect(SILICONE.desc).toMatch(/case joints/i);
    expect(SILICONE.desc).toMatch(/penetrations/i);
  });

  it('is bought by the tube', () => {
    expect(SILICONE.unit).toBe('tube');
  });

  it('starts at zero, like every other consumable', () => {
    // Nothing is charged until somebody fills in what the job takes. A
    // confident quantity on a line nobody counted is worse than a blank.
    const line = consumableLine(SILICONE);
    expect(line.qty).toBe(0);
    expect(line.total).toBe(0);
  });

  it('carries a shipped default price so it is not free on the bid', () => {
    expect(defaultHardwarePrice(SILICONE.desc)).toBeGreaterThan(0);
  });

  // ── ON COLOUR ─────────────────────────────────────────────────────────────
  // It does not change the bid — every colour of the same sealant is the same
  // money, so four lines would be three extra zeros and no change to any
  // total. It changes the ORDER, and the order is where a wrong colour costs a
  // trip. So the colours ride on the line, which is what reaches the supply
  // house list.
  it('names the colours on the line, where the order can see them', () => {
    for (const c of SILICONE_COLORS) {
      expect(SILICONE.desc.toLowerCase(), c).toContain(c);
    }
    expect(SILICONE_COLORS).toContain('clear');
    expect(SILICONE_COLORS).toContain('white');
  });

  it('says the colour is a decision, not a default the app picked', () => {
    expect(SILICONE.desc).toMatch(/per store|say which when you order/i);
  });

  it('flags the food-zone grade, which is not the cheap tube', () => {
    expect(SILICONE.desc).toMatch(/NSF|food-zone/i);
  });
});

// ── IT HAS TO BE ON BOTH LISTS ───────────────────────────────────────────────
// The materials step builds consumables twice — once for the bid, once for the
// supply house list — longhand in both places. An item added to one and
// forgotten in the other is invisible: nothing fails, both lists render, and
// the only symptom is that what got ordered does not match what got bid.
//
// Source-level because the generators live inside a component function that
// no unit test reaches. Checking the CONSTANT is used twice rather than
// checking the word "silicone" appears twice: a hardcoded description pasted
// into the second generator would satisfy the word and would drift from the
// first one the next time either is edited.
describe('silicone reaches both generated lists', () => {
  const src = readFileSync(new URL('../steps/Step4_Materials.jsx', import.meta.url), 'utf8');

  it('is pushed from the shared constant in two places', () => {
    const uses = (src.match(/consumableLine\(SILICONE/g) || []).length;
    expect(uses, 'silicone is generated in fewer than both lists').toBe(2);
  });

  it('is not also hardcoded alongside the constant', () => {
    // Two sources for one line is how they drift apart.
    expect(src).not.toMatch(/desc:\s*'Silicone/i);
    expect(src).not.toMatch(/desc:\s*"Silicone/i);
  });
});
