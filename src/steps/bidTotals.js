import { jobLaborTotal, jobCrew, jobOOTTotal, calcRackLaborTotal, calcFieldTasksTotal, calcResLinesetTotal } from '../state/store.js';
import { forMode, REFRIGERATION, RESIDENTIAL_HVAC } from '../state/tradeScope.js';

// Pure bid-total computation — no React, so it's unit-testable in isolation.
// INVARIANT (guarded by bidTotals.test.js): the returned `total` always equals
// the sum of every component the proposal displays. Markup is split between
// equipment (equipMarkupPct) and material/parts (markupPct); tax is charged on
// the marked-up materials+equipment sell price only (not labor or subs); bond
// is a % of the running subtotal and the permit is a flat fee, both added last.
export function computeBidTotals(state, markupPct) {
  const mode = state.mode;
  // Mode-aware: phased periods OR one whole-job crew ("4 guys × 27 weeks").
  const laborTotal = jobLaborTotal(state);
  const crew = jobCrew(state);
  // ── TRADE SCOPING ──────────────────────────────────────────────────────────
  // fieldTasks and rackTasks are reachable from steps SHARED by both trades, so
  // both used to reach every mode's arithmetic. A refrigeration case-move task
  // was billed into an HVAC bid, and rack labor — which exists on no HVAC job —
  // inflated HVAC markup and consumables. Scope them here, once, so every
  // consumer below reads a figure that belongs to the job's own trade.
  // Residential has no labor step at all, so it carries no field tasks.
  const fieldTasksTotal = calcFieldTasksTotal(
    mode === RESIDENTIAL_HVAC ? [] : forMode(state.fieldTasks, mode), crew,
  );
  // There is no rack on an HVAC job.
  const rackLaborTotal = mode === REFRIGERATION ? calcRackLaborTotal(state.rackTasks, crew) : 0;
  const taxPct = parseFloat(state.materialsTaxPct) || 0;
  const taxOf = sell => sell * (taxPct / 100);
  const equipMarkupPct = (state.equipMarkupPct === '' || state.equipMarkupPct == null)
    ? markupPct : (parseFloat(state.equipMarkupPct) || 0);
  const subsBase = (state.subcontractors || []).reduce((s, x) => s + (parseFloat(x.cost) || 0), 0);
  const subMarkupPct = parseFloat(state.subMarkupPct) || 0;
  const subsTotal = subsBase * (1 + subMarkupPct / 100);
  const bondPct = parseFloat(state.bondPct) || 0;
  const permitFee = parseFloat(state.permitFee) || 0;
  // When crew rates are burdened COST rather than a billing rate, labor has to
  // carry markup the same way copper does. Out-of-town is deliberately left out
  // of that base: it is a reimbursable expense with its own bid category, not
  // labor. Default is 'billing', which marks up nothing and is what the app has
  // always done.
  const laborIsCost = (state.laborRateBasis || 'billing') === 'cost';
  const ootAmt = jobOOTTotal(state);
  const laborMarkupOn = laborIsCost
    ? Math.max(0, laborTotal - ootAmt) + rackLaborTotal + fieldTasksTotal
    : 0;
  const laborMarkupAmt = laborMarkupOn * (markupPct / 100);

  // ── ESCALATION AND CONSUMABLES ─────────────────────────────────────────────
  // Two costs a mechanical bid carries that no takeoff produces a line for.
  //
  // ESCALATION is material price movement between bidding and buying. On a
  // 27-week job the copper is quoted in month one and bought through month six,
  // and the copper table in this app moved by a factor of three the last time it
  // was refreshed. It applies to MATERIAL only — labor is contracted at a rate
  // and does not escalate — and it is a real cost increase, so it goes into the
  // markup base rather than on top of the sell price. Marking up escalated cost
  // is the point: if copper costs 8% more, the shop's money is 8% more exposed.
  //
  // CONSUMABLES are nitrogen, oxygen and acetylene, brazing rod, emery cloth,
  // tape, adhesive, blades, tips. They scale with MAN-HOURS, not with material
  // dollars — a job that is all brazing burns them whatever the pipe cost — so
  // the base is labor, not material. Out-of-town is excluded: per diem is not
  // man-hours.
  //
  // The labor base is labor COST where that is known. On a billing rate with a
  // cost ratio set, 3% of the billed figure would silently be 5% of the real
  // cost, because the billed figure has profit inside it.
  const escalationPct = parseFloat(state.escalationPct) || 0;
  const consumablesPct = parseFloat(state.consumablesPct) || 0;
  const laborForConsumables = (() => {
    const billed = Math.max(0, laborTotal - ootAmt) + rackLaborTotal + fieldTasksTotal;
    if ((state.laborRateBasis || 'billing') === 'cost') return billed;
    const ratio = parseFloat(state.laborCostRatio);
    return (Number.isFinite(ratio) && ratio > 0 && ratio <= 1) ? billed * ratio : billed;
  })();
  const consumablesAmt = laborForConsumables * (consumablesPct / 100);
  const finish = (subtotal, rest) => {
    const bondAmt = subtotal * (bondPct / 100);
    return { ...rest, subsBase, subMarkupPct, subsTotal, taxPct, bondPct, bondAmt, permitFee, total: subtotal + bondAmt + permitFee };
  };

  if (mode === 'Residential HVAC') {
    const equipTotal = (state.resEquipment || []).reduce((s, e) => s + (e.cost || 0), 0);
    const partsTotal = (state.resParts || []).reduce((s, p) => s + (p.total || 0), 0);
    // Shared helper: roll copper auto-prices from rates × length; pre-insulated
    // is the manual quote total. Must match what the Materials step shows.
    const linesetTotal = calcResLinesetTotal(state);
    const escalationAmt = (partsTotal + linesetTotal) * (escalationPct / 100);
    const markupBase = equipTotal + partsTotal + linesetTotal + escalationAmt + consumablesAmt;
    const markupAmt = equipTotal * (equipMarkupPct / 100)
      + (partsTotal + linesetTotal + escalationAmt + consumablesAmt) * (markupPct / 100);
    const taxAmt = taxOf(markupBase + markupAmt);
    const subtotal = markupBase + markupAmt + taxAmt + subsTotal + laborTotal + laborMarkupAmt;
    return finish(subtotal, { markupBase, markupAmt, equipMarkupPct, taxAmt, laborTotal, laborMarkupAmt, fieldTasksTotal: 0, equipTotal, partsTotal, linesetTotal, escalationAmt, escalationPct, consumablesAmt, consumablesPct });
  }

  if (mode === 'Commercial HVAC') {
    const equipTotal = (state.hvacEquipment || []).reduce((s, e) => s + (e.cost || 0), 0);
    const partsTotal = (state.hvacParts || []).reduce((s, p) => s + (p.total || 0), 0);
    const escalationAmt = partsTotal * (escalationPct / 100);
    const markupBase = equipTotal + partsTotal + escalationAmt + consumablesAmt;
    const markupAmt = equipTotal * (equipMarkupPct / 100)
      + (partsTotal + escalationAmt + consumablesAmt) * (markupPct / 100);
    const taxAmt = taxOf(markupBase + markupAmt);
    const subtotal = markupBase + markupAmt + taxAmt + subsTotal + laborTotal + fieldTasksTotal + laborMarkupAmt;
    return finish(subtotal, { markupBase, markupAmt, equipMarkupPct, taxAmt, laborTotal, laborMarkupAmt, fieldTasksTotal, equipTotal, partsTotal, escalationAmt, escalationPct, consumablesAmt, consumablesPct });
  }

  // Commercial Refrigeration (no separate equipment line — all material markup)
  // (bidLetterBreakdown below re-slices these totals into the categories Food
  // Lion bid letters require: Materials / Refrigerant / Labor / Out of Town.)
  const matsTotal = (state.lineItems || []).reduce((s, i) => s + (i.total || 0), 0);
  const rackPartsContractor = (state.rackParts || []).filter(p => !p.storeSupplied).reduce((s, p) => s + (p.total || 0), 0);
  const escalationAmt = (matsTotal + rackPartsContractor) * (escalationPct / 100);
  const markupBase = matsTotal + rackPartsContractor + escalationAmt + consumablesAmt;
  const markupAmt = markupBase * (markupPct / 100);
  const taxAmt = taxOf(markupBase + markupAmt);
  const subtotal = markupBase + markupAmt + taxAmt + subsTotal + laborTotal + rackLaborTotal + fieldTasksTotal + laborMarkupAmt;
  return finish(subtotal, { markupBase, markupAmt, equipMarkupPct: markupPct, taxAmt, laborTotal, laborMarkupAmt, rackLaborTotal, fieldTasksTotal, matsTotal, rackPartsContractor, escalationAmt, escalationPct, consumablesAmt, consumablesPct });
}

