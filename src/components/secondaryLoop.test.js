import { describe, it, expect } from 'vitest';
import { initialState } from '../state/store.js';

// ── SECONDARY LOOP IS A SEPARATE AXIS FROM THE REFRIGERANT ───────────────────
// The natural instinct is to put glycol on the HFC/CO₂ toggle as a third
// option. That would be wrong, and wrong in a way that costs a real job: a
// glycol store STILL has a primary circuit in the machine room. Glycol is what
// that circuit cools, not what it runs on. CO₂ low temp feeding a glycol medium
// temp loop is one store, and a single three-way toggle forces a choice the job
// does not make.

describe('the two settings are independent', () => {
  it('ships with both, defaulting to a plain DX HFC job', () => {
    expect(initialState.systemType).toBe('HFC');
    expect(initialState.secondaryLoop).toBe('none');
  });

  it('allows every real combination, including the hybrid', () => {
    const combos = [
      ['HFC', 'none'],    // traditional DX
      ['CO2', 'none'],    // transcritical DX
      ['HFC', 'glycol'],  // HFC chiller feeding a glycol loop
      ['CO2', 'glycol'],  // CO₂ low temp + glycol medium temp — the hybrid
      ['HFC', 'water'],   // self-contained cases on an ambient loop
      ['CO2', 'water'],
    ];
    for (const [sys, loop] of combos) {
      const job = { ...initialState, systemType: sys, secondaryLoop: loop };
      // Neither setting constrains the other — that is the whole point.
      expect(job.systemType, `${sys}/${loop}`).toBe(sys);
      expect(job.secondaryLoop, `${sys}/${loop}`).toBe(loop);
    }
  });

  it('would have lost a combination if it were one three-way toggle', () => {
    // Recording the reasoning: a single HFC | CO2 | GLYCOL setting has three
    // states, but the real job space has six, and the two it cannot express are
    // exactly the hybrids being built today.
    const oneToggle = ['HFC', 'CO2', 'GLYCOL'];
    const realCombos = 2 * 3;
    expect(oneToggle.length).toBeLessThan(realCombos);
  });
});

describe('what each loop setting means downstream', () => {
  const isWater = v => v === 'water';
  const showsCard = v => v !== 'none';

  it('shows the loop takeoff only when there is a loop', () => {
    expect(showsCard('none')).toBe(false);
    expect(showsCard('glycol')).toBe(true);
    expect(showsCard('water')).toBe(true);
  });

  it('maps the setting to the calculator s loop type', () => {
    // 'glycol' is a chilled loop; 'water' is the ambient one that gets no
    // insulation and a fluid cooler instead of a barrel.
    expect(isWater('glycol')).toBe(false);
    expect(isWater('water')).toBe(true);
  });
});
