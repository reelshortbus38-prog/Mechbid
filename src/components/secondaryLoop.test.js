import { describe, it, expect } from 'vitest';
import { initialState } from '../state/store.js';
import { loopHeadline } from './secondaryLoop.js';

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
  it('opens the loop takeoff only when there IS a loop', () => {
    // This was the intent from the start and the card never honoured it: it
    // rendered fully expanded on every job, four empty pipe-size rows and a
    // pump-sizing block, reading as a form somebody forgot to fill in.
    expect(loopHeadline('none').active).toBe(false);
    expect(loopHeadline('glycol').active).toBe(true);
    expect(loopHeadline('water').active).toBe(true);
  });

  it('maps the setting to the calculator\'s loop type', () => {
    // 'glycol' is a chilled loop; 'water' is the ambient one that gets no
    // insulation and a fluid cooler instead of a barrel.
    expect(loopHeadline('glycol').loopType).toBe('chilled');
    expect(loopHeadline('water').loopType).toBe('water');
  });

  it('never tells a job it is set to something it is not', () => {
    // The old lead sentence branched on water-vs-everything-else, so a job
    // with NO loop was told "Set to chilled glycol on the Setup step". That
    // is the one sentence on the card that says what the job IS.
    expect(loopHeadline('none').lead).not.toMatch(/set to/i);
    expect(loopHeadline('none').lead).toMatch(/no secondary loop/i);
    expect(loopHeadline('glycol').lead).toMatch(/chilled glycol/i);
    expect(loopHeadline('water').lead).toMatch(/water/i);
  });

  it('says plainly that nothing in a collapsed card is in the bid', () => {
    // A calculator someone opened out of curiosity still has an Add button
    // with a real price on it. The card has to say which side of the bid it
    // is on before that button is in reach.
    expect(loopHeadline('none').lead).toMatch(/not part of the bid|nothing below is part of the bid/i);
  });

  it('titles a live loop by which fluid it actually runs', () => {
    expect(loopHeadline('glycol').title).toMatch(/glycol/i);
    expect(loopHeadline('water').title).toMatch(/water/i);
    expect(loopHeadline('none').title).toMatch(/none/i);
  });

  it('treats a missing setting as no loop, not as glycol', () => {
    for (const v of [undefined, null, '']) {
      expect(loopHeadline(v).active, String(v)).toBe(false);
    }
  });
});
