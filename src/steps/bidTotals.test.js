import { describe, it, expect } from 'vitest';
import { computeBidTotals } from './bidTotals.js';

// The proposal shows these component lines and a grand total. If `total` ever
// drifts from the sum of the lines, a customer's bid silently adds up wrong —
// the worst possible bug for a paid estimating tool. These tests pin the
// invariant: total === sum of every displayed component, in every mode.

const round = n => Math.round(n * 100) / 100;

// One labor period: 2 techs @ $80/hr, 5 days, 8 hr/day = 2*80*5*8 = $6,400.
const laborPeriods = [{
  id: 'p1', crew: [{ rate: 80, hrsPerDay: 8 }, { rate: 80, hrsPerDay: 8 }], days: 5,
}];

describe('computeBidTotals reconciliation', () => {
  it('Commercial Refrigeration: total equals sum of components', () => {
    const state = {
      mode: 'Commercial Refrigeration',
      lineItems: [{ total: 1000 }, { total: 500 }],
      rackParts: [{ total: 300, storeSupplied: false }, { total: 999, storeSupplied: true }],
      rackTasks: [],
      laborPeriods,
      fieldTasks: [],
      materialsTaxPct: 7,
      markupPct: 20,
      subcontractors: [{ cost: 2000 }],
      subMarkupPct: 10,
      bondPct: 2,
      permitFee: 350,
    };
    const t = computeBidTotals(state, 20);
    // store-supplied rack part (999) must NOT be in the contractor base
    expect(t.markupBase).toBe(1000 + 500 + 300);
    const sum = t.markupBase + t.markupAmt + t.taxAmt + t.subsTotal
      + t.laborTotal + t.rackLaborTotal + t.fieldTasksTotal + t.bondAmt + t.permitFee;
    expect(round(sum)).toBe(round(t.total));
    expect(t.laborTotal).toBe(6400);
    // tax only on marked-up materials, not labor/subs
    expect(round(t.taxAmt)).toBe(round((t.markupBase + t.markupAmt) * 0.07));
  });

  it('Commercial HVAC: total equals sum of components, split markup', () => {
    const state = {
      mode: 'Commercial HVAC',
      hvacEquipment: [{ cost: 8000 }, { cost: 4000 }],
      hvacParts: [{ total: 1500 }],
      laborPeriods,
      fieldTasks: [],
      materialsTaxPct: 8.875,
      markupPct: 15,
      equipMarkupPct: 25,
      subcontractors: [],
      bondPct: 1.5,
      permitFee: 0,
    };
    const t = computeBidTotals(state, 15);
    // equipment marked at 25%, parts at 15%
    expect(round(t.markupAmt)).toBe(round(12000 * 0.25 + 1500 * 0.15));
    const sum = t.markupBase + t.markupAmt + t.taxAmt + t.subsTotal
      + t.laborTotal + t.fieldTasksTotal + t.bondAmt + t.permitFee;
    expect(round(sum)).toBe(round(t.total));
  });

  it('Residential HVAC: total equals sum of components incl. lineset', () => {
    const state = {
      mode: 'Residential HVAC',
      resEquipment: [{ cost: 5500 }],
      resParts: [{ total: 600 }],
      resLinesetTotal: 350,
      laborPeriods,
      materialsTaxPct: 6,
      markupPct: 30,
      equipMarkupPct: 30,
      subcontractors: [{ cost: 1200 }],
      subMarkupPct: 0,
      bondPct: 0,
      permitFee: 175,
    };
    const t = computeBidTotals(state, 30);
    expect(t.markupBase).toBe(5500 + 600 + 350);
    const sum = t.markupBase + t.markupAmt + t.taxAmt + t.subsTotal
      + t.laborTotal + t.bondAmt + t.permitFee;
    expect(round(sum)).toBe(round(t.total));
  });

  it('Residential HVAC roll copper: auto-priced lineset lands in the bid total', () => {
    // Roll copper has NO manual resLinesetTotal — the price comes from the
    // copper rate table × length. Reading resLinesetTotal directly dropped it.
    const state = {
      mode: 'Residential HVAC',
      resEquipment: [], resParts: [], laborPeriods: [],
      resLinesetType: 'roll', resSucSize: '7/8', resLiqSize: '3/8', resLineLength: 50,
      rates: { cu: { '7/8': 4.70, '3/8': 1.70 } },
      markupPct: 0, equipMarkupPct: 0, materialsTaxPct: 0,
      subcontractors: [], bondPct: 0, permitFee: 0,
    };
    const t = computeBidTotals(state, 0);
    expect(round(t.linesetTotal)).toBe(round((4.70 + 1.70) * 50)); // $320
    expect(round(t.total)).toBe(320);
  });

  it('whole-job (flat) crew mode: 4 guys × weeks × days/week lands in the total', () => {
    // "4 guys for 27 weeks" — the flat-bid style. 1F($100)+1T($75)+2H($50) at
    // 8 hrs/day = $2,200/day × 27wk × 5d = $297,000. Rack tasks must price off
    // the FLAT crew's average rate in this mode, not the (empty) periods.
    const state = {
      mode: 'Commercial Refrigeration',
      laborMode: 'flat',
      flatJob: { weeks: 27, daysPerWeek: 5, ootPerDay: 0, crew: [
        { rate: 100, hrsPerDay: 8 }, { rate: 75, hrsPerDay: 8 },
        { rate: 50, hrsPerDay: 8 }, { rate: 50, hrsPerDay: 8 },
      ] },
      laborPeriods: [], lineItems: [], rackParts: [],
      rackTasks: [{ men: 1, hrs: 4 }], // 4 hrs × avg rate $68.75 = $275
      fieldTasks: [], markupPct: 0, materialsTaxPct: 0,
      subcontractors: [], bondPct: 0, permitFee: 0,
    };
    const t = computeBidTotals(state, 0);
    expect(round(t.laborTotal)).toBe(297000);
    expect(round(t.rackLaborTotal)).toBe(275);
    expect(round(t.total)).toBe(297275);
  });

  it('empty job: everything zero, no NaN', () => {
    const t = computeBidTotals({ mode: 'Commercial Refrigeration' }, 20);
    expect(t.total).toBe(0);
    expect(Number.isNaN(t.total)).toBe(false);
  });

  it('equipMarkupPct falls back to material markup when blank', () => {
    const state = {
      mode: 'Commercial HVAC', hvacEquipment: [{ cost: 1000 }], hvacParts: [],
      equipMarkupPct: '', markupPct: 20, laborPeriods: [], fieldTasks: [],
    };
    const t = computeBidTotals(state, 20);
    expect(round(t.markupAmt)).toBe(200); // 1000 * 20%
  });

  it('bond is charged on the running subtotal, not just materials', () => {
    const state = {
      mode: 'Commercial Refrigeration', lineItems: [{ total: 1000 }], rackParts: [],
      rackTasks: [], laborPeriods, fieldTasks: [], markupPct: 0, materialsTaxPct: 0,
      subcontractors: [], bondPct: 10, permitFee: 0,
    };
    const t = computeBidTotals(state, 0);
    // subtotal = 1000 materials + 6400 labor = 7400; bond = 10% = 740
    expect(round(t.bondAmt)).toBe(740);
    expect(round(t.total)).toBe(round(7400 + 740));
  });
});
