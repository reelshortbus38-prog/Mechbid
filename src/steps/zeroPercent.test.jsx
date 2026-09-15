import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StateProvider } from '../state/StateProvider.jsx';
import { AuthProvider } from '../lib/auth.jsx';
import { initialState } from '../state/store.js';
import Step4Materials, { RatesPanel } from './Step4_Materials.jsx';

// ── THE BOX HAS TO SHOW THE ZERO BACK ────────────────────────────────────────
// `value={state.markupPct || 20}` redisplayed a stored 0 as 20 — the app
// overwriting an answer it had just been given, on the largest lever in the
// bid. A unit test on pctOr cannot see what the estimator is looking at.

const render = extra => renderToStaticMarkup(
  <AuthProvider>
    <StateProvider initial={{
      ...initialState, mode: 'Commercial Refrigeration',
      lineItems: [{ id: 'l1', desc: 'Copper', total: 100000 }],
      ...extra,
    }}>
      <Step4Materials onNext={() => {}} onBack={() => {}} />
    </StateProvider>
  </AuthProvider>,
);

// Every number input's value, so a specific one can be looked for.
const values = html => [...html.matchAll(/type="number"[^>]*?value="([^"]*)"/g)].map(m => m[1]);

describe('a zeroed markup stays zero on screen', () => {
  it('does not redisplay 0 as 20', () => {
    const out = render({ markupPct: 0 });
    expect(values(out)).toContain('0');
    // and the summary line agrees with the box
    expect(out).toContain('0% markup');
    expect(out).not.toContain('20% markup');
  });

  it('shows 20% for a job that never set one', () => {
    expect(render({ markupPct: '' })).toContain('20% markup');
  });

  it('shows a markup that was set', () => {
    expect(render({ markupPct: 28 })).toContain('28% markup');
  });
});

describe('waste and fitting markup can be zeroed too', () => {
  it('a shop that buys exact lengths sets waste to 0 and it holds', () => {
    const out = render({ rates: { ...initialState.rates, wasteFactor: 0 } });
    expect(out).toContain('0% waste');
    expect(out).not.toContain('10% waste');
  });

  it('a shop that passes fittings through at cost sets 0 and it holds', () => {
    const out = render({
      rates: { ...initialState.rates, fittingsMode: 'percentage', fittingsMarkupPct: 0 },
    });
    expect(out).toContain('0% fittings');
    expect(out).not.toContain('25% fittings');
  });

  it('both still default when nothing was set', () => {
    const out = render({ rates: { ...initialState.rates, fittingsMode: 'percentage', wasteFactor: '', fittingsMarkupPct: '' } });
    expect(out).toContain('10% waste');
    expect(out).toContain('25% fittings');
  });
});

// ── AND THE BOXES THEMSELVES ─────────────────────────────────────────────────
// The first version of this file asserted the SUMMARY line and nothing else,
// and putting `value={state.markupPct || 20}` back on the input left all six
// tests green. A summary saying "0% markup" is not the same claim as the box
// showing 0 — the same mistake this repo has now made four times, caught here
// only because every fix in this session gets deliberately broken first.
describe('the rate boxes show what is stored, not what the app would prefer', () => {
  const panel = state => renderToStaticMarkup(
    <StateProvider initial={{ ...initialState, ...state }}>
      <RatesPanel
        open
        onToggle={() => {}}
        summary=""
        state={{ ...initialState, ...state }}
        dispatch={() => {}}
        fittingsMode="percentage"
        updateCopperRate={() => {}}
        updateInsulRate={() => {}}
      />
    </StateProvider>,
  );
  // The value of the box under a named label — not "some box on the screen
  // has a 0 in it", which is how the first version of this test passed with
  // the bug in. Every rate box is a number input directly after its own label.
  const boxUnder = (html, label) => {
    const i = html.indexOf(label);
    if (i < 0) return null;
    const m = /type="number"[^>]*?value="([^"]*)"/.exec(html.slice(i));
    return m ? m[1] : null;
  };
  const MARKUP = 'Materials Markup (%)';
  const WASTE = 'Waste Factor (%)';
  const FITTINGS = 'Fittings Allowance (%)';

  it('a zeroed markup renders as 0, not as 20', () => {
    expect(boxUnder(panel({ markupPct: 0 }), MARKUP)).toBe('0');
  });

  it('an unset markup renders empty rather than inventing a number', () => {
    expect(boxUnder(panel({ markupPct: '' }), MARKUP)).toBe('');
  });

  it('a markup that was set renders as itself', () => {
    expect(boxUnder(panel({ markupPct: 28 }), MARKUP)).toBe('28');
  });

  it('a zeroed waste factor renders as 0, not as 10', () => {
    expect(boxUnder(panel({ rates: { ...initialState.rates, wasteFactor: 0 } }), WASTE)).toBe('0');
  });

  it('a zeroed fittings allowance renders as 0, not as 25', () => {
    expect(boxUnder(panel({ rates: { ...initialState.rates, fittingsMarkupPct: 0 } }), FITTINGS)).toBe('0');
  });

  it('each box still shows a value that WAS set', () => {
    const out = panel({ markupPct: 28, rates: { ...initialState.rates, wasteFactor: 7, fittingsMarkupPct: 12 } });
    expect(boxUnder(out, MARKUP)).toBe('28');
    expect(boxUnder(out, WASTE)).toBe('7');
    expect(boxUnder(out, FITTINGS)).toBe('12');
  });
});
