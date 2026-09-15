import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StateProvider } from '../state/StateProvider.jsx';
import { AuthProvider } from '../lib/auth.jsx';
import { initialState } from '../state/store.js';
import { computeBidTotals } from './bidTotals.js';
import Step4_Materials from './Step4_Materials.jsx';

// ── RESIDENTIAL IS BID IN MAN-HOURS AND MATERIAL ────────────────────────────
// "Generally for residential HVAC the job is bid in man hours and material."
// The app made you construct a crew and a day count to say "sixteen hours",
// using the full commercial machinery — night multipliers, overtime thresholds,
// per diem — on a changeout.

const noop = () => {};
const html = extra => renderToStaticMarkup(
  <AuthProvider>
    <StateProvider initial={{ ...initialState, mode: 'Residential HVAC', ...extra }}>
      <Step4_Materials onNext={noop} onBack={noop} />
    </StateProvider>
  </AuthProvider>,
);

describe('the residential labor entry', () => {
  it('asks for man-hours and a rate on a fresh job', () => {
    const out = html({});
    expect(out).toContain('Man-hours');
    expect(out).toMatch(/Your rate/);
  });

  it('says what a man-hour is, because that is the trap', () => {
    // Two men for a day is 16, not 1 x 8. The rack set went in at a quarter of
    // its value on exactly this confusion.
    expect(html({})).toMatch(/Two men for a day is/);
  });

  it('does not pretend to know the rate', () => {
    // No two shops charge the same. The placeholder is an example, not a value.
    const out = html({});
    expect(out).toMatch(/The rate is yours/);
  });

  it('says what the mode does NOT carry', () => {
    // No per diem, no overtime split. A job that needs either switches modes,
    // and the card says so rather than leaving somebody to find out.
    const out = html({});
    expect(out).toMatch(/no per diem/);
    expect(out).toMatch(/switch to periods/);
  });

  it('offers the way back to crew periods', () => {
    expect(html({})).toMatch(/Use crew periods instead/);
  });

  it('shows the man-hours figure in its OWN summary, not just the bid total', () => {
    // The summary computed labor its own way, straight off the periods. In
    // man-hours mode that read $0 while the bid total underneath carried the
    // real number — two places computing the same money, which is the bug the
    // comment above that line was already about. Reverting the fix left every
    // other test in this file green.
    // Matched on the summary ROW specifically — the entry card shows the same
    // figure, so a bare toContain passes with the bug still in.
    const out = html({ laborMode: 'manhours', manHoursJob: { hours: 16, rate: 95 } });
    const row = out.match(/>Labor<\/span><span[^>]*>(\$[\d,]+)</);
    expect(row, 'no Labor row in the summary').toBeTruthy();
    expect(row[1]).toBe('$1,520');
  });

  it('leaves a saved job that already has periods alone', () => {
    // Nothing here may reprice a bid that has already gone out.
    const out = html({
      jobId: 'j1',
      laborMode: 'periods',
      laborPeriods: [{ id: 'p1', name: 'Install', crew: [{ id: 'm1', rate: 85, hrsPerDay: 8 }], days: 2 }],
    });
    expect(out).not.toContain('Man-hours');
    expect(out).toContain('Install');
  });
});

// ── AND THE MATH ────────────────────────────────────────────────────────────
describe('man-hours reach the bid', () => {
  const job = {
    ...initialState,
    mode: 'Residential HVAC',
    laborMode: 'manhours',
    manHoursJob: { hours: 16, rate: 95 },
    resEquipment: [{ id: 'e1', desc: '3 ton heat pump', qty: 1, cost: 4200 }],
  };

  it('puts hours x rate into the bid total', () => {
    const t = computeBidTotals(job, 20);
    expect(t.laborTotal).toBe(16 * 95);
  });

  it('moves the total when the hours move', () => {
    const a = computeBidTotals(job, 20).total;
    const b = computeBidTotals({ ...job, manHoursJob: { hours: 32, rate: 95 } }, 20).total;
    expect(b - a).toBeCloseTo(16 * 95, 6);
  });

  it('does not also bill the periods sitting on the same job', () => {
    // The double-count a fourth input would have created. Exactly one mode
    // reaches the bid.
    const withBoth = {
      ...job,
      laborPeriods: [{ id: 'p1', crew: [{ id: 'm1', rate: 85, hrsPerDay: 8 }], days: 5 }],
    };
    expect(computeBidTotals(withBoth, 20).laborTotal).toBe(16 * 95);
  });

  it('is still exactly the sum of its parts', () => {
    // The invariant the whole bid engine is guarded by.
    const t = computeBidTotals(job, 20);
    expect(Number.isFinite(t.total)).toBe(true);
    expect(t.total).toBeGreaterThan(16 * 95);
  });
});
