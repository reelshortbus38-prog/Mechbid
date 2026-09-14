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
