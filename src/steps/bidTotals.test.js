import { describe, it, expect } from 'vitest';
import { computeBidTotals, bidLetterBreakdown, marginAnalysis, markupForTargetMargin } from './bidTotals.js';

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

  it('bid-letter breakdown: Materials/Refrigerant/Labor/OOT sum to the total', () => {
    // Food Lion portals require the bid in these categories. Refrigerant is
    // broken out of materials (the store sometimes supplies the gas), OOT is
    // broken out of labor, and everything must reconcile to the Total Bid.
    const state = {
      mode: 'Commercial Refrigeration',
      lineItems: [
        { desc: 'Refrigerant — verify type (R-448A / R-407A) & charge by lb', qty: 200, unit: 'lb', unitCost: 12, total: 2400 },
        { desc: 'Refrigerant Oil — verify POE grade', qty: 2, unit: 'gal', unitCost: 60, total: 120 }, // NOT refrigerant gas
        { desc: '7/8" ACR Copper', qty: 100, unit: 'ft', unitCost: 5, total: 500 },
      ],
      rackParts: [], rackTasks: [], fieldTasks: [],
      laborPeriods: [{ id: 'p1', crew: [{ rate: 100, hrsPerDay: 8 }], days: 10, ootPerDay: 150 }],
      markupPct: 20, materialsTaxPct: 0, subcontractors: [], bondPct: 0, permitFee: 0,
    };
    const t = computeBidTotals(state, 20);
    const b = bidLetterBreakdown(state, t);
    // Refrigerant: 2400 base × 1.2 markup = 2880 (oil stays in materials)
    expect(round(b.refrigerant)).toBe(2880);
    expect(b.refLbs).toBe(200);
    // OOT: 150/day × 10 days, carved out of labor
    expect(round(b.oot)).toBe(1500);
    expect(round(b.labor)).toBe(100 * 8 * 10); // crew labor without OOT
    // The invariant: categories reconcile exactly to the bid total
    expect(round(b.materials + b.refrigerant + b.labor + b.oot + b.other)).toBe(round(t.total));
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

// ── WHAT THE BID ACTUALLY EARNS ──────────────────────────────────────────────
describe('margin analysis', () => {
  const crew = [{ rate: 100, hrsPerDay: 8 }, { rate: 75, hrsPerDay: 8 }, { rate: 50, hrsPerDay: 8 }, { rate: 50, hrsPerDay: 8 }];
  const job = (over = {}) => ({
    mode: 'Commercial Refrigeration', laborMode: 'flat',
    flatJob: { crew, weeks: 27, daysPerWeek: 5, ootPerDay: 150 },
    ootBasis: 'person', outOfTown: true,
    lineItems: [{ total: 200000 }],
    rackParts: [], rackTasks: [], fieldTasks: [], subcontractors: [],
    markupPct: 20, materialsTaxPct: 0, bondPct: 0, permitFee: 0,
    ...over,
  });

  it('a "20% markup" on a labour-heavy job earns 6.5%', () => {
    const state = job();
    const a = marginAnalysis(state, computeBidTotals(state, 20));
    expect(a.statedMarkupPct).toBe(20);
    expect(a.effectiveMarginPct).toBe(6.5);
  });

  it('names the share of cost the markup never touches', () => {
    const state = job();
    const a = marginAnalysis(state, computeBidTotals(state, 20));
    expect(a.unmarkedCost).toBe(378000);
    expect(a.unmarkedSharePct).toBe(65.4);
  });

  it('converts the stated markup to the margin it is, which is not the same number', () => {
    const state = job();
    const a = marginAnalysis(state, computeBidTotals(state, 20));
    // 20% markup on cost is 16.7% margin on the sell price.
    expect(a.statedAsMarginPct).toBe(16.7);
  });

  it('gross profit is exactly the markup, because nothing else earns anything', () => {
    const state = job();
    const t = computeBidTotals(state, 20);
    const a = marginAnalysis(state, t);
    expect(a.grossProfit).toBeCloseTo(t.markupAmt, 6);
  });

  it('counts a sub markup as profit and the sub cost as cost', () => {
    const state = job({ subcontractors: [{ cost: 50000 }], subMarkupPct: 10 });
    const t = computeBidTotals(state, 20);
    const a = marginAnalysis(state, t);
    expect(a.grossProfit).toBeCloseTo(t.markupAmt + 5000, 6);
  });

  it('treats tax, bond and permit as pass-through cost, not profit', () => {
    const state = job({ materialsTaxPct: 7, bondPct: 1.5, permitFee: 2500 });
    const t = computeBidTotals(state, 20);
    const a = marginAnalysis(state, t);
    expect(a.grossProfit).toBeCloseTo(t.markupAmt, 6);
  });

  it('reaches the whole bid: cost plus profit is the total', () => {
    const state = job({ materialsTaxPct: 7, bondPct: 1.5, permitFee: 2500, subcontractors: [{ cost: 50000 }], subMarkupPct: 10 });
    const t = computeBidTotals(state, 20);
    const a = marginAnalysis(state, t);
    expect(a.cost + a.grossProfit).toBeCloseTo(t.total, 6);
    expect(a.sell).toBe(t.total);
  });

  it('says nothing about an empty bid', () => {
    expect(marginAnalysis({}, { total: 0 })).toBeNull();
  });
});

describe('markup needed for a target margin', () => {
  const crew = [{ rate: 100, hrsPerDay: 8 }, { rate: 75, hrsPerDay: 8 }, { rate: 50, hrsPerDay: 8 }, { rate: 50, hrsPerDay: 8 }];
  const state = {
    mode: 'Commercial Refrigeration', laborMode: 'flat',
    flatJob: { crew, weeks: 27, daysPerWeek: 5, ootPerDay: 150 },
    ootBasis: 'person', outOfTown: true,
    lineItems: [{ total: 200000 }],
    rackParts: [], rackTasks: [], fieldTasks: [], subcontractors: [],
    markupPct: 20, materialsTaxPct: 0, bondPct: 0, permitFee: 0,
  };
  const totals = computeBidTotals(state, 20);

  it('solves for the material markup that hits a target', () => {
    const r = markupForTargetMargin(state, totals, 15);
    expect(r.pct).toBeCloseTo(51, 0);
    expect(r.reachable).toBe(true);
  });

  it('the answer actually lands on the target when applied', () => {
    const r = markupForTargetMargin(state, totals, 15);
    const t2 = computeBidTotals({ ...state, markupPct: r.pct }, r.pct);
    expect(marginAnalysis({ ...state, markupPct: r.pct }, t2).effectiveMarginPct).toBeCloseTo(15, 1);
  });

  it('says a target is out of reach rather than printing an absurd number', () => {
    const r = markupForTargetMargin(state, totals, 60);
    expect(r.reachable).toBe(false);
  });

  it('returns null when there is no material to mark up', () => {
    const bare = { ...state, lineItems: [] };
    expect(markupForTargetMargin(bare, computeBidTotals(bare, 20), 15)).toBeNull();
  });
});
