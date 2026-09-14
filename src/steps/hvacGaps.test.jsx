import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StateProvider } from '../state/StateProvider.jsx';
import { AuthProvider } from '../lib/auth.jsx';
import { initialState } from '../state/store.js';
import StepHVACEquipment from './StepHVACEquipment.jsx';

const noop = () => {};
const html = extra => renderToStaticMarkup(
  <AuthProvider>
    <StateProvider initial={{ ...initialState, mode: 'Commercial HVAC', ...extra }}>
      <StepHVACEquipment onNext={noop} onBack={noop} />
    </StateProvider>
  </AuthProvider>,
);

// Generated duct lines, the shape DuctCalculator emits.
const ductPart = (desc, qty, unitCost) => ({
  id: `d${qty}`, dgen: true, gen: 'duct', desc, qty, unit: 'lb', unitCost, total: qty * unitCost,
});

describe('the duct hangers and sealant allowance', () => {
  const withDuct = {
    hvacParts: [
      ductPart('Galvanized rectangular duct, 24 ga — fabricated', 1000, 4.5),
      ductPart('Spiral round duct, 12" dia', 200, 9),
    ],
  };

  it('is on the screen once there is duct to hang', () => {
    // It was not. Every duct bid this app produced was sheet metal and
    // insulation with nothing to hang it from.
    expect(html(withDuct)).toMatch(/Duct Hangers &amp; Sealant Allowance|Duct Hangers & Sealant Allowance/);
  });

  it('prices off the duct material it found', () => {
    // 1000 x 4.50 + 200 x 9 = 6,300. At 10% that is 630.
    const out = html(withDuct);
    expect(out).toContain('$6,300');
    expect(out).toContain('$630');
  });

  it('stays away from a job with no duct', () => {
    // An empty allowance card on a hydronic-only job is clutter.
    expect(html({ hvacParts: [] })).not.toMatch(/Duct Hangers/);
  });

  it('says what is NOT in it, because that is where the double-count is', () => {
    // Cleats and corners are shop work, already inside the per-pound
    // fabricated price. Dampers are scheduled devices with their own counts.
    const out = html(withDuct);
    expect(out).toMatch(/Cleats, S-slips and corners are NOT in it/);
    expect(out).toMatch(/dampers are not either|Fire and smoke dampers are not/i);
  });

  it('refuses to add an allowance against unpriced duct', () => {
    // A percentage of $0 is $0, and a lot line of $0 reads as handled.
    const out = html({ hvacParts: [ductPart('Galvanized rectangular duct, 24 ga — fabricated', 1000, 0)] });
    expect(out).toMatch(/still at \$0/);
  });

  it('does not count the hydronic allowance as duct material', () => {
    // Both are `dgen` lot lines in the same array. Pulling one into the other
    // is exactly the double-count this app exists to remove.
    const out = html({
      hvacParts: [
        ductPart('Galvanized rectangular duct, 24 ga — fabricated', 1000, 4.5),
        { id: 'h1', dgen: true, gen: 'hydronic', desc: 'Hydronic fittings', qty: 1, unit: 'lot', unitCost: 2400, total: 2400 },
      ],
    });
    expect(out).toContain('$4,500');
    expect(out).toContain('$450');
  });
});

// ── AND THE LABOR, WHICH DID NOT EXIST ──────────────────────────────────────
// A full HVAC takeoff produced a materials bid and not one labor hour. These
// render the real Labor step, because "it has tests" was true of the hydronic
// sizing engine the whole time it was unreachable.
import Step5_Labor from './Step5_Labor.jsx';

const labor = extra => renderToStaticMarkup(
  <AuthProvider>
    <StateProvider initial={{ ...initialState, mode: 'Commercial HVAC', ...extra }}>
      <Step5_Labor onNext={noop} onBack={noop} />
    </StateProvider>
  </AuthProvider>,
);

const RTUS = {
  hvacEquipment: [
    { id: 'e1', tag: 'RTU-1', type: 'RTU', tons: 5, qty: 1 },
    { id: 'e2', tag: 'RTU-2', type: 'RTU', tons: 10, qty: 1 },
  ],
};

describe('the HVAC labor estimator', () => {
  it('is on the screen at all', () => {
    // It was not. Every hour on an HVAC job was hand-typed as crew days.
    expect(labor(RTUS)).toMatch(/HVAC Labor Estimator/);
  });

  it('derives a line per unit off the schedule', () => {
    const out = labor(RTUS);
    expect(out).toContain('Set RTU-1');
    expect(out).toContain('Set RTU-2');
  });

  it('gives startup its own line, never folded into the set', () => {
    // The one thing every published source agreed on.
    expect(labor(RTUS)).toMatch(/Startup &amp; check|Startup & check/);
  });

  it('warns in plain words that nobody in the trade has read the numbers', () => {
    // These came off the web. Every other figure in this app came from a
    // working mechanic or an estimator, and the difference has to be visible.
    const out = labor(RTUS);
    expect(out).toMatch(/Nobody who bids or installs HVAC has looked at any of these/);
  });

  it('says the crane and test &amp; balance are NOT in the hours', () => {
    // Both are bought in. Inventing man-hours for work the shop subcontracts
    // would put a number in a bid nobody has quoted.
    const out = labor(RTUS);
    expect(out).toMatch(/Subcontractors or Rentals/);
    expect(out).toMatch(/balancing contractor/);
  });

  it('flags a unit the straight-line model reads low on', () => {
    const out = labor({ hvacEquipment: [{ id: 'e1', tag: 'RTU-9', type: 'RTU', tons: 40, qty: 1 }] });
    expect(out).toMatch(/over 25 tons/);
    expect(out).toMatch(/reads LOW/);
  });

  it('stays silent on a job with no HVAC equipment or duct', () => {
    expect(labor({ hvacEquipment: [] })).not.toMatch(/HVAC Labor Estimator/);
  });

  it('stays off a refrigeration job entirely', () => {
    const out = renderToStaticMarkup(
      <AuthProvider>
        <StateProvider initial={{ ...initialState, mode: 'Commercial Refrigeration' }}>
          <Step5_Labor onNext={noop} onBack={noop} />
        </StateProvider>
      </AuthProvider>,
    );
    expect(out).not.toMatch(/HVAC Labor Estimator/);
  });

  it('counts duct by the pound off the takeoff', () => {
    const out = labor({
      hvacParts: [ductPart('Galvanized rectangular duct, 24 ga — fabricated', 2000, 4.5)],
    });
    expect(out).toMatch(/Hang and connect ductwork/);
    expect(out).toContain('2,000 lb');
  });
});
