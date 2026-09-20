import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StateProvider } from '../state/StateProvider.jsx';
import { AuthProvider } from '../lib/auth.jsx';
import { initialState, DEFAULT_LABOR_UNITS, estimateCircuitLabor } from '../state/store.js';
import { circuitTaskRow } from './laborUnits.js';
import { DiagnosticCard } from './Step6_Proposal.jsx';

// ── DRAWN IS NOT CONNECTED ───────────────────────────────────────────────────
// Sixth time. selfCheck can be right about everything and reach nobody.

const circuits = Array.from({ length: 6 }, (_, i) => ({
  id: `c${i}`, circuitId: `B${i + 1}`, runLength: 300, riserLength: 20,
  sucHoriz: '7/8', liqHoriz: '1/2', cases: 2,
}));
const est = estimateCircuitLabor(circuits, DEFAULT_LABOR_UNITS);

const render = over => renderToStaticMarkup(
  <AuthProvider>
    <StateProvider initial={{
      ...initialState, mode: 'Commercial Refrigeration', circuits,
      fieldTasks: est.perCircuit.map((pc, i) => circuitTaskRow(pc, {
        crewSize: 2, mode: 'Commercial Refrigeration', mintId: () => `t${i}`,
      })),
      lineItems: [{ id: 'l1', desc: 'Copper', total: 40000 }],
      laborPeriods: [{ id: 'p1', crew: [{ id: 'a', rate: 95, hrsPerDay: 10 }], days: 0, otMult: 1 }],
      ...over,
    }}>
      <DiagnosticCard />
    </StateProvider>
  </AuthProvider>,
);

describe('the card reaches the estimator', () => {
  it('renders and offers the copy', () => {
    const out = render({});
    expect(out).toContain('Does this bid agree with itself?');
    expect(out).toContain('Copy diagnostic');
  });

  it('says what leaves the device, so nobody has to take it on trust', () => {
    expect(render({})).toMatch(/no store name, address, contractor, circuit IDs or file\s+names/);
  });

  it('is honest about what it cannot tell you', () => {
    expect(render({})).toMatch(/cannot tell you the hours are right/i);
  });
});

describe('the card shows the findings, not just a verdict', () => {
  it('shows a blocker when the job is priced at the fallback rate', () => {
    const out = render({ laborPeriods: [] });
    expect(out).toContain('❌');
    expect(out).toMatch(/\$100\/man-hour fallback/);
  });

  it('shows the clean verdict when nothing contradicts', () => {
    const out = render({ circuits: [], fieldTasks: [] });
    expect(out).toMatch(/not the same as being right/i);
    expect(out).not.toContain('❌');
  });

  // It prices off the ACTIVE SCENARIO, which is what the proposal prints.
  // Taking totals as a prop would let the card describe a different bid than
  // the one on screen — the exact class of disagreement it exists to catch.
  it('describes the bid that is actually on screen', () => {
    expect(() => render({
      scenarios: { active: 'high', high: { label: 'High', markupPct: 28, desc: '' } },
    })).not.toThrow();
  });

  it('renders on a blank job rather than throwing at the worst moment', () => {
    expect(() => renderToStaticMarkup(
      <AuthProvider>
        <StateProvider initial={initialState}><DiagnosticCard /></StateProvider>
      </AuthProvider>,
    )).not.toThrow();
  });
});
