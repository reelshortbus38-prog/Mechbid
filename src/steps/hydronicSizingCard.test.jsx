import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StateProvider } from '../state/StateProvider.jsx';
import { AuthProvider } from '../lib/auth.jsx';
import { initialState } from '../state/store.js';
import StepHVACEquipment from './StepHVACEquipment.jsx';

// ── THE MODULE THAT WAS WIRED TO NOTHING ────────────────────────────────────
// hydronicSizing.js is a complete Hazen-Williams sizing engine, checked against
// a real engineering schedule, with 79 tests. Nothing in the app imported it.
// hydronicValveLines had accepted a pre-sized `terminalMix` since it was
// written and had never once been passed one, so every hydronic job fell
// through to a single hand-picked size applied to every terminal.
//
// These render the real step, because "it has tests" was true of the sizing
// engine the entire time it was unreachable.

const noop = () => {};

const html = extra => renderToStaticMarkup(
  <AuthProvider>
    <StateProvider initial={{ ...initialState, mode: 'Commercial HVAC', ...extra }}>
      <StepHVACEquipment onNext={noop} onBack={noop} />
    </StateProvider>
  </AuthProvider>,
);

// The card only appears once there is hydronic pipe or a terminal to connect.
const HYDRONIC = {
  hvacEquipment: [
    { id: 'e1', tag: 'FCU-1', type: 'Fan Coil Unit', qty: 1 },
    { id: 'e2', tag: 'FCU-2', type: 'Fan Coil Unit', qty: 1 },
  ],
};

describe('the sized mix actually reaches the priced lines', () => {
  // The test that was missing. Removing the one line that passes `terminalMix`
  // into hydronicValveLines left every other test in this repo green — which
  // is the exact failure this whole module is an instance of.
  const sized = { ...HYDRONIC, hydronicFlows: '8 @ 2, 6 @ 9' };

  it('prices a hose kit per SIZE, not one size for the job', () => {
    const out = html(sized);
    // Two distinct sizes in the mix means two hose kit lines. The rendered
    // markup escapes the inch mark, so stop before it.
    expect(out).toContain('Hose kit, 3/4');
    expect(out).toContain('Hose kit, 1-1/4');
  });

  it('reads the schedule back so the estimator can check it', () => {
    const out = html(sized);
    expect(out).toMatch(/14 terminals/);   // the count it read
    expect(out).toContain('8 × 3/4');      // and the mix it sized them into
    expect(out).toContain('6 × 1-1/4');
  });

  it('says what one hand-picked size would have cost instead', () => {
    // The argument for doing any of this. A hose kit roughly doubles every
    // size and a half.
    expect(html(sized)).toMatch(/against/);
  });

  it('keeps the typed schedule across a reload, because it came off a drawing', () => {
    // It lived in useState, where it died on every reload and had to be read
    // off the plans again.
    expect(html(sized)).toMatch(/8 @ 2, 6 @ 9/);
  });

  it('flags flows past the end of the table instead of sizing them anyway', () => {
    // The table tops out at 8" / ~1150 GPM. Past that, sizeForFlow returns
    // null rather than handing back the largest size, which would be a lie.
    const out = html({ ...HYDRONIC, hydronicFlows: '4 @ 5000' });
    expect(out).toMatch(/past the end of the table/);
  });
});

describe('the hydronic terminal sizing input', () => {
  it('is on the screen at all', () => {
    // The whole finding. It was not.
    const out = html(HYDRONIC);
    expect(out).toMatch(/Terminal flows from the schedule/);
  });

  it('says which number comes first, because getting it backwards is silent', () => {
    // "8 @ 2" read as two terminals of 8 GPM sizes a job wrong rather than
    // failing, so the card states the order rather than relying on a habit.
    const out = html(HYDRONIC);
    expect(out).toMatch(/count first/i);
    expect(out).toMatch(/eight terminals at 2 GPM each/);
  });

  it('says what happens if it is left blank', () => {
    // A job with no schedule in hand must not look broken.
    expect(html(HYDRONIC)).toMatch(/Leave blank to use the single size above/);
  });

  it('renders without a schedule, exactly as it did before any of this', () => {
    const out = html(HYDRONIC);
    expect(out.length).toBeGreaterThan(100);
    // No mix, so no sized readout claiming anything.
    expect(out).not.toMatch(/past the end of the table/);
  });

  it('still renders on a job with no hydronic work at all', () => {
    const out = html({ hvacEquipment: [{ id: 'e1', tag: 'RTU-1', type: 'RTU', tons: 5, qty: 1 }] });
    expect(out.length).toBeGreaterThan(100);
  });
});
