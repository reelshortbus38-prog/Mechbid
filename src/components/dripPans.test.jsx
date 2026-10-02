import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { StateProvider } from '../state/StateProvider.jsx';
import { initialState } from '../state/store.js';
import DripPanCalc from './DripPanCalc.jsx';
import {
  blankWidthIn, circuitsPerPan, panLayout, dripPanLines,
  PAN_LENGTH_FT, PAN_WIDTH_IN, LIP_IN, FOLD_IN, CIRCUIT_WIDTH_IN,
} from './dripPans.js';

// ── THE FIRST VERSION GOT BOTH HALVES WRONG ──────────────────────────────────
// It had drip pans as a purchased part, generated on every refrigeration job.
//
//   "We fabricate our own pans. 16" wide with 1 1/2" lips with 1/4"-1/2" fold
//    on the lips. Each circuit is anywhere from 4"-8" wide so one pan generally
//    covers 2-4 circuits. The pans should probably be manually added because
//    some stores don't have drop ceilings."

describe('the blank is wider than the pan', () => {
  it('is the floor plus both lips plus both hems', () => {
    // 16 + 1.5 + 1.5 + 0.5 + 0.5
    expect(blankWidthIn()).toBe(20);
  });

  it('is 19.5 at the small end of the hem', () => {
    expect(blankWidthIn({ foldIn: 0.25 })).toBe(19.5);
  });

  // ── THE DEFAULT TAKES THE LARGER HEM ──────────────────────────────────────
  // A blank cut half an inch narrow is scrap. Half an inch wide is half an
  // inch of waste on a sheet that was going to have some anyway.
  it('defaults to the hem that cannot come up short', () => {
    expect(FOLD_IN).toBe(0.5);
    expect(blankWidthIn()).toBeGreaterThan(blankWidthIn({ foldIn: 0.25 }));
  });

  it('takes a different fold schedule', () => {
    expect(blankWidthIn({ widthIn: 12, lipIn: 2, foldIn: 0.5 })).toBe(17);
  });
});

// ── PANS RUN SIDE BY SIDE, NOT JUST END TO END ──────────────────────────────
// The first version counted the route end to end and stopped. A pan is 16" and
// the circuits are 4-8" wide each, so a wide bundle takes more than one pan
// ACROSS as well.
describe('how many circuits fit in a pan', () => {
  it('reproduces the 2-to-4 he gave, from the geometry', () => {
    expect(circuitsPerPan({ circuitWidthIn: 4 })).toBe(4);
    expect(circuitsPerPan({ circuitWidthIn: 8 })).toBe(2);
    expect(circuitsPerPan({ circuitWidthIn: 6 })).toBe(2);
  });

  it('takes the middle of his range as the default', () => {
    expect(CIRCUIT_WIDTH_IN).toBe(6);
    expect(PAN_WIDTH_IN).toBe(16);
    expect(LIP_IN).toBe(1.5);
    expect(PAN_LENGTH_FT).toBe(8);
  });

  it('never fits less than one, however wide the circuit', () => {
    // A circuit wider than the pan still gets a pan.
    expect(circuitsPerPan({ circuitWidthIn: 24 })).toBe(1);
  });
});

describe('the layout on a real route', () => {
  // Eleven circuits down a back hall, 96 ft of it over the sales floor.
  const L = panLayout({ coveredFt: 96, circuits: 11 });

  it('counts the pans along the route', () => {
    expect(L.long).toBe(12);          // 96 ÷ 8
  });

  it('counts the pans across the bundle, which the first version did not', () => {
    expect(L.perPan).toBe(2);         // 16" ÷ 6"
    expect(L.wide).toBe(6);           // 11 circuits ÷ 2, rounded up
  });

  it('is six times what counting end to end alone would have bought', () => {
    expect(L.pans).toBe(72);
    expect(L.long).toBe(12);
  });

  it('gives the flat stock in linear feet', () => {
    expect(L.blankFt).toBe(72 * 8);
  });

  it('is nothing until somebody says how much is covered', () => {
    expect(panLayout({ coveredFt: 0, circuits: 11 }).pans).toBe(0);
    expect(panLayout({ circuits: 11 }).pans).toBe(0);
  });

  it('still makes one pan wide for a route with no circuit count', () => {
    expect(panLayout({ coveredFt: 8, circuits: 0 }).wide).toBe(1);
  });
});

describe('the line it produces', () => {
  const [l] = dripPanLines({ coveredFt: 96, circuits: 11 });

  it('is flat stock by the foot, not pans by the each', () => {
    // They fabricate them. What gets ordered is sheet.
    expect(l.unit).toBe('ft');
    expect(l.qty).toBe(576);
    expect(l.desc).toMatch(/Drip pan sheet metal — 20" blank × 8' per pan/);
  });

  it('states the fold schedule it was cut to', () => {
    expect(l.desc).toMatch(/broken to 16" wide with 1.5" lips and a 0.5" hem/);
  });

  it('shows the arithmetic, both ways', () => {
    expect(l.notes).toMatch(/72 pan\(s\) — 12 along the route × 6 across/);
    expect(l.notes).toMatch(/2 circuit\(s\) per pan at 6" each/);
  });

  it('says the brake time is not in it', () => {
    // Fabrication is labor. Burying shop hours in a material line is how a
    // bid looks cheap and runs over.
    expect(l.notes).toMatch(/Shop time to brake them is labor, not here/);
  });

  it('produces nothing when nothing is covered', () => {
    expect(dripPanLines({ coveredFt: 0, circuits: 11 })).toEqual([]);
  });
});

// ── NOT GENERATED ───────────────────────────────────────────────────────────
// "some stores don't have drop ceilings"
describe('it is added by hand', () => {
  const src = readFileSync(new URL('../steps/Step4_Materials.jsx', import.meta.url), 'utf8');

  it('is not pushed by the generator', () => {
    expect(src, 'drip pans are being generated again').not.toMatch(/dripPanLines?\(/);
  });

  it('is on the step as a card with a button', () => {
    expect(src).toMatch(/<DripPanCalc \/>/);
  });
});

describe('the card', () => {
  const JOB = {
    ...initialState, mode: 'Commercial Refrigeration',
    circuits: [
      { id: 'a', runLength: 150, sucHoriz: '1-3/8', liqHoriz: '5/8', tempType: 'medium' },
      { id: 'b', runLength: 120, sucHoriz: '7/8', liqHoriz: '1/2', tempType: 'low' },
    ],
  };
  const card = state => renderToStaticMarkup(
    <StateProvider initial={state}><DripPanCalc /></StateProvider>,
  );

  it('says what it is and why it is not automatic', () => {
    const html = card(JOB);
    expect(html).toMatch(/Drip pans — fabricated/);
    expect(html).toMatch(/not every store has them/);
  });

  // A rack-only or riser-only scope has no horizontal pipe, so there is
  // nothing to put a pan under and no reason to show the card at all.
  it('stays away entirely when there is no route', () => {
    expect(card({ ...initialState, circuits: [{ id: 'r', isRiserOnly: true, riserLength: 20 }] })).toBe('');
    expect(card({ ...initialState, circuits: [] })).toBe('');
  });
});
