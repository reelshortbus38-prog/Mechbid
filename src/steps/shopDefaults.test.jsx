import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StateProvider } from '../state/StateProvider.jsx';
import { AuthProvider } from '../lib/auth.jsx';
import { initialState, DEFAULT_LABOR_UNITS } from '../state/store.js';
import Step6_Proposal from './Step6_Proposal.jsx';

// ── ONE PLACE TO SET THE SHOP'S NUMBERS ─────────────────────────────────────
// "No contractor charges the same rate so everything should be editable and set
// to their own numbers after signing in."
//
// The card exists and captures the whole labor-unit library in one go. What it
// could not say was how much of that library is actually the shop's — and a
// profile written to localStorage before this renders is what a signed-in shop
// would have.

const noop = () => {};
const COMPANY_KEY = 'coldgauge_company_v1';

function withProfile(profile, fn) {
  const real = globalThis.localStorage;
  const store = new Map([[COMPANY_KEY, JSON.stringify(profile)]]);
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
      clear: () => store.clear(),
    },
    configurable: true,
  });
  try { return fn(); } finally {
    Object.defineProperty(globalThis, 'localStorage', { value: real, configurable: true });
  }
}

const html = () => renderToStaticMarkup(
  <AuthProvider>
    <StateProvider initial={{ ...initialState, mode: 'Commercial Refrigeration' }}>
      <Step6_Proposal onBack={noop} />
    </StateProvider>
  </AuthProvider>,
);

describe('the shop-defaults card', () => {
  it('tells a shop that none of the labor units are theirs yet', () => {
    // The actionable version of "unconfirmed", which has been true of nearly
    // everything for months and stopped being read.
    const out = withProfile({}, html);
    expect(out).toMatch(/labor units are still the ones this app shipped/);
    expect(out).toMatch(/a starting point, not your numbers/);
  });

  it('counts the split once they have set some', () => {
    const out = withProfile({ laborUnits: { perFtMed: 0.09, perCase: 2 } }, html);
    expect(out).toMatch(/2 of \d+ labor units are yours/);
  });

  it('stops nagging once every one is theirs', () => {
    const mine = {};
    for (const k of Object.keys(DEFAULT_LABOR_UNITS)) mine[k] = DEFAULT_LABOR_UNITS[k] * 2;
    const out = withProfile({ laborUnits: mine }, html);
    expect(out).toMatch(/All \d+ labor units are yours/);
    expect(out).not.toMatch(/still the ones this app shipped/);
  });

  it('shows the shop practice it has stored, not just the crew', () => {
    const out = withProfile({
      markupPct: 28,
      manHoursRate: 95,
      rates: { wasteFactor: 15, ductAccessoryPct: 12 },
    }, html);
    expect(out).toMatch(/\$95\/man-hr on residential/);
    expect(out).toMatch(/15% waste/);
    expect(out).toMatch(/12% duct hangers/);
  });

  it('still promises a saved bid is never re-priced', () => {
    const out = withProfile({ markupPct: 28 }, html);
    expect(out).toMatch(/what was quoted stays quoted/);
  });
});
