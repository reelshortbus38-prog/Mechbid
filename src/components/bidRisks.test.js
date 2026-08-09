import { describe, it, expect } from 'vitest';
import { classifyBidRisk, collectBidRisks, riskToExclusion } from './bidRisks.js';

// Pinned against the ACTUAL flag wording the analyzers produced on live sets.
// A missed "vendor package" or "Add Alt" is a five-figure error in the bid, so
// these strings are the regression surface that matters.

describe('classifyBidRisk — real flag text from live sets', () => {
  it('catches furnished-by-others in all the wordings that showed up', () => {
    expect(classifyBidRisk("MAU-01, MAU-02, Paint Booth exhaust fan, and Weld Room exhaust fan called out as 'VENDOR PACKAGE' equipment - verify furnished-by responsibility and scope of contractor installation/connection only.").key).toBe('furnished');
    expect(classifyBidRisk('Owner Furnished / Contractor Installed equipment — receiving and rigging by contractor').key).toBe('furnished');
    expect(classifyBidRisk('Rooftop units are OFCI per Section 23 05 00').key).toBe('furnished');
    expect(classifyBidRisk('Curbs furnished by others').key).toBe('furnished');
    expect(classifyBidRisk('Kitchen hoods N.I.C.').key).toBe('furnished');
  });

  it('catches alternates — the ones that must NOT be in the base bid', () => {
    expect(classifyBidRisk('Mini split ACU/CU pairs (ACU-A-01/CU-A-01, etc.) are listed under Add Alt #3 per schedule note 7 - confirm inclusion in base bid pricing.').key).toBe('alternate');
    expect(classifyBidRisk('Mini Split System Air Conditioning Schedule (11 pairs, all under Add Alt #3)').key).toBe('alternate');
    expect(classifyBidRisk('See Alternate 2 for the gym RTU').key).toBe('alternate');
    expect(classifyBidRisk('Deductive alternate: omit VAV reheat coils').key).toBe('alternate');
  });

  it('catches allowances, trade splits, and incomplete drawing sets', () => {
    expect(classifyBidRisk('Include a $10,000 allowance for controls integration').key).toBe('allowance');
    expect(classifyBidRisk('Section 230900 provides 24V control power to VAV units only; no line voltage power by controls contractor.').key).toBe('byTrade');
    expect(classifyBidRisk('Motorized damper provided by Div 233300, actuator by 230900').key).toBe('byTrade');
    expect(classifyBidRisk('marked as progress/not-for-construction').key).toBe('incomplete');
    expect(classifyBidRisk('VAV schedule table is cut off/truncated in source text after VAV-M235A rows').key).toBe('incomplete');
    expect(classifyBidRisk('Schedule text is OCR-derived and partially garbled; some values may need field verification.').key).toBe('incomplete');
  });

  it('leaves ordinary informational notes alone', () => {
    expect(classifyBidRisk('General note 1: Provide bird screen, roof curb, hinged curb cap, baked enamel finish')).toBeNull();
    expect(classifyBidRisk('Approved manufacturers for roof hoods: Cook, Pennbarry')).toBeNull();
    expect(classifyBidRisk('FOR ALL EXTERIOR WALL/ROOF PENETRATIONS, COORDINATE WITH ARCHITECTURAL DRAWINGS.')).toBeNull();
    expect(classifyBidRisk('')).toBeNull();
    expect(classifyBidRisk(null)).toBeNull();
  });
});

describe('collectBidRisks', () => {
  it('groups by category in cost order and keeps the source document', () => {
    const flags = [
      { type: 'info', text: 'Provide bird screen and curb cap', source: 'M5.02.pdf' },
      { type: 'warn', text: "MAU-01 called out as 'VENDOR PACKAGE' equipment", source: 'Drawings 8.pdf' },
      { type: 'warn', text: 'Mini splits listed under Add Alt #3', source: 'Drawings 5.pdf' },
      { type: 'info', text: 'Sheet marked progress/not-for-construction', source: 'Drawings 5.pdf' },
    ];
    const risks = collectBidRisks(flags);
    expect(risks.map(r => r.key)).toEqual(['furnished', 'alternate', 'incomplete']);
    expect(risks[0].items[0].source).toBe('Drawings 8.pdf');
    expect(risks.every(r => r.why && r.label)).toBe(true);
  });

  it('shows a repeated note once — a set repeats the same warning per sheet', () => {
    const same = "MAU-01 called out as 'VENDOR PACKAGE' equipment";
    const risks = collectBidRisks([
      { text: same, source: 'p1' }, { text: same, source: 'p2' }, { text: same, source: 'p3' },
    ]);
    expect(risks).toHaveLength(1);
    expect(risks[0].items).toHaveLength(1);
  });

  it('accepts bare strings and returns nothing for a clean job', () => {
    expect(collectBidRisks(['Owner furnished RTUs'])[0].key).toBe('furnished');
    expect(collectBidRisks([])).toEqual([]);
    expect(collectBidRisks([{ text: 'Provide flex connections' }])).toEqual([]);
  });
});

describe('riskToExclusion', () => {
  it('produces a printable qualification line for every category', () => {
    for (const key of ['furnished', 'alternate', 'allowance', 'byTrade', 'incomplete']) {
      expect(riskToExclusion(key).length).toBeGreaterThan(20);
    }
    expect(riskToExclusion('nope')).toBe('');
  });
});
