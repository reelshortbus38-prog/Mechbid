import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { totalParts, missingFromTotal, totalIsWhole } from './runningTotal.js';
import RunningTotal from './RunningTotal.jsx';
import { StateProvider } from '../state/StateProvider.jsx';
import { AuthProvider } from '../lib/auth.jsx';
import Wizard from './Wizard.jsx';

// "And should there be a button to tap to get the grand total from all?"
//
// The arithmetic was already there — computeBidTotals has produced the whole
// figure all along. It was only ever SHOWN on the Proposal step, so an
// estimator four steps back could see a materials subtotal and nothing else.

const FULL = { materials: 80766, refrigerant: 2400, labor: 104000, oot: 8100, other: 5200, total: 200466 };
const MATERIALS_ONLY = { materials: 80766, refrigerant: 0, labor: 0, oot: 0, other: 0, total: 80766 };

describe('what the panel lists', () => {
  it('breaks the bid into the parts it is made of', () => {
    expect(totalParts(FULL).map(p => p.label))
      .toEqual(['Materials', 'Refrigerant', 'Labor', 'Out of town', 'Subs, rentals, bond & permits']);
  });

  it('shows a zero part rather than hiding it', () => {
    // A line that is not there cannot be noticed as missing.
    const parts = totalParts(MATERIALS_ONLY);
    expect(parts.find(p => p.key === 'labor').amount).toBe(0);
    expect(parts).toHaveLength(5);
  });

  it('survives a breakdown that is not there yet', () => {
    expect(totalParts(undefined).every(p => p.amount === 0)).toBe(true);
    expect(missingFromTotal(undefined)).toEqual(['materials', 'labor']);
  });
});

// ── A TOTAL ON AN UNFINISHED BID LOOKS FINAL ─────────────────────────────────
describe('what it says is missing', () => {
  it('names labor on a bid that has none', () => {
    // The usual case on the Materials step: most of a bid, missing its biggest
    // line, shown as a large green number.
    expect(missingFromTotal(MATERIALS_ONLY)).toEqual(['labor']);
    expect(totalIsWhole(MATERIALS_ONLY)).toBe(false);
  });

  it('names both when nothing is priced', () => {
    expect(missingFromTotal({ total: 0 })).toEqual(['materials', 'labor']);
  });

  it('says nothing is missing when both are there', () => {
    expect(missingFromTotal(FULL)).toEqual([]);
    expect(totalIsWhole(FULL)).toBe(true);
  });

  // ── IT DOES NOT CRY WOLF ──────────────────────────────────────────────────
  // Out-of-town is genuinely zero on an in-town job and subs are zero on
  // plenty of jobs. Flagging those would put a warning on every local bid and
  // teach an estimator to ignore the panel — which is the one thing a warning
  // cannot survive.
  it('does not call an in-town job with no subs unfinished', () => {
    const inTown = { materials: 80766, refrigerant: 2400, labor: 104000, oot: 0, other: 0, total: 187166 };
    expect(missingFromTotal(inTown)).toEqual([]);
    expect(totalIsWhole(inTown)).toBe(true);
  });

  it('is not fooled by a total that exists while the parts do not', () => {
    expect(totalIsWhole({ total: 5000 })).toBe(false);
  });
});

describe('the button', () => {
  // Through the real provider on a fresh job — the state a new bid starts in,
  // which is where this button is most likely to be tapped first.
  const html = () => renderToStaticMarkup(
    <StateProvider><RunningTotal /></StateProvider>,
  );

  it('renders on a job with nothing in it', () => {
    expect(html()).toMatch(/Σ/);
  });

  it('says "Total" rather than $0 when there is nothing yet', () => {
    // "$0" on a fresh job reads as an answer. The word reads as a button.
    expect(html()).toMatch(/Total/);
    expect(html()).not.toMatch(/\$0/);
  });
});

// ── AND IT HAS TO BE ON THE HEADER ───────────────────────────────────────────
// Deleting <RunningTotal /> from the Wizard broke nothing: the component was
// tested on its own, and nothing asserted it was mounted anywhere. A button
// nobody can reach is not a button — and this is the third time in this
// session a check has passed over something that was not actually wired up.
describe('the Wizard header carries it', () => {
  it('renders the total button on a fresh job', () => {
    const html = renderToStaticMarkup(
      <AuthProvider><StateProvider><Wizard /></StateProvider></AuthProvider>,
    );
    expect(html, 'the running total is not on the header').toMatch(/Σ/);
  });

  it('puts it in the header, not buried in a step', () => {
    // Before the step nav, which is where the rest of the header lives.
    const html = renderToStaticMarkup(
      <AuthProvider><StateProvider><Wizard /></StateProvider></AuthProvider>,
    );
    const sigma = html.indexOf('Σ');
    const setup = html.indexOf('Setup');
    expect(sigma).toBeGreaterThan(-1);
    expect(setup).toBeGreaterThan(-1);
    expect(sigma).toBeLessThan(setup);
  });
});
