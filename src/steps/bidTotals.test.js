import { describe, it, expect } from 'vitest';
import { computeBidTotals, bidLetterBreakdown, marginAnalysis, markupForTargetMargin, escalationExposure, escalationClause } from './bidTotals.js';

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

// ── WHAT A CREW RATE MEANS ───────────────────────────────────────────────────
describe('labor rate basis', () => {
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

  it('defaults to a billing rate, which marks up nothing — the behaviour that shipped', () => {
    const state = job();
    const t = computeBidTotals(state, 20);
    expect(t.laborMarkupAmt).toBe(0);
    expect(t.total).toBe(618000);
  });

  it('a burdened COST rate makes the markup carry labor too', () => {
    const state = job({ laborRateBasis: 'cost' });
    const t = computeBidTotals(state, 20);
    expect(t.laborMarkupAmt).toBeGreaterThan(0);
    expect(t.total).toBeGreaterThan(618000);
  });

  it('does NOT mark up out-of-town — it is a reimbursed expense, not labor', () => {
    const state = job({ laborRateBasis: 'cost' });
    const t = computeBidTotals(state, 20);
    // labor total includes OOT; only the labor part carries markup.
    const oot = 81000;
    expect(t.laborMarkupAmt).toBeCloseTo((t.laborTotal - oot) * 0.2, 6);
  });

  it('reports the margin as a FLOOR when the rate is billing and no cost ratio is given', () => {
    const state = job();
    const a = marginAnalysis(state, computeBidTotals(state, 20));
    expect(a.laborKnown).toBe(false);
    expect(a.effectiveMarginPct).toBe(6.5);
  });

  it('with a cost ratio the real margin appears, and it is nothing like the floor', () => {
    const state = job({ laborCostRatio: 0.62 });
    const a = marginAnalysis(state, computeBidTotals(state, 20));
    expect(a.laborKnown).toBe(true);
    expect(a.effectiveMarginPct).toBeCloseTo(24.7, 1);
  });

  it('carries out-of-town at cost inside the ratio — per diem has no profit in it', () => {
    const state = job({ laborCostRatio: 0.5 });
    const a = marginAnalysis(state, computeBidTotals(state, 20));
    // 81k of the 378k billed is OOT and passes through untouched.
    expect(a.laborCost).toBeCloseTo((378000 - 81000) * 0.5 + 81000, 6);
  });

  it('a cost-basis job needs no ratio — the rate already is the cost', () => {
    const state = job({ laborRateBasis: 'cost' });
    const a = marginAnalysis(state, computeBidTotals(state, 20));
    expect(a.laborKnown).toBe(true);
    expect(a.laborCost).toBe(a.laborBilled);
  });

  it('stops calling labor unmarked once the markup actually reaches it', () => {
    const billing = marginAnalysis(job(), computeBidTotals(job(), 20));
    const s2 = job({ laborRateBasis: 'cost' });
    const cost = marginAnalysis(s2, computeBidTotals(s2, 20));
    expect(billing.unmarkedSharePct).toBeGreaterThan(60);
    expect(cost.unmarkedSharePct).toBe(0);
  });

  it('ignores a nonsense ratio rather than producing a nonsense margin', () => {
    for (const bad of [0, -1, 2, 'abc', '']) {
      expect(marginAnalysis(job({ laborCostRatio: bad }), computeBidTotals(job(), 20)).laborKnown).toBe(false);
    }
  });

  it('cost plus profit still reconciles to the total on every basis', () => {
    for (const over of [{}, { laborCostRatio: 0.62 }, { laborRateBasis: 'cost' }]) {
      const state = job({ ...over, materialsTaxPct: 7, bondPct: 1.5, permitFee: 2500 });
      const t = computeBidTotals(state, 20);
      const a = marginAnalysis(state, t);
      expect(a.cost + a.grossProfit).toBeCloseTo(t.total, 6);
    }
  });
});

