// ── REFRIGERANT CHARGE CALCULATOR ────────────────────────────────────────────
// Estimates the refrigerant pounds a remodel adds, straight from the circuit
// takeoff — the number Food Lion bid letters require ("add your refrigerant
// pounds in the notes"). Physics, not guesswork:
//
//   liquid-line lbs  = internal pipe volume × liquid density   (the big term —
//                      the liquid line is full of dense liquid)
//   suction-line lbs = internal volume × suction VAPOR density (small; vapor
//                      is ~40× lighter than liquid)
//   + case-coil allowance (each new evap coil holds a few lb)
//   + top-off % (flush, receiver level, trim charge)
//
// Densities are ballpark saturated values at typical operating conditions —
// deliberately conservative round numbers, editable at the call site. This is
// a BID quantity, not a commissioning charge sheet.

import { normalizePipeSize } from '../state/store.js';

// ACR copper internal diameters (inches) by nominal OD size.
const ACR_ID = {
  '1/4': 0.190, '3/8': 0.311, '1/2': 0.436, '5/8': 0.555, '7/8': 0.785,
  '1-1/8': 1.025, '1-3/8': 1.265, '1-5/8': 1.505, '2-1/8': 1.985,
  '2-5/8': 2.465, '3-1/8': 2.945,
};

// Liquid density (lb/ft³) at ~100°F condensing, by refrigerant.
export const REFRIGERANTS = {
  'R-448A': { liquid: 60, note: 'Solstice N40 — common Food Lion remodel gas' },
  'R-449A': { liquid: 60, note: 'Opteon XP40' },
  'R-407A': { liquid: 62, note: '' },
  'R-404A': { liquid: 56, note: 'legacy — being phased down' },
  'R-507':  { liquid: 56, note: 'legacy' },
  'R-22':   { liquid: 66, note: 'legacy service only' },
  'R-744 (CO2)': { liquid: 44, note: 'transcritical — verify with rack OEM, charge behaves differently' },
};

// Suction VAPOR density (lb/ft³) by temp type — low-temp suction runs deeper
// vacuum/lower density than medium temp.
const SUCTION_VAPOR = { medium: 1.6, low: 0.9 };

function lbPerFt(size, density) {
  const id = ACR_ID[normalizePipeSize(size)] || 0;
  if (!id || !density) return 0;
  const areaFt2 = (Math.PI / 4) * Math.pow(id / 12, 2);
  return areaFt2 * density;
}

// circuits: the takeoff rows (runLength, riserLength, liqHoriz, sucHoriz,
// sucRiser, tempType, isRiserOnly). opts: { refrigerant, newCases, lbPerCase,
// topOffPct }. Returns per-component pounds + total, rounded to 1 lb.
export function estimateRefrigerantLbs(circuits, opts = {}) {
  const refrigerant = opts.refrigerant || 'R-448A';
  const liqDensity = (REFRIGERANTS[refrigerant] || REFRIGERANTS['R-448A']).liquid;
  const newCases = parseFloat(opts.newCases) || 0;
  const lbPerCase = opts.lbPerCase != null ? (parseFloat(opts.lbPerCase) || 0) : 3;
  const topOffPct = opts.topOffPct != null ? (parseFloat(opts.topOffPct) || 0) : 10;

  let liquidLbs = 0, suctionLbs = 0;
  (circuits || []).forEach(c => {
    const run = parseFloat(c.runLength) || 0;
    const riser = parseFloat(c.riserLength) || 0;
    const vapor = SUCTION_VAPOR[c.tempType === 'low' ? 'low' : 'medium'];
    if (c.isRiserOnly) {
      if (c.liqHoriz) liquidLbs += riser * lbPerFt(c.liqHoriz, liqDensity);
      if (c.sucRiser) suctionLbs += riser * lbPerFt(c.sucRiser, vapor);
      return;
    }
    // Liquid line runs the full path (horizontal + riser) at the liquid size.
    if (c.liqHoriz) liquidLbs += (run + riser) * lbPerFt(c.liqHoriz, liqDensity);
    if (c.sucHoriz) suctionLbs += run * lbPerFt(c.sucHoriz, vapor);
    if (c.sucRiser) suctionLbs += riser * lbPerFt(c.sucRiser, vapor);
  });

  const casesLbs = newCases * lbPerCase;
  const base = liquidLbs + suctionLbs + casesLbs;
  const topOffLbs = base * (topOffPct / 100);
  const r = n => Math.round(n * 10) / 10;
  return {
    refrigerant,
    liquidLbs: r(liquidLbs),
    suctionLbs: r(suctionLbs),
    casesLbs: r(casesLbs),
    topOffLbs: r(topOffLbs),
    total: Math.round(base + topOffLbs),
  };
}
