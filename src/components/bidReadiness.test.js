import { describe, it, expect } from 'vitest';
import { checkBidReadiness } from './bidReadiness.js';

// The catastrophic case this exists to prevent, taken from a live run: a
// two-school mechanical package imported 95 units, every one at $0, and the
// app would have printed that bid without a word.

const okTotals = { laborTotal: 50000, markupBase: 10000, markupAmt: 2000 };

describe('checkBidReadiness — blockers', () => {
  it('catches equipment imported with no cost (the $0 bid)', () => {
    const state = {
      mode: 'Commercial HVAC',
      projName: 'GT-400 Expansion',
      hvacEquipment: [{ tag: 'RTU-01', cost: 0 }, { tag: 'RTU-02', cost: 0 }, { tag: 'MAU-01', cost: 12000 }],
      hvacParts: [],
    };
    const { blockers, ready } = checkBidReadiness(state, okTotals);
    expect(ready).toBe(false);
    const eq = blockers.find(b => b.key === 'unpricedEquipment');
    expect(eq.count).toBe(2);
    expect(eq.title).toContain('2 of 3');
    expect(eq.detail).toContain('RTU-01');       // names the offenders
  });

  it('catches duct lines with no footage — free ductwork in the bid', () => {
    const state = {
      mode: 'Commercial HVAC',
      projName: 'X',
      hvacEquipment: [{ tag: 'RTU-1', cost: 9000 }],
      hvacParts: [
        { desc: 'Ductwork — 20x16 duct (supply)', qty: 0, unitCost: 0, total: 0 },
        { desc: 'Ductwork — 14x14 duct (return)', qty: 0, unitCost: 0, total: 0 },
        { desc: 'Ductwork — 22x16 duct (supply)', qty: 40, unitCost: 0, total: 0 }, // has footage — fine
      ],
    };
    const { blockers } = checkBidReadiness(state, okTotals);
    expect(blockers.find(b => b.key === 'ductNoFootage').count).toBe(2);
    // A duct line at $0/ft is NOT an unpriced-part blocker — the purchase-unit
    // conversion prices duct, not the footage line.
    expect(blockers.find(b => b.key === 'unpricedParts')).toBeUndefined();
  });

  it('catches counted material with no price, and requires labor', () => {
    const state = {
      mode: 'Commercial HVAC', projName: 'X',
      hvacEquipment: [{ cost: 100 }],
      hvacParts: [
        { desc: 'VAV Box · 6Ø · Nailor 3001', qty: 26, unitCost: 0, total: 0 },
        { desc: 'Curb adapter', qty: 2, unitCost: 450, total: 900 },
      ],
    };
    const noLabor = checkBidReadiness(state, { laborTotal: 0, markupBase: 900, markupAmt: 180 });
    expect(noLabor.blockers.find(b => b.key === 'unpricedParts').count).toBe(1);
    expect(noLabor.blockers.find(b => b.key === 'noLabor')).toBeTruthy();
    // Rack/field labor counts as labor too (refrigeration jobs bid that way).
    const rackOnly = checkBidReadiness(state, { laborTotal: 0, rackLaborTotal: 8000, markupBase: 900, markupAmt: 180 });
    expect(rackOnly.blockers.find(b => b.key === 'noLabor')).toBeUndefined();
  });
});

describe('checkBidReadiness — warnings vs blockers', () => {
  const priced = {
    mode: 'Commercial HVAC', projName: 'Job',
    hvacEquipment: [{ tag: 'RTU-1', cost: 9000 }],
    hvacParts: [{ desc: 'Curb adapter', qty: 1, unitCost: 450, total: 450 }],
  };

  it('zero markup warns but does not block — cost-plus jobs are real', () => {
    const r = checkBidReadiness(priced, { laborTotal: 5000, markupBase: 9450, markupAmt: 0 });
    expect(r.ready).toBe(true);
    expect(r.warnings.map(w => w.key)).toContain('noMarkup');
  });

  it('missing project name warns only', () => {
    const r = checkBidReadiness({ ...priced, projName: '' }, okTotals);
    expect(r.ready).toBe(true);
    expect(r.warnings.map(w => w.key)).toContain('noProjectName');
  });

  it('a fully priced job is ready with nothing to report', () => {
    const r = checkBidReadiness(priced, okTotals);
    expect(r.ready).toBe(true);
    expect(r.issues).toEqual([]);
  });
});

describe('checkBidReadiness — mode awareness', () => {
  it('refrigeration checks materials and contractor-supplied rack parts', () => {
    const state = {
      mode: 'Commercial Refrigeration', projName: 'Store 47',
      lineItems: [{ desc: '7/8 copper', qty: 200, unitCost: 4.7, total: 940 }],
      rackParts: [
        { desc: 'Oil float', qty: 1, unitCost: 0, total: 0, storeSupplied: false }, // contractor buys → must be priced
        { desc: 'CPC sensor', qty: 4, unitCost: 0, total: 0, storeSupplied: true },  // store supplies → not our cost
      ],
    };
    const r = checkBidReadiness(state, okTotals);
    expect(r.blockers.find(b => b.key === 'unpricedParts').count).toBe(1);
  });

  it('residential uses its own equipment list', () => {
    const r = checkBidReadiness(
      { mode: 'Residential HVAC', projName: 'Smith', resEquipment: [{ type: 'Condenser', cost: 0 }], resParts: [] },
      okTotals,
    );
    expect(r.blockers.find(b => b.key === 'unpricedEquipment').count).toBe(1);
  });

  it('an empty job reports only what is genuinely missing, and never throws', () => {
    const r = checkBidReadiness({}, {});
    expect(r.blockers.map(b => b.key)).toEqual(['noLabor']); // no gear/parts to be unpriced yet
    expect(r.warnings.map(w => w.key)).toContain('noProjectName');
    expect(() => checkBidReadiness()).not.toThrow();
  });
});

describe('unread sheets block the bid', () => {
  const unreadFlag = { type: 'warn', text: '3 drawing sheet(s) were not read — the 18-sheet vision limit was reached and these had the least takeoff content: p6, p9, p15. Upload them on their own to include them.' };

  it('is a blocker, not a warning — absent scope cannot be reviewed', () => {
    // Every other blocker is about a number being WRONG. This one is about a
    // number being missing entirely: scope on an unread sheet never becomes an
    // unpriced line, because there is no line.
    const { blockers, ready } = checkBidReadiness({ flags: [unreadFlag] }, {});
    const hit = blockers.find(b => b.key === 'unreadSheets');
    expect(hit).toBeTruthy();
    expect(hit.title).toMatch(/3 drawing sheets were never read/);
    expect(hit.detail).toMatch(/p6, p9, p15/);
    expect(ready).toBe(false);
  });

  it('says nothing when every sheet was read', () => {
    const { issues } = checkBidReadiness({ flags: [{ text: 'PROVIDE WIRE MESH SCREEN' }] }, {});
    expect(issues.find(i => i.key === 'unreadSheets')).toBeUndefined();
  });

  it('counts each page once when two files both fell short', () => {
    const { blockers } = checkBidReadiness({ flags: [unreadFlag, unreadFlag] }, {});
    expect(blockers.find(b => b.key === 'unreadSheets').title).toMatch(/^3 drawing sheets/);
  });
});