// ── ESCALATION AND CONSUMABLES ───────────────────────────────────────────────
describe('escalation and consumables', () => {
  const crew = [{ rate: 100, hrsPerDay: 8 }, { rate: 75, hrsPerDay: 8 }, { rate: 50, hrsPerDay: 8 }, { rate: 50, hrsPerDay: 8 }];
  const job = (over = {}) => ({
    mode: 'Commercial Refrigeration', laborMode: 'flat',
    flatJob: { crew, weeks: 27, daysPerWeek: 5, ootPerDay: 150 },
    ootBasis: 'person', outOfTown: true, laborCostRatio: 0.6,
    lineItems: [{ total: 200000 }],
    rackParts: [], rackTasks: [], fieldTasks: [], subcontractors: [],
    markupPct: 20, materialsTaxPct: 0, bondPct: 0, permitFee: 0,
    ...over,
  });

  it('both default to zero, so no existing bid moves', () => {
    const t = computeBidTotals(job(), 20);
    expect(t.escalationAmt).toBe(0);
    expect(t.consumablesAmt).toBe(0);
    expect(t.total).toBe(618000);
  });

  it('escalation applies to material only, never to labor', () => {
    const t = computeBidTotals(job({ escalationPct: 8 }), 20);
    expect(t.escalationAmt).toBe(16000);
    // The bid rises by the escalation AND the markup on it: 16,000 × 1.2.
    expect(t.total).toBe(618000 + 19200);
  });

  it('consumables run on labor COST, not on the billed figure', () => {
    // 378,000 billed − 81,000 out-of-town = 297,000, at a 0.6 cost ratio.
    const t = computeBidTotals(job({ consumablesPct: 3 }), 20);
    expect(t.consumablesAmt).toBeCloseTo(297000 * 0.6 * 0.03, 6);
  });

  it('uses the billed figure directly when rates ARE the cost', () => {
    const t = computeBidTotals(job({ consumablesPct: 3, laborRateBasis: 'cost' }), 20);
    expect(t.consumablesAmt).toBeCloseTo(297000 * 0.03, 6);
  });

  it('excludes out-of-town from consumables — per diem is not man-hours', () => {
    const withOot = computeBidTotals(job({ consumablesPct: 3 }), 20);
    const without = computeBidTotals(job({ consumablesPct: 3, flatJob: { crew, weeks: 27, daysPerWeek: 5, ootPerDay: 0 } }), 20);
    expect(withOot.consumablesAmt).toBeCloseTo(without.consumablesAmt, 6);
  });

  it('both carry markup, because both are real cost the shop fronts', () => {
    const t = computeBidTotals(job({ escalationPct: 8, consumablesPct: 3 }), 20);
    expect(t.markupBase).toBeCloseTo(200000 + t.escalationAmt + t.consumablesAmt, 6);
  });

  it('both are taxed as material where tax applies', () => {
    const t = computeBidTotals(job({ escalationPct: 8, materialsTaxPct: 7 }), 20);
    expect(t.taxAmt).toBeCloseTo((t.markupBase + t.markupAmt) * 0.07, 6);
  });

  it('cost plus profit still reconciles to the total with both in play', () => {
    const state = job({ escalationPct: 8, consumablesPct: 3, materialsTaxPct: 7, bondPct: 1.5, permitFee: 2500 });
    const t = computeBidTotals(state, 20);
    const a = marginAnalysis(state, t);
    expect(a.cost + a.grossProfit).toBeCloseTo(t.total, 6);
  });

  it('works the same in the HVAC modes', () => {
    for (const mode of ['Commercial HVAC', 'Residential HVAC']) {
      const state = { ...job(), mode, hvacParts: [{ total: 100000 }], resParts: [{ total: 100000 }], hvacEquipment: [], resEquipment: [] };
      const t = computeBidTotals({ ...state, escalationPct: 10 }, 20);
      expect(t.escalationAmt).toBeCloseTo(10000, 6);
    }
  });
});

describe('escalation exposure', () => {
  const crew = [{ rate: 100, hrsPerDay: 8 }];
  const job = (over = {}) => ({
    mode: 'Commercial Refrigeration', laborMode: 'flat',
    flatJob: { crew, weeks: 27, daysPerWeek: 5 },
    lineItems: [{ total: 200000 }],
    rackParts: [], rackTasks: [], fieldTasks: [], subcontractors: [],
    markupPct: 20, materialsTaxPct: 0, bondPct: 0, permitFee: 0,
    ...over,
  });

  it('reports the material at risk and what a single point is worth', () => {
    const e = escalationExposure(job(), computeBidTotals(job(), 20));
    expect(e.materialAtRisk).toBe(200000);
    expect(e.perPoint).toBe(2000);
    expect(e.weeks).toBe(27);
  });

  it('flags a long job carrying no escalation at all', () => {
    expect(escalationExposure(job(), computeBidTotals(job(), 20)).unprotected).toBe(true);
  });

  it('goes quiet once an allowance is set', () => {
    const state = job({ escalationPct: 5 });
    expect(escalationExposure(state, computeBidTotals(state, 20)).unprotected).toBe(false);
  });

  it('does not call a short job unprotected', () => {
    const state = job({ flatJob: { crew, weeks: 3, daysPerWeek: 5 } });
    const e = escalationExposure(state, computeBidTotals(state, 20));
    expect(e.long).toBe(false);
    expect(e.unprotected).toBe(false);
  });

  it('reads duration off phased periods too', () => {
    const state = job({ laborMode: 'periods', laborPeriods: [{ crew, days: 60, daysPerWeek: 5 }], flatJob: undefined });
    expect(escalationExposure(state, computeBidTotals(state, 20)).weeks).toBe(12);
  });

  it('the material at risk excludes what escalation itself added', () => {
    const state = job({ escalationPct: 8, consumablesPct: 3 });
    expect(escalationExposure(state, computeBidTotals(state, 20)).materialAtRisk).toBe(200000);
  });

  it('says nothing about a bid with no material', () => {
    const bare = job({ lineItems: [] });
    expect(escalationExposure(bare, computeBidTotals(bare, 20))).toBeNull();
  });
});

