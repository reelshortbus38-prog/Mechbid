import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StateProvider } from '../state/StateProvider.jsx';
import { AuthProvider } from '../lib/auth.jsx';
import { initialState } from '../state/store.js';
import Step5_Labor from './Step5_Labor.jsx';
import { LUMP_SUM, TIME_AND_MATERIALS } from './bidMethod.js';

// ── A CHECK THAT WAS BUILT AND NEVER SHOWN ──────────────────────────────────
// bidMethod.test.js covers what crewCoverage decides. This covers the thing
// that was actually wrong with it: it was written, documented and tested, and
// then rendered nowhere, so the estimator was never told. Its own tests all
// passed the entire time.
//
// So these render the real Labor step, on a real job, and look for the words.

const noop = () => {};

const html = state => renderToStaticMarkup(
  <AuthProvider>
    <StateProvider initial={{ ...initialState, ...state }}>
      <Step5_Labor onNext={noop} onBack={noop} />
    </StateProvider>
  </AuthProvider>,
);

// ~190 man-hours of circuit work, give or take — enough that a thin crew reads
// as short and a fat one reads as loose.
const CIRCUITS = Array.from({ length: 8 }, (_, i) => ({
  circuitId: `${i + 1}`, application: 'Med Temp', runLength: 220, riserLength: 20,
  sucHoriz: '1 1/8', cases: 3,
}));

const crewOf = (n, hrsPerDay = 8) =>
  Array.from({ length: n }, (_, i) => ({ id: `m${i}`, role: 'Mechanic', rate: 65, hrsPerDay }));

const job = (crew, days, extra = {}) => ({
  mode: 'Commercial Refrigeration',
  bidMethod: LUMP_SUM,
  circuits: CIRCUITS,
  laborPeriods: [{ id: 'p1', name: 'Install', crew, days }],
  ...extra,
});

describe('the crew coverage card', () => {
  it('tells the estimator when the crews do not cover the takeoff', () => {
    // One man for four days against eight circuits. This is the case worth
    // catching: the bid goes out short and nothing said a word.
    const out = html(job(crewOf(1), 4));
    expect(out).toContain('Crew hours vs takeoff');
    expect(out).toMatch(/leaves nothing for demo, setting cases, rack work or punch/);
  });

  it('says so plainly when the crews are far wider than the work', () => {
    const out = html(job(crewOf(6), 60));
    expect(out).toContain('Crew hours vs takeoff');
    expect(out).toMatch(/worth knowing it is that wide/);
  });

  it('still reports when the two are in a sensible range', () => {
    // Not a warning — but the estimator should be able to see the comparison
    // was made, not wonder whether it ran.
    const out = html(job(crewOf(3), 20));
    expect(out).toContain('Crew hours vs takeoff');
    expect(out).toMatch(/running the circuits accounts for about/);
  });

  it('says nothing on a job with no circuits to compare against', () => {
    expect(html(job(crewOf(3), 20, { circuits: [] }))).not.toContain('Crew hours vs takeoff');
  });

  it('says nothing when no crew has been set up yet', () => {
    expect(html(job([], 0))).not.toContain('Crew hours vs takeoff');
  });

  it('stays out of a time & materials bid', () => {
    // There the periods are the schedule and the per diem — the app says so a
    // few lines above — and holding them against takeoff hours would compare
    // two things that are not being asked to agree.
    const out = html(job(crewOf(1), 4, { bidMethod: TIME_AND_MATERIALS }));
    expect(out).not.toContain('Crew hours vs takeoff');
  });

  it('reads a flat whole-job crew too, not only periods', () => {
    const out = html({
      mode: 'Commercial Refrigeration',
      bidMethod: LUMP_SUM,
      circuits: CIRCUITS,
      laborMode: 'flat',
      laborPeriods: [],
      flatJob: { crew: crewOf(1), weeks: 1, daysPerWeek: 5 },
    });
    expect(out).toContain('Crew hours vs takeoff');
  });
});

// ── THE SCOPE THAT WAS NOT IN THE BID AT ALL ────────────────────────────────
// scopeUnits.test.js covers the arithmetic. This covers the thing that went
// wrong with crewCoverage — built, tested, and rendered nowhere.
describe('the scope-not-in-takeoff card', () => {
  const refrig = extra => html({ mode: 'Commercial Refrigeration', ...extra });

  it('offers the counts even on a job with no circuits typed in yet', () => {
    // Deliberately NOT inside the circuit estimator, which returns null with
    // no circuits. A rack still has to be set and commissioned on a job whose
    // circuits have not been entered, and a card that hides until an unrelated
    // list is filled in is a card nobody finds.
    const out = refrig({ circuits: [] });
    expect(out).toContain('Scope not in the circuit takeoff');
    expect(out).toContain('Walk-in panels');
  });

  it('prices the racks once they are counted', () => {
    const out = refrig({ scopeCounts: { racks: 2, walkInPanels: 0 } });
    expect(out).toMatch(/76 man-hours/);
  });

  it('warns that a unit is still contested', () => {
    expect(refrig({})).toMatch(/in open dispute/);
  });

  it('names both figures for the walk-in panel, not just the one it defaults to', () => {
    const out = refrig({});
    expect(out).toContain('1.5-2 hr');
    expect(out).toContain('0.45 hr');
  });

  it('keeps the rack TIE and the rack SET apart on screen', () => {
    // The double-count this pair invites. perRackTie is per circuit and
    // already in the takeoff; perRackSet is per rack and is not.
    expect(refrig({})).toMatch(/not the same as/i);
  });

  it('sends the crane somewhere real instead of leaving it out', () => {
    // Getting the rack off the truck is not in the 2 hours and is not crew
    // hours at all. Both of those paths already exist in the app.
    expect(refrig({})).toMatch(/Subcontractors or Rentals/);
  });

  it('stays off an HVAC job, which has neither a rack nor a walk-in', () => {
    const out = html({ mode: 'Commercial HVAC', bidMethod: LUMP_SUM });
    expect(out).not.toContain('Scope not in the circuit takeoff');
  });
});
