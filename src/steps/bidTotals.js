import { calcTotalLabor, calcRackLaborTotal, calcFieldTasksTotal, calcResLinesetTotal, primaryCrew } from '../state/store.js';

// Pure bid-total computation — no React, so it's unit-testable in isolation.
// INVARIANT (guarded by bidTotals.test.js): the returned `total` always equals
// the sum of every component the proposal displays. Markup is split between
// equipment (equipMarkupPct) and material/parts (markupPct); tax is charged on
// the marked-up materials+equipment sell price only (not labor or subs); bond
// is a % of the running subtotal and the permit is a flat fee, both added last.
export function computeBidTotals(state, markupPct) {
  const mode = state.mode;
  const laborTotal = calcTotalLabor(state.laborPeriods || []);
  const crew = primaryCrew(state.laborPeriods);
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
  const matsTotal = (state.lineItems || []).reduce((s, i) => s + (i.total || 0), 0);
  const rackPartsContractor = (state.rackParts || []).filter(p => !p.storeSupplied).reduce((s, p) => s + (p.total || 0), 0);
  const rackLaborTotal = calcRackLaborTotal(state.rackTasks, crew);
  const markupBase = matsTotal + rackPartsContractor;
  const markupAmt = markupBase * (markupPct / 100);
  const taxAmt = taxOf(markupBase + markupAmt);
  const subtotal = markupBase + markupAmt + taxAmt + subsTotal + laborTotal + rackLaborTotal + fieldTasksTotal;
  return finish(subtotal, { markupBase, markupAmt, equipMarkupPct: markupPct, taxAmt, laborTotal, rackLaborTotal, fieldTasksTotal, matsTotal, rackPartsContractor });
}