describe('escalation clause', () => {
  it('states the allowance and the validity period together', () => {
    const c = escalationClause(8, 30);
    expect(c).toMatch(/8% material escalation allowance/);
    expect(c).toMatch(/firm for 30 days/);
    expect(c).toMatch(/supporting supplier documentation/);
  });

  it('is empty when no allowance is carried — no clause to make', () => {
    expect(escalationClause(0, 30)).toBe('');
    expect(escalationClause('', 30)).toBe('');
  });
});

// ── TRADE SCOPING ────────────────────────────────────────────────────────────
// A job carries one trade, but fieldTasks and rackTasks are reachable from
// steps SHARED by both. Before scoping, uploading refrigeration redlines and
// then switching the job to Commercial HVAC billed the refrigeration case-move
// tasks into the HVAC bid, and rack labor — which exists on no HVAC job — fed
// HVAC markup and consumables. These pin that shut.
describe('one trade does not pay for the other trade', () => {
  // 1 man × 10 hrs. Costed off the bid crew's average rate ($80) = $800.
  const refrigTask = { id: 'ft1', desc: 'Set 4 cases', men: 1, hrs: 10, mode: 'Commercial Refrigeration' };
  const hvacTask = { id: 'ft2', desc: 'VAV startup', men: 1, hrs: 10, mode: 'Commercial HVAC' };

  const hvacState = extra => ({
    mode: 'Commercial HVAC',
    hvacEquipment: [{ cost: 5000 }],
    hvacParts: [{ total: 1000 }],
    rackParts: [], rackTasks: [], lineItems: [],
    laborPeriods,
    markupPct: 20,
    ...extra,
  });

  it('an HVAC bid does not bill a refrigeration field task', () => {
    const clean = computeBidTotals(hvacState({ fieldTasks: [] }), 20);
    const leaky = computeBidTotals(hvacState({ fieldTasks: [refrigTask] }), 20);
    expect(leaky.fieldTasksTotal).toBe(0);
    expect(round(leaky.total)).toBe(round(clean.total));
  });

  it('but it DOES bill its own field task', () => {
    const t = computeBidTotals(hvacState({ fieldTasks: [hvacTask] }), 20);
    expect(t.fieldTasksTotal).toBeGreaterThan(0);
  });

  it('an unstamped task is still billed — a missing line is worse than a stray one', () => {
    // Everything saved before trade scoping has no mode. Dropping it would
    // quietly shrink an existing bid, which is the failure that costs money.
    const legacy = { id: 'ft3', desc: 'Hand-entered', men: 1, hrs: 10 };
    const t = computeBidTotals(hvacState({ fieldTasks: [legacy] }), 20);
    expect(t.fieldTasksTotal).toBeGreaterThan(0);
  });

  it('rack labor never reaches an HVAC bid — there is no rack on an HVAC job', () => {
    // On a BILLING basis rack labor touches nothing in HVAC mode, so this has
    // to run on a COST basis to exercise the path it actually leaked through:
    // laborMarkupOn, where rack hours were marked up on an HVAC bid.
    const rackTasks = [{ id: 'rt1', desc: 'Add compressor', men: 2, hrs: 8 }];
    const opts = { fieldTasks: [], laborRateBasis: 'cost' };
    const clean = computeBidTotals(hvacState({ ...opts, rackTasks: [] }), 20);
    const leaky = computeBidTotals(hvacState({ ...opts, rackTasks }), 20);
    expect(clean.laborMarkupAmt).toBeGreaterThan(0);   // the path is live
    expect(round(leaky.laborMarkupAmt)).toBe(round(clean.laborMarkupAmt));
    expect(round(leaky.total)).toBe(round(clean.total));
  });

  it('rack labor and consumables still work on the refrigeration job that owns them', () => {
    const base = {
      mode: 'Commercial Refrigeration',
      lineItems: [{ total: 1000 }], rackParts: [], laborPeriods,
      fieldTasks: [refrigTask], markupPct: 20, consumablesPct: 3,
    };
    const t = computeBidTotals({ ...base, rackTasks: [{ id: 'rt1', men: 2, hrs: 8 }] }, 20);
    expect(t.rackLaborTotal).toBeGreaterThan(0);
    expect(t.fieldTasksTotal).toBeGreaterThan(0);
    expect(t.consumablesAmt).toBeGreaterThan(0);
  });

  it('consumables on an HVAC job scale on HVAC labor only', () => {
    const withRefrig = computeBidTotals(hvacState({
      fieldTasks: [refrigTask], rackTasks: [{ id: 'rt1', men: 2, hrs: 8 }], consumablesPct: 3,
    }), 20);
    const withoutRefrig = computeBidTotals(hvacState({
      fieldTasks: [], rackTasks: [], consumablesPct: 3,
    }), 20);
    expect(round(withRefrig.consumablesAmt)).toBe(round(withoutRefrig.consumablesAmt));
  });

  it('the reconciliation invariant still holds in HVAC mode with a mixed task list', () => {
    const t = computeBidTotals(hvacState({ fieldTasks: [refrigTask, hvacTask] }), 20);
    const sum = t.markupBase + t.markupAmt + t.taxAmt + t.subsTotal
      + t.laborTotal + t.fieldTasksTotal + t.laborMarkupAmt + t.bondAmt + t.permitFee;
    expect(round(sum)).toBe(round(t.total));
  });
});