// ── BID-LETTER CATEGORY BREAKDOWN ────────────────────────────────────────────
// Food Lion bid letters require the price submitted in fixed categories:
// Materials / Refrigerant / Labor / Out of Town Expenses / Total Bid Price
// (with refrigerant POUNDS noted separately). This re-slices computeBidTotals'
// numbers into exactly those buckets, at SELL price, and the invariant holds:
// materials + refrigerant + labor + oot + other === total.
export function bidLetterBreakdown(state, totals) {
  const taxMult = 1 + (totals.taxPct || 0) / 100;
  const markupMult = 1 + (totals.equipMarkupPct || 0) / 100;

  // Refrigerant line items (not refrigerant OIL) from the materials list —
  // broken out because the store sometimes supplies the gas ("Food Lion will
  // supply Gas and drums for new A rack") and the letter asks for pounds.
  const refLines = (state.lineItems || []).filter(i => /refrigerant|r-?\d{3}[a-z]?\b|r-?744/i.test(i.desc || '') && !/oil/i.test(i.desc || ''));
  const refBase = refLines.reduce((s, i) => s + (i.total || 0), 0);
  const refLbs = refLines.filter(i => (i.unit || '') === 'lb').reduce((s, i) => s + (parseFloat(i.qty) || 0), 0);
  const refrigerant = refBase * markupMult * taxMult;

  const matsSell = (totals.markupBase || 0) + (totals.markupAmt || 0) + (totals.taxAmt || 0);
  const oot = jobOOTTotal(state);
  const labor = (totals.laborTotal || 0) + (totals.rackLaborTotal || 0) + (totals.fieldTasksTotal || 0) - oot;
  const other = (totals.subsTotal || 0) + (totals.bondAmt || 0) + (totals.permitFee || 0);

  return {
    materials: matsSell - refrigerant,
    refrigerant,
    refLbs,
    labor,
    oot,
    other,
    total: totals.total,
  };
}

