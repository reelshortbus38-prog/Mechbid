import { jobLaborTotal, jobCrew, jobOOTTotal, calcRackLaborTotal, calcFieldTasksTotal, calcResLinesetTotal } from '../state/store.js';

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
  const fieldTasksTotal = calcFieldTasksTotal(state.fieldTasks, crew);
  const taxPct = parseFloat(state.materialsTaxPct) || 0;
  const taxOf = sell => sell * (taxPct / 100);
  const equipMarkupPct = (state.equipMarkupPct === '' || state.equipMarkupPct == null)
    ? markupPct : (parseFloat(state.equipMarkupPct) || 0);
  const subsBase = (state.subcontractors || []).reduce((s, x) => s + (parseFloat(x.cost) || 0), 0);
  const subMarkupPct = parseFloat(state.subMarkupPct) || 0;
  const subsTotal = subsBase * (1 + subMarkupPct / 100);
  const bondPct = parseFloat(state.bondPct) || 0;
  const permitFee = parseFloat(state.permitFee) || 0;
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
    const markupBase = equipTotal + partsTotal + linesetTotal;
    const markupAmt = equipTotal * (equipMarkupPct / 100) + (partsTotal + linesetTotal) * (markupPct / 100);
    const taxAmt = taxOf(markupBase + markupAmt);
    const subtotal = markupBase + markupAmt + taxAmt + subsTotal + laborTotal;
    return finish(subtotal, { markupBase, markupAmt, equipMarkupPct, taxAmt, laborTotal, fieldTasksTotal: 0, equipTotal, partsTotal, linesetTotal });
  }

  if (mode === 'Commercial HVAC') {
    const equipTotal = (state.hvacEquipment || []).reduce((s, e) => s + (e.cost || 0), 0);
    const partsTotal = (state.hvacParts || []).reduce((s, p) => s + (p.total || 0), 0);
    const markupBase = equipTotal + partsTotal;
    const markupAmt = equipTotal * (equipMarkupPct / 100) + partsTotal * (markupPct / 100);
    const taxAmt = taxOf(markupBase + markupAmt);
    const subtotal = markupBase + markupAmt + taxAmt + subsTotal + laborTotal + fieldTasksTotal;
    return finish(subtotal, { markupBase, markupAmt, equipMarkupPct, taxAmt, laborTotal, fieldTasksTotal, equipTotal, partsTotal });
  }

  // Commercial Refrigeration (no separate equipment line — all material markup)
  // (bidLetterBreakdown below re-slices these totals into the categories Food
  // Lion bid letters require: Materials / Refrigerant / Labor / Out of Town.)
  const matsTotal = (state.lineItems || []).reduce((s, i) => s + (i.total || 0), 0);
  const rackPartsContractor = (state.rackParts || []).filter(p => !p.storeSupplied).reduce((s, p) => s + (p.total || 0), 0);
  const rackLaborTotal = calcRackLaborTotal(state.rackTasks, crew);
  const markupBase = matsTotal + rackPartsContractor;
  const markupAmt = markupBase * (markupPct / 100);
  const taxAmt = taxOf(markupBase + markupAmt);
  const subtotal = markupBase + markupAmt + taxAmt + subsTotal + laborTotal + rackLaborTotal + fieldTasksTotal;
  return finish(subtotal, { markupBase, markupAmt, equipMarkupPct: markupPct, taxAmt, laborTotal, rackLaborTotal, fieldTasksTotal, matsTotal, rackPartsContractor });
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
