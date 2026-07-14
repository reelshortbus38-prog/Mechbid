// ── DUCTWORK PURCHASE MATH ─────────────────────────────────────────────────────
// Converts a duct takeoff (sizes + linear feet scaled off the plan) into the
// units duct is actually BOUGHT in, which are not feet for everything:
//
//   Rectangular sheet metal — custom-fabricated by a sheet metal shop and
//     priced BY THE POUND of galvanized steel. Feet convert to pounds via the
//     metal gauge, which SMACNA sets by the duct's larger dimension (bigger
//     duct = heavier gauge). lbs/ft = perimeter (ft) × sheet weight (lb/sqft).
//   Spiral round duct — bought by the foot in standard factory joints
//     (10-footers), by diameter. Fittings are each.
//   Flex duct — pre-insulated, sold in 25 ft boxes.
//   Duct wrap insulation — fiberglass w/ FSK facing, sold by the ROLL
//     (typically ~100 sq ft); estimated from duct surface area
//     (perimeter × length) plus overlap. Flex needs none (pre-insulated),
//     and return/exhaust duct is commonly run bare.

// Galvanized sheet weight by gauge, lb per sq ft (standard G60/G90 sheet).
export const GALV_LB_SQFT = { 26: 0.906, 24: 1.156, 22: 1.406, 20: 1.656, 18: 2.156 };

// SMACNA low-pressure gauge by the duct's larger side (inches).
export function gaugeForRect(maxSideIn) {
  if (maxSideIn <= 12) return 26;
  if (maxSideIn <= 30) return 24;
  if (maxSideIn <= 54) return 22;
  if (maxSideIn <= 84) return 20;
  return 18;
}

// Pull a duct size out of a takeoff-line description.
// "Ductwork — 24x12 duct (supply)"      → { kind: 'rect',  w: 24, h: 12 }
// "Ductwork — 12" round duct (exhaust)" → { kind: 'round', dia: 12 }
// "Flex duct 8" runouts"                → { kind: 'flex',  dia: 8 }
export function parseDuctDesc(desc = '') {
  const s = String(desc).toLowerCase();
  if (!/duct/.test(s)) return null;
  if (/flex/.test(s)) {
    const m = s.match(/(\d+(?:\.\d+)?)\s*(?:"|″|in\b|inch)?/);
    return { kind: 'flex', dia: m ? parseFloat(m[1]) : 0 };
  }
  const rect = s.match(/(\d+(?:\.\d+)?)\s*(?:"|″|in)?\s*[x×]\s*(\d+(?:\.\d+)?)/);
  if (rect) return { kind: 'rect', w: parseFloat(rect[1]), h: parseFloat(rect[2]) };
  const round = s.match(/(\d+(?:\.\d+)?)\s*(?:"|″|in\b|inch(?:es)?)?\s*(?:ø|dia(?:meter)?\b|round|spiral)/);
  if (round) return { kind: 'round', dia: parseFloat(round[1]) };
  const roundPrefix = s.match(/[ø⌀]\s*(\d+(?:\.\d+)?)/);
  if (roundPrefix) return { kind: 'round', dia: parseFloat(roundPrefix[1]) };
  return null;
}

// What the run serves — decides whether it gets wrapped. Unknown service
// defaults to insulated (the bid should cover it; trimming is easy, adding
// a missed roll after award is not).
export function ductServiceOf(desc = '') {
  const s = String(desc).toLowerCase();
  if (/outside air|\boa\b|fresh air|make.?up air/.test(s)) return 'oa';
  if (/supply/.test(s)) return 'supply';
  if (/return/.test(s)) return 'return';
  if (/exhaust|relief/.test(s)) return 'exhaust';
  return '';
}

// runs: [{ desc, lf }]  (lf = linear feet the estimator scaled off the plan)
// opts: wastePct (scrap/seams/connectors on metal, default 15),
//       insulate 'supply' (supply + OA + unknown) | 'all' | 'none',
//       rollSqft (wrap roll coverage, default 100), jointFt (spiral joint, 10)
// Returns purchase lines with qty in BUY units, plus the raw rollups.
export function ductPurchase(runs, opts = {}) {
  const wastePct = opts.wastePct ?? 15;
  const insulate = opts.insulate ?? 'supply';
  const rollSqft = opts.rollSqft ?? 100;
  const jointFt = opts.jointFt ?? 10;

  const rectByGauge = {}; // gauge → raw lbs
  const spiralByDia = {}; // dia → raw lf
  let flexFt = 0;
  let wrapSqft = 0;

  runs.forEach(r => {
    const p = parseDuctDesc(r.desc);
    const lf = Number(r.lf) || 0;
    if (!p || lf <= 0) return;
    const svc = ductServiceOf(r.desc);
    const wrap = insulate === 'all' || (insulate === 'supply' && (svc === 'supply' || svc === 'oa' || svc === ''));
    if (p.kind === 'rect' && p.w > 0 && p.h > 0) {
      const g = gaugeForRect(Math.max(p.w, p.h));
      const perimFt = (2 * (p.w + p.h)) / 12;
      rectByGauge[g] = (rectByGauge[g] || 0) + perimFt * GALV_LB_SQFT[g] * lf;
      if (wrap) wrapSqft += perimFt * lf;
    } else if (p.kind === 'round' && p.dia > 0) {
      spiralByDia[p.dia] = (spiralByDia[p.dia] || 0) + lf;
      if (wrap) wrapSqft += (Math.PI * p.dia / 12) * lf;
    } else if (p.kind === 'flex') {
      flexFt += lf; // pre-insulated — never wrapped
    }
  });

  const waste = 1 + wastePct / 100;
  const lines = [];

  Object.entries(rectByGauge).sort((a, b) => Number(a[0]) - Number(b[0])).forEach(([g, lbs]) => {
    lines.push({
      desc: `Galvanized rectangular duct, ${g} ga — fabricated`,
      qty: Math.ceil(lbs * waste), unit: 'lb', defaultPrice: 4.5,
      notes: `${Math.round(lbs)} lbs calculated + ${wastePct}% seams/scrap`,
    });
  });
  Object.entries(spiralByDia).sort((a, b) => Number(a[0]) - Number(b[0])).forEach(([dia, lf]) => {
    const buyLf = Math.ceil((lf * waste) / jointFt) * jointFt; // whole joints
    lines.push({
      desc: `Spiral round duct, ${dia}" dia`,
      qty: buyLf, unit: 'ft', defaultPrice: Math.round(Number(dia) * 0.75 * 100) / 100,
      notes: `${buyLf / jointFt} × ${jointFt}' joints (${Math.round(lf)} ft takeoff + ${wastePct}%)`,
    });
  });
  if (flexFt > 0) {
    lines.push({
      desc: `Flex duct — 25' boxes`,
      qty: Math.ceil((flexFt * waste) / 25), unit: 'box', defaultPrice: 95,
      notes: `${Math.round(flexFt)} ft takeoff`,
    });
  }
  if (insulate !== 'none' && wrapSqft > 0) {
    const buySqft = wrapSqft * 1.15; // facing overlap + cuts
    lines.push({
      desc: `Duct wrap insulation, 1-1/2" FSK — ${rollSqft} sq ft rolls`,
      qty: Math.ceil(buySqft / rollSqft), unit: 'roll', defaultPrice: 115,
      notes: `${Math.round(wrapSqft)} sq ft duct surface + 15% overlap`,
    });
  }

  return { lines, rectByGauge, spiralByDia, flexFt, wrapSqft };
}