// ── WHAT THE BID ACTUALLY EARNS ──────────────────────────────────────────────
// Markup is applied to MATERIALS ONLY. Labor, rack labor and field tasks all
// enter the subtotal at cost and carry none. On a job that is mostly labor —
// which most refrigeration work is — that means the number the estimator set is
// not the number the bid makes:
//
//   materials $200,000 · labor $378,000 · "20% markup"
//   → bid $618,000, cost $578,000, gross profit $40,000 = 6.5%
//
// Three things compound there. The markup lands on a third of the cost; a 20%
// MARKUP on cost is a 16.7% MARGIN on the sell price whatever it lands on; and
// the scenario picker calls all of it "margin".
//
// WHETHER THAT IS WRONG DEPENDS ON THE SHOP, WHICH IS WHY THIS REPORTS RATHER
// THAN CHANGES ANYTHING. Plenty of contractors sell labor at a billing rate
// with overhead and profit already inside it, and for them marking it up again
// would double-count. Plenty of others enter burdened cost and expect the
// markup to carry the whole job. The app cannot tell which from a rate that is
// labelled only "Rate/hr" — but it can show what the bid earns, and let the
// estimator see whether that is the number they meant.
export function marginAnalysis(state, totals) {
  const t = totals || {};
  const laborBilled = (t.laborTotal || 0) + (t.rackLaborTotal || 0) + (t.fieldTasksTotal || 0);
  const matCost = t.markupBase || 0;
  const passThrough = (t.taxAmt || 0) + (t.bondAmt || 0) + (t.permitFee || 0);
  const sell = t.total || 0;
  if (!(sell > 0)) return null;

  const basis = state?.laborRateBasis || 'billing';
  const ratio = parseFloat(state?.laborCostRatio);
  const hasRatio = Number.isFinite(ratio) && ratio > 0 && ratio <= 1;
  const oot = jobOOTTotal(state);

  // A BILLING rate is already a sell price with profit inside it, so treating it
  // as cost understates the margin badly — on a real job the difference is 6.5%
  // against 24-34%. Without a cost ratio the profit inside the rate cannot be
  // seen, so the margin is reported as unknown rather than wrong.
  let laborCost, laborKnown;
  if (basis === 'cost') {
    laborCost = laborBilled; laborKnown = true;
  } else if (hasRatio) {
    // Out-of-town is a reimbursed expense carried at cost; only the labor part
    // of the billed figure has profit inside it.
    laborCost = (laborBilled - oot) * ratio + oot; laborKnown = true;
  } else {
    laborCost = laborBilled; laborKnown = false;
  }

  const cost = matCost + laborCost + (t.subsBase || 0) + passThrough;
  const grossProfit = sell - cost;
  // The share of cost the material markup never touches.
  const unmarked = (t.laborMarkupAmt > 0 ? 0 : laborCost) + (t.subsBase || 0);
  const m = parseFloat(state?.markupPct) || 0;
  return {
    cost, sell, grossProfit,
    effectiveMarginPct: Math.round((grossProfit / sell) * 1000) / 10,
    statedMarkupPct: m,
    statedAsMarginPct: Math.round((m / (100 + m)) * 1000) / 10,
    laborBasis: basis,
    // false when the rate is a billing rate and no cost ratio was given: the
    // margin below is a FLOOR, not the answer.
    laborKnown,
    laborCost, laborBilled, matCost,
    laborMarkupAmt: t.laborMarkupAmt || 0,
    unmarkedCost: unmarked,
    unmarkedSharePct: cost > 0 ? Math.round((unmarked / cost) * 1000) / 10 : 0,
  };
}

