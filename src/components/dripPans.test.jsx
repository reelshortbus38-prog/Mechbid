import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StateProvider } from '../state/StateProvider.jsx';
import { initialState } from '../state/store.js';
import { RatesPanel } from '../steps/Step4_Materials.jsx';
import { readFileSync } from 'fs';
import { panCount, dripPanLine, PAN_LENGTH_FT, PAN_MAX_WIDTH_IN } from './dripPans.js';

// "Drip pans. They are only used above sales floor and any drop ceilings. The
//  specs say no larger than 16" wide pans and they are 8' long made from sheet
//  metal."

describe('the spec', () => {
  it('is 8 ft pans, 16 inches wide', () => {
    expect(PAN_LENGTH_FT).toBe(8);
    expect(PAN_MAX_WIDTH_IN).toBe(16);
  });

  it('puts both on the line, because they are what gets ordered', () => {
    const l = dripPanLine({ routeFt: 150, coveredFt: 96 });
    expect(l.desc).toMatch(/8' sheet metal/);
    expect(l.desc).toMatch(/16" max width/);
  });
});

describe('how many pans', () => {
  it('is the covered feet over the pan length', () => {
    expect(panCount(96)).toBe(12);
    expect(panCount(80)).toBe(10);
  });

  it('rounds up to a whole pan', () => {
    // You cannot buy two thirds of one, and the offcut from a cut pan does not
    // start the next run.
    expect(panCount(97)).toBe(13);
    expect(panCount(1)).toBe(1);
  });

  it('takes a chain that buys a different length', () => {
    expect(panCount(96, 10)).toBe(10);
    expect(panCount(96, 4)).toBe(24);
  });

  it('is nothing for nothing', () => {
    for (const junk of [0, -10, null, undefined, 'x']) expect(panCount(junk), String(junk)).toBe(0);
  });
});

// ── THEY FOLLOW THE ROUTE, NOT THE SUMMED FOOTAGE ────────────────────────────
// A pan sits UNDER the pipe, so one run of pans catches whatever is above it.
// Eleven circuits down the same back hall need one line of pans, not eleven —
// the same mistake hangers.js was written to stop.
describe('what the line is measured against', () => {
  it('carries the route length, not a circuit total', () => {
    const l = dripPanLine({ routeFt: 150 });
    expect(l.routeFt).toBe(150);
    expect(l.desc).toMatch(/route is about 150 ft/);
  });

  it('says nothing at all when there is no horizontal pipe', () => {
    // A riser-only or rack-only scope has no route and therefore no pans.
    expect(dripPanLine({ routeFt: 0 })).toBeNull();
    expect(dripPanLine({})).toBeNull();
  });
});

// ── WHICH PART OF THE ROUTE IS OVER A SALES FLOOR IS A WALK OF THE PLAN ──────
describe('when nobody has said how much is covered', () => {
  const l = () => dripPanLine({ routeFt: 150 });

  it('generates at zero rather than guessing', () => {
    expect(l().qty).toBe(0);
  });

  it('says what it is, and what it is not', () => {
    expect(l().desc).toMatch(/MEASURE ON SITE/);
    expect(l().desc).toMatch(/not over the back room/);
  });

  it('is flagged so the pre-flight asks for it', () => {
    // A zero that nothing chases is a line nobody answers.
    expect(l().hangerManual).toBe(true);
  });
});

describe('once somebody has measured it', () => {
  const l = dripPanLine({ routeFt: 150, coveredFt: 96 });

  it('counts the pans', () => {
    expect(l.qty).toBe(12);
    expect(l.coveredFt).toBe(96);
  });

  it('shows the arithmetic rather than just the answer', () => {
    expect(l.desc).toMatch(/96 ft of route over sales floor \/ drop ceiling ÷ 8 ft per pan/);
  });

  it('stops asking to be measured', () => {
    expect(l.desc).not.toMatch(/MEASURE ON SITE/);
    expect(l.hangerManual).toBeUndefined();
  });

  // A route with none of it over the sales floor is a real answer — a back-of-
  // house circuit needs no pans — and it is not the same as not having looked.
  it('takes a measured zero as an answer', () => {
    const none = dripPanLine({ routeFt: 150, coveredFt: 0 });
    expect(none.qty).toBe(0);
    expect(none.coveredFt).toBe(0);
    expect(none.desc).not.toMatch(/MEASURE ON SITE/);
    expect(none.hangerManual).toBeUndefined();
  });
});

// ── THE BOX HAS TO BE ON THE SCREEN AND REACH THE CALCULATION ───────────────
// Rendered through the real rates panel rather than grepped. The panel is
// collapsed in a static render of the whole step — it opens on a tap no test
// can perform — so it is rendered open directly, the way the markup boxes
// already are in zeroPercent.test.jsx, which is where that lesson was learned.
describe('the covered-feet box', () => {
  const panel = rates => renderToStaticMarkup(
    <StateProvider initial={{ ...initialState, rates: { ...initialState.rates, ...rates } }}>
      <RatesPanel
        open onToggle={() => {}} summary=""
        state={{ ...initialState, rates: { ...initialState.rates, ...rates } }}
        dispatch={() => {}} fittingsMode="percentage"
        updateCopperRate={() => {}} updateInsulRate={() => {}}
      />
    </StateProvider>,
  );
  // The input directly after its own label, not "some box has a number in it".
  const boxUnder = (html, label) => {
    const at = html.indexOf(label);
    if (at < 0) return null;
    const m = /value="([^"]*)"/.exec(html.slice(at, at + 700));
    return m ? m[1] : null;
  };

  it('is on the rates panel', () => {
    expect(panel({})).toMatch(/Drip pan route \(ft\)/);
  });

  it('says what it wants, in the box', () => {
    expect(panel({})).toMatch(/placeholder="over sales floor"/);
  });

  it('shows what was typed', () => {
    expect(boxUnder(panel({ dripPanCoveredFt: 96 }), 'Drip pan route (ft)')).toBe('96');
  });

  // ── A MEASURED ZERO IS AN ANSWER ──────────────────────────────────────────
  // An all-back-of-house job needs no pans, and that is not the same as nobody
  // having looked. The rate boxes in this app have a history of reading 0 as
  // unset and showing a default over the top of it.
  it('shows a zero that was typed, rather than treating it as unset', () => {
    expect(boxUnder(panel({ dripPanCoveredFt: 0 }), 'Drip pan route (ft)')).toBe('0');
  });

  it('is empty when nobody has answered, not zero', () => {
    expect(boxUnder(panel({}), 'Drip pan route (ft)')).toBe('');
  });
});

// And the number in that box has to reach the line.
describe('the box reaches the calculation', () => {
  const src = readFileSync(new URL('../steps/Step4_Materials.jsx', import.meta.url), 'utf8');

  it('feeds the generator the covered feet, the pan length and the width', () => {
    expect(src).toMatch(/coveredFt: rates\.dripPanCoveredFt/);
    expect(src).toMatch(/panFt: rates\.dripPanFt/);
    expect(src).toMatch(/maxWidthIn: rates\.dripPanWidthIn/);
  });

  it('measures it against the hanger ROUTE, not summed circuit footage', () => {
    // One run of pans catches whatever is above it. Summing circuits would buy
    // eleven times what a shared back hall takes.
    expect(src).toMatch(/routeFt: hangerBasis\(state\.circuits, hdr\.horizFt, spacingFt\)\.routeFt/);
  });
});
