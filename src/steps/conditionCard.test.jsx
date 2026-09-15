import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StateProvider } from '../state/StateProvider.jsx';
import { AuthProvider } from '../lib/auth.jsx';
import { initialState, estimateCircuitLabor, DEFAULT_LABOR_UNITS } from '../state/store.js';
import Step5Labor, { takeoffManHours } from './Step5_Labor.jsx';
import { conditionAdjustment } from './conditionFactor.js';

// ── DRAWN IS NOT CONNECTED ───────────────────────────────────────────────────
// Three times in this repo a test proved a number was on screen and proved
// nothing about whether the code that produces it runs. So these assert the
// ARITHMETIC that appears — the adjusted figure and the struck-through base —
// and would fail if the factor were computed and then ignored.

const noop = () => {};

const CIRCUITS = [
  { circuitId: 'A1', application: 'MT Cases', runLength: 400, riserLength: 0, sucHoriz: '1 1/8', cases: 2 },
  { circuitId: 'A2', application: 'LT Cases', runLength: 220, riserLength: 12, sucHoriz: '7/8', cases: 3 },
];

const html = extra => renderToStaticMarkup(
  <AuthProvider>
    <StateProvider initial={{
      ...initialState, mode: 'Commercial Refrigeration', circuits: CIRCUITS, ...extra,
    }}>
      <Step5Labor onNext={noop} onBack={noop} />
    </StateProvider>
  </AuthProvider>,
);

const BASE = estimateCircuitLabor(CIRCUITS, DEFAULT_LABOR_UNITS).totalHours;

describe('the estimator card with no conditions set', () => {
  const out = html({});

  it('shows the unit hours untouched', () => {
    expect(out).toContain(`${BASE} man-hours`);
  });

  it('says there is no adjustment, and why', () => {
    expect(out).toMatch(/no adjustment/i);
    expect(out).toMatch(/has not been told what conditions your labor units describe/i);
  });

  it('does not strike anything through — there is no before and after', () => {
    expect(out).not.toContain('line-through');
  });
});

describe('the factor reaches the number on the card', () => {
  // Units off a closed remodel, bidding a live store, 25% against 10%.
  const SET = {
    unitsBasis: 'closed', jobConditions: 'live', conditionPct: { new: 0, closed: 10, live: 25 },
  };
  const expected = conditionAdjustment({
    hours: BASE, jobConditions: 'live', unitsBasis: 'closed', pct: SET.conditionPct,
  });
  const out = html(SET);

  it('the adjusted hours are the ones shown', () => {
    expect(expected.adjustedHours).not.toBe(BASE);
    expect(out).toContain(`${expected.adjustedHours} man-hours`);
  });

  it('the unadjusted figure is shown too, struck through, so the move is visible', () => {
    expect(out).toContain('line-through');
    expect(out).toContain(`${BASE}`);
  });

  it('prices only the difference — NOT the live-store factor outright', () => {
    // 1.25/1.10, not 1.25. If this ever reads 1.250 the app has gone back to
    // charging the closed-store slowdown a second time.
    expect(out).toContain(`×${expected.multiplier.toFixed(3)}`);
    expect(out).not.toContain('×1.250');
    expect(expected.multiplier).toBeLessThan(1.25);
  });

  it('names both conditions on screen', () => {
    expect(out).toMatch(/closed remodel/i);
    expect(out).toMatch(/live store/i);
  });
});

describe('same conditions as the units', () => {
  const out = html({
    unitsBasis: 'live', jobConditions: 'live', conditionPct: { new: 0, closed: 10, live: 25 },
  });

  it('adds nothing, however large the factor', () => {
    expect(out).toContain(`${BASE} man-hours`);
    expect(out).not.toContain('line-through');
  });

  it('says the conditions are already inside the units', () => {
    expect(out).toMatch(/already inside the units/i);
  });
});

// ── THE TWO READERS OF THE TAKEOFF HAVE TO AGREE ─────────────────────────────
// The crew-coverage check holds the crew against takeoff hours. If it read the
// unadjusted figure while the generated tasks carried the adjusted one, it
// would report a shortfall that is only two call sites disagreeing.
describe('takeoffManHours is what the bid carries', () => {
  it('matches the card when a factor applies', () => {
    const state = {
      ...initialState, circuits: CIRCUITS,
      unitsBasis: 'closed', jobConditions: 'live', conditionPct: { new: 0, closed: 10, live: 25 },
    };
    const expected = conditionAdjustment({
      hours: BASE, jobConditions: 'live', unitsBasis: 'closed', pct: state.conditionPct,
    });
    expect(takeoffManHours(state)).toBe(expected.adjustedHours);
    expect(takeoffManHours(state)).toBeGreaterThan(BASE);
  });

  it('is the raw takeoff when nothing is set', () => {
    expect(takeoffManHours({ ...initialState, circuits: CIRCUITS })).toBe(BASE);
  });

  it('is zero with no circuits, not NaN', () => {
    expect(takeoffManHours({ ...initialState, circuits: [] })).toBe(0);
    expect(takeoffManHours({})).toBe(0);
  });
});
