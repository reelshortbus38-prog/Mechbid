import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { StateProvider } from '../state/StateProvider.jsx';
import { initialState } from '../state/store.js';
import DripPanCalc, { DripPanBody } from './DripPanCalc.jsx';
import {
  blankWidthIn, circuitsPerPan, panLayout, dripPanLines, pansPerSheet,
  PAN_LENGTH_FT, PAN_WIDTH_IN, LIP_IN, FOLD_IN, CIRCUIT_WIDTH_IN,
  SHEET_WIDTH_IN, SOURCE_BUY, SOURCE_FABRICATE,
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

  // ── WHAT GETS ORDERED IS A SHEET ────────────────────────────────────────
  // "we get sheet metal in 4' x 8' sheets". The line said linear feet of
  // blank, which describes what gets CUT and nothing anybody buys. A 4x8 is
  // 48" across and the blank is 20", so a sheet yields two pans and 8" of
  // scrap down one edge.
  it('is sheets, not linear feet of blank', () => {
    expect(l.unit).toBe('sheet');
    expect(l.qty).toBe(36);          // 72 pans ÷ 2 per sheet
    expect(l.desc).toMatch(/Sheet metal for drip pans — 4' × 8' sheets/);
  });

  it('states the yield and the scrap, so the count can be checked', () => {
    expect(l.notes).toMatch(/2 pan\(s\) per 4' × 8' sheet/);
    expect(l.notes).toMatch(/20" blank into 48"/);
    expect(l.notes).toMatch(/8" off the edge of each/);
  });

  it('states the fold schedule it was broken to', () => {
    expect(l.notes).toMatch(/Broken to 16" wide with 1.5" lips and a 0.5" hem/);
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

// ── A 4x8 SHEET YIELDS TWO PANS, NOT THREE ──────────────────────────────────
describe('what comes out of a sheet', () => {
  it('fits two 20 inch blanks across 48 inches', () => {
    expect(pansPerSheet()).toBe(2);
  });

  it('will not round its way into a third', () => {
    // Three across needs a blank under 16", which is the pan floor with no
    // lips on it. It does not fit and the arithmetic says so.
    expect(20 * 3).toBeGreaterThan(SHEET_WIDTH_IN);
    expect(pansPerSheet({ foldIn: 0.25 })).toBe(2);   // 19.5" blank, still two
  });

  it('fits more out of a narrower pan', () => {
    expect(pansPerSheet({ widthIn: 8, lipIn: 1, foldIn: 0.25 })).toBe(4);
  });

  // A pan longer than the sheet is a splice, not a cut.
  it('yields nothing when the pan is longer than the sheet', () => {
    expect(pansPerSheet({ panFt: 10 })).toBe(0);
    const [l] = dripPanLines({ coveredFt: 96, circuits: 11, panFt: 10 });
    expect(l.unit).toBe('ft');
    expect(l.notes).toMatch(/does not come out of a 8' sheet/);
  });
});

// ── NOT EVERY SHOP HAS A BRAKE ──────────────────────────────────────────────
// "Other companies may have to buy them already built"
describe('a shop that buys them finished', () => {
  const [l] = dripPanLines({ coveredFt: 96, circuits: 11, source: SOURCE_BUY });

  it('gets pans by the each, not sheets it cannot fold', () => {
    expect(l.unit).toBe('ea');
    expect(l.qty).toBe(72);
    expect(l.desc).toMatch(/Drip pans — 16" × 8', bought finished/);
  });

  it('still shows how the count was reached', () => {
    expect(l.notes).toMatch(/72 pan\(s\) — 12 along the route × 6 across/);
  });

  it('is not told about sheets or hems, which are not its problem', () => {
    expect(l.notes).not.toMatch(/sheet|hem|Broken to/i);
  });

  it('fabricating is the default, because that is what his shop does', () => {
    expect(dripPanLines({ coveredFt: 96, circuits: 11 })[0].unit).toBe('sheet');
  });
});

// ── AND THE CHOICE HAS TO REACH THE SCREEN ──────────────────────────────────
// A setting the module honours and the card never passes is the failure that
// keeps turning up in this project: the pure function is right, the test is
// green, and the app ignores it. The card is collapsed until it is tapped and
// these tests cannot tap, so the body is exported and rendered directly —
// which is also the only way to see that the covered feet reach the layout.
describe('the fabricate / buy choice on the card', () => {
  const JOB = {
    ...initialState, mode: 'Commercial Refrigeration',
    dripPanCoveredFt: 96,
    circuits: [
      { id: 'a', runLength: 150, sucHoriz: '1-3/8', liqHoriz: '5/8', tempType: 'medium' },
      { id: 'b', runLength: 120, sucHoriz: '7/8', liqHoriz: '1/2', tempType: 'low' },
    ],
  };
  const body = rates => renderToStaticMarkup(
    <StateProvider initial={{ ...JOB, rates: { ...JOB.rates, ...rates } }}><DripPanBody /></StateProvider>,
  );

  it('offers both, so a shop without a brake has somewhere to say so', () => {
    const html = body({});
    expect(html).toMatch(/We fabricate them/);
    expect(html).toMatch(/We buy them built/);
  });

  it('counts sheets while the shop is set to fabricate', () => {
    const html = body({ dripPanSource: SOURCE_FABRICATE });
    expect(html).toMatch(/Sheet metal/);
    expect(html).toMatch(/sheet\(s\) at 2 per/);
    expect(html).toMatch(/20&quot; into a 48&quot; sheet|20" into a 48" sheet/);
  });

  // THE ASSERTION THAT MATTERS. Set the shop to buy and the card must stop
  // talking about sheets — not just send a different flag to a pure function.
  it('counts finished pans, and drops the sheet talk, once the shop buys them', () => {
    const html = body({ dripPanSource: SOURCE_BUY });
    expect(html).toMatch(/Pans to buy/);
    expect(html).not.toMatch(/Sheet metal/);
    expect(html).not.toMatch(/hems/);
  });

  // The covered feet were component state, so collapsing the card threw the
  // walked number away. They are a fact about this store and belong on the bid.
  it('reads the covered feet off the job, not off a field that forgets', () => {
    expect(body({})).toMatch(/2 long × 1 across = 2|2 long/);
    const blank = renderToStaticMarkup(
      <StateProvider initial={{ ...JOB, dripPanCoveredFt: undefined }}><DripPanBody /></StateProvider>,
    );
    expect(blank).toMatch(/Enter the covered feet/);
  });
});
