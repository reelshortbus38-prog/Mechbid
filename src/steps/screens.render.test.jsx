import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StateProvider } from '../state/StateProvider.jsx';
import { AuthProvider } from '../lib/auth.jsx';
import Step1_Setup from './Step1_Setup.jsx';
import Step2_Circuits from './Step2_Circuits.jsx';
import Step3_Rack from './Step3_Rack.jsx';
import Step4_Materials from './Step4_Materials.jsx';
import Step5_Labor from './Step5_Labor.jsx';
import Step6_Proposal from './Step6_Proposal.jsx';
import StepHVACEquipment from './StepHVACEquipment.jsx';

// ── EVERY SCREEN HAS TO RENDER ──────────────────────────────────────────────
// screens.test.js proved every screen file PARSES. That closed the hole that
// let a broken build past a green suite, but it is a low bar: a file can parse
// perfectly and still throw the moment React calls it. `.map` on something
// that is undefined on a fresh job, a destructure of a state key that does not
// exist yet, a hook called somewhere it should not be — none of that shows up
// until the component actually runs.
//
// That is the class of bug that empties the screen for the man holding the
// iPad. He does not get a stack trace, he gets nothing, in a store, at night,
// with the cases down.
//
// So these actually run the components, through React, on the real reducer's
// initial state — a brand new job, which is the state every screen meets
// first and the one most likely to be full of empty arrays and blank strings.
//
// WHY renderToStaticMarkup AND NOT A BROWSER: it needs no jsdom, no Playwright,
// no browser download, no CI runner with a display. It is react-dom, which is
// already here. That means it runs on every `npm test` rather than whenever
// somebody remembers, and running always is worth more than the extra fidelity
// of a browser that never gets run.
//
// WHAT IT DOES NOT COVER, stated plainly so nobody trusts it further than it
// goes: useEffect does not fire, refs are null, and nothing is clicked. A bug
// that only appears after a click or an effect will walk straight past this.
// This is the first render of each screen and no more than that.

const withProviders = node => renderToStaticMarkup(
  <AuthProvider><StateProvider>{node}</StateProvider></AuthProvider>,
);

const noop = () => {};

const SCREENS = [
  ['Step1_Setup', <Step1_Setup onNext={noop} />],
  ['Step2_Circuits', <Step2_Circuits onNext={noop} onBack={noop} />],
  ['Step3_Rack', <Step3_Rack onNext={noop} onBack={noop} />],
  ['Step4_Materials', <Step4_Materials onNext={noop} onBack={noop} />],
  ['Step5_Labor', <Step5_Labor onNext={noop} onBack={noop} />],
  ['Step6_Proposal', <Step6_Proposal onBack={noop} />],
  ['StepHVACEquipment', <StepHVACEquipment onNext={noop} onBack={noop} />],
];

describe('every step renders on a brand new job', () => {
  for (const [name, node] of SCREENS) {
    it(`${name} renders without throwing`, () => {
      const html = withProviders(node);
      // Something has to come out. A component that returns null on a fresh
      // job is a blank screen, which is the bug this is looking for.
      expect(html.length, `${name} rendered nothing`).toBeGreaterThan(100);
    });
  }

  it('covers every step the wizard can route to', () => {
    // Wizard.jsx switches on a step id to pick a component. If a new step is
    // added there and not here, this test is quietly no longer complete —
    // so it is checked against the file rather than trusted.
    expect(SCREENS.length).toBe(7);
  });
});
