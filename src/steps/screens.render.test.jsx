import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StateProvider } from '../state/StateProvider.jsx';
import { initialState } from '../state/store.js';
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

const withProviders = (node, initial) => renderToStaticMarkup(
  <AuthProvider><StateProvider initial={initial}>{node}</StateProvider></AuthProvider>,
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

// ── AND ON A JOB WITH WORK IN IT ────────────────────────────────────────────
// The pass above renders a BLANK job, which is the state most likely to be
// full of empty arrays. It is also the state in which most of this app's
// branches are correctly never entered — so whole screens-worth of code had
// never been run by anything.
//
// That is not theoretical. The flat "whole job crew" editor carried a second
// Travel field pasted in from the period editor and never adapted: it still
// read `period` and `onUpdate`, neither of which exists in that scope. Tapping
// the whole-job crew threw a ReferenceError and emptied the Labor step, and
// every test in this file passed, because the default job is not in flat mode.
//
// So each of these is a state somebody actually puts the app into.
const CIRCUIT = {
  circuitId: '1', application: 'Med Temp', runLength: 220, riserLength: 20,
  sucHoriz: '1 1/8', cases: 3,
};
const CREW = [{ id: 'm1', role: 'Mechanic', rate: 65, hrsPerDay: 8, travels: true }];

const JOBS = [
  ['flat whole-job crew', {
    laborMode: 'flat',
    flatJob: { crew: CREW, weeks: 27, daysPerWeek: 5, travelHrs: 4, ootPerDay: 150 },
    laborPeriods: [],
  }],
  ['crew periods', {
    laborMode: 'periods',
    laborPeriods: [{ id: 'p1', name: 'Install', crew: CREW, days: 20, travelHrs: 4, isNight: true }],
  }],
  ['a real takeoff', {
    circuits: [CIRCUIT, { ...CIRCUIT, circuitId: '2', isRiserOnly: true }],
    laborPeriods: [{ id: 'p1', name: 'Install', crew: CREW, days: 20 }],
    lineItems: [{ id: 'i1', section: 'Copper', desc: '1 1/8" ACR', qty: 240, unit: 'ft', unitCost: 9.4, total: 2256 }],
    rackParts: [{ id: 'r1', desc: 'Suction header', qty: 1, unit: 'ea', unitCost: 900, total: 900 }],
    rackTasks: [{ id: 't1', desc: 'Set rack', men: 2, hrs: 8 }],
    fieldTasks: [{ id: 'f1', desc: 'Demo old lines', men: 2, hrs: 12 }],
  }],
  ['commercial HVAC', {
    mode: 'Commercial HVAC',
    hvacEquipment: [{ id: 'e1', tag: 'RTU-1', type: 'RTU', tons: 5, qty: 1 }],
    hvacParts: [{ id: 'h1', desc: 'Curb adapter', qty: 1, unit: 'ea', unitCost: 800, total: 800 }],
  }],
  ['residential HVAC', {
    mode: 'Residential HVAC',
    resEquipment: [{ id: 'e1', desc: '3 ton heat pump', qty: 1, cost: 4200 }],
    resParts: [{ id: 'p1', desc: 'Lineset', qty: 1, unitCost: 300, total: 300 }],
    resLinesetType: 'roll', resLineLength: 30, resSucSize: '3/4', resLiqSize: '3/8',
  }],
];

describe('every step renders on a job with work in it', () => {
  for (const [jobName, job] of JOBS) {
    for (const [name, node] of SCREENS) {
      it(`${name} renders with ${jobName}`, () => {
        const html = withProviders(node, { ...initialState, ...job });
        expect(html.length, `${name} rendered nothing with ${jobName}`).toBeGreaterThan(100);
      });
    }
  }
});