// What the material markup would have to be for the WHOLE bid to earn a target
// margin, given that labor carries none. Returns null when it cannot get there
// — past a point no material markup covers a labour-heavy job, and saying so is
// more use than printing 400%.
export const MAX_SENSIBLE_MARKUP_PCT = 200;

export function markupForTargetMargin(state, totals, targetMarginPct) {
  const a = marginAnalysis(state, totals);
  const target = parseFloat(targetMarginPct) || 0;
  if (!a || !(target > 0) || target >= 100) return null;
  if (!(a.matCost > 0)) return null;
  // sell = cost + matCost×m  and  margin = (sell − cost)/sell
  // → matCost×m = margin×sell = margin×(cost + matCost×m)
  const f = target / 100;
  const needed = (f * a.cost) / (a.matCost * (1 - f));
  const pct = Math.round(needed * 1000) / 10;
  return pct > MAX_SENSIBLE_MARKUP_PCT ? { pct, reachable: false } : { pct, reachable: true };
}


// ── HOW MUCH MATERIAL IS EXPOSED, AND FOR HOW LONG ───────────────────────────
// Escalation is a judgement about a commodity market, and no app should invent
// the percentage. What it CAN do is show the exposure, so the judgement is made
// against a number instead of a blank field: this much material, bought this
// far out, moves this much per point.
//
// The duration comes from the labor schedule, which is the only place the app
// knows how long the job runs.
export const LONG_JOB_WEEKS = 12;

export function escalationExposure(state, totals) {
  const t = totals || {};
  // Material at risk is the takeoff before escalation is added back on.
  const pct = parseFloat(t.escalationPct) || 0;
  const base = Math.max(0, (t.markupBase || 0) - (t.escalationAmt || 0) - (t.consumablesAmt || 0));
  if (!(base > 0)) return null;

  let weeks = 0;
  if (state?.laborMode === 'flat') {
    weeks = parseFloat(state?.flatJob?.weeks) || 0;
  } else {
    const days = (state?.laborPeriods || []).reduce((s, p) => s + (parseFloat(p.days) || 0), 0);
    const dpw = (state?.laborPeriods || []).reduce((mx, p) => Math.max(mx, parseFloat(p.daysPerWeek) || 0), 0) || 5;
    weeks = days / dpw;
  }
  weeks = Math.round(weeks * 10) / 10;

  return {
    materialAtRisk: Math.round(base),
    weeks,
    long: weeks >= LONG_JOB_WEEKS,
    pct,
    amount: Math.round(t.escalationAmt || 0),
    // What one point of movement is worth, so the sensitivity is visible.
    perPoint: Math.round(base / 100),
    unprotected: weeks >= LONG_JOB_WEEKS && pct <= 0,
  };
}

// The qualification that belongs on the proposal when escalation is carried, so
// the allowance and the contract language cannot drift apart.
export function escalationClause(pct, validDays) {
  const p = parseFloat(pct) || 0;
  if (!(p > 0)) return '';
  return `Pricing includes a ${p}% material escalation allowance and is firm for ${parseFloat(validDays) || 30} days `
    + 'from the date of this proposal. Material price increases beyond that allowance, and beyond the validity '
    + 'period, will be submitted for review with supporting supplier documentation.';
}
