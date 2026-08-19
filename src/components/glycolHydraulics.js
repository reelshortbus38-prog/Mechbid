// ── FLOW AND PUMP SIZING FOR A GLYCOL LOOP ───────────────────────────────────
// The material side of a secondary loop was already covered; the HYDRAULICS
// were not, and they decide two things an estimator has to price: how much
// pump, and how much electrical service behind it.
//
// THIS IS AN ESTIMATING TOOL, NOT A DESIGN TOOL. The engineer of record sizes
// the pump. What this does is get close enough to select a plausible unit and
// price it, and — more usefully — to notice when the pipe on the drawing cannot
// carry the flow the load needs, which is a question to ask before bidding
// rather than after.
//
// GLYCOL IS NOT WATER, AND THE FAMILIAR CONSTANT IS A WATER CONSTANT.
// The rule everyone carries is GPM = BTU/hr ÷ (500 × ΔT). That 500 is
// 60 min/hr × 8.34 lb/gal × 1.00 Btu/lb·°F — pure water. Propylene glycol is
// denser but holds noticeably less heat per pound, and the second effect wins:
// the constant drops, so the SAME load needs MORE flow. At 35% it is about 466
// rather than 500, which is roughly 7% more gallons a minute for nothing in
// return, and it compounds into pipe size and pump horsepower.
//
// Pure — no React.

// 60 × density(lb/gal) × specific heat(Btu/lb·°F), by volume percent, near the
// 20-30°F a medium-temp loop actually runs at. Water's 500 is the 0% row.
export const FLOW_CONSTANT = { 0: 500, 20: 485, 25: 480, 30: 475, 35: 466, 40: 458, 50: 446 };

// Cold glycol is thicker than water, so it costs more head over the same pipe.
// Applied to the friction estimate, not to the flow.
export const VISCOSITY_FACTOR = { 0: 1.0, 20: 1.10, 25: 1.14, 30: 1.18, 35: 1.22, 40: 1.28, 50: 1.40 };

// Specific gravity — pump horsepower moves the weight of the fluid, so a
// glycol loop needs a little more than water for the same flow and head.
export const SPECIFIC_GRAVITY = { 0: 1.0, 20: 1.015, 25: 1.020, 30: 1.026, 35: 1.031, 40: 1.036, 50: 1.046 };

function interp(table, pct) {
  const p = Number(pct);
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
  if (!Number.isFinite(p)) return null;
  if (p <= keys[0]) return table[keys[0]];
  if (p >= keys[keys.length - 1]) return table[keys[keys.length - 1]];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (p >= a && p <= b) {
      const t = (p - a) / (b - a);
      return table[a] + t * (table[b] - table[a]);
    }
  }
  return null;
}

export const flowConstant = pct => interp(FLOW_CONSTANT, pct);
export const viscosityFactor = pct => interp(VISCOSITY_FACTOR, pct);
export const specificGravity = pct => interp(SPECIFIC_GRAVITY, pct);

// GPM = load ÷ (constant × ΔT). Returns null rather than a number when either
// input is missing — a flow figure computed from an assumed ΔT is worse than no
// flow figure, because it looks like an answer.
export function glycolGpm(btuh, deltaT, pct = 35) {
  const q = Number(btuh), dt = Number(deltaT), k = flowConstant(pct);
  if (!(q > 0) || !(dt > 0) || !k) return null;
  return Math.round((q / (k * dt)) * 10) / 10;
}

// What the same load would need on water, so the glycol penalty is visible
// rather than buried in a constant.
export function waterGpm(btuh, deltaT) {
  const q = Number(btuh), dt = Number(deltaT);
  if (!(q > 0) || !(dt > 0)) return null;
  return Math.round((q / (500 * dt)) * 10) / 10;
}

// ── VELOCITY, WHICH IS THE CHECK THAT MATTERS ────────────────────────────────
// Hydronic practice keeps velocity roughly between 2 and 8 ft/s: under 2 and
// air will not sweep out of the mains, over 8 and it erodes fittings and sings
// through the ceiling of a grocery store. A size that fails this is a question
// for the engineer BEFORE the bid.
export const VELOCITY_MIN = 2, VELOCITY_MAX = 8;

// Inside area in square feet, from the same geometry the volume table uses.
const areaSqFt = idInches => Math.PI * Math.pow((Number(idInches) || 0) / 24, 2);

// gpm → ft/s. idInches is the pipe's INSIDE diameter.
export function velocityFtSec(gpm, idInches) {
  const a = areaSqFt(idInches);
  if (!(a > 0) || !(Number(gpm) > 0)) return null;
  // 1 gal = 0.133681 ft³, per minute → per second.
  return Math.round(((Number(gpm) * 0.133681) / 60 / a) * 100) / 100;
}

export function velocityVerdict(v) {
  if (v === null) return null;
  if (v < VELOCITY_MIN) return { ok: false, why: 'below 2 ft/s — air will not sweep out of the line' };
  if (v > VELOCITY_MAX) return { ok: false, why: 'above 8 ft/s — erosion and noise; size up' };
  return { ok: true, why: 'within the 2–8 ft/s band hydronic practice keeps to' };
}

// ── HEAD AND HORSEPOWER ──────────────────────────────────────────────────────
// Friction head is estimated the way a takeoff estimates it: a design friction
// rate over the developed length, with fittings carried as a percentage of
// straight pipe rather than counted one by one. Components — the chiller
// barrel, the case coils, the control valves — are their own number and come
// off the submittals, because nothing about the pipe predicts them.
export const DEFAULT_FRICTION_PER_100FT = 3;   // ft of head per 100 ft, typical design
export const DEFAULT_FITTINGS_PCT = 50;        // equivalent length added for fittings
export const DEFAULT_PUMP_EFFICIENCY = 0.65;

// longestPathFt is the CRITICAL CIRCUIT — out to the furthest case and back —
// NOT the total pipe in the building. A pump only has to overcome the worst
// path; the rest of the loop is in parallel with it. Feeding total footage in
// here is the classic way to size a 20 HP motor for a 7.5 HP job.
export function pumpHead(longestPathFt, {
  frictionPer100 = DEFAULT_FRICTION_PER_100FT,
  fittingsPct = DEFAULT_FITTINGS_PCT,
  componentHeadFt = 0,
  pct = 35,
} = {}) {
  const L = Number(longestPathFt) || 0;
  if (L <= 0 && !(Number(componentHeadFt) > 0)) return null;
  const developed = L * (1 + (Number(fittingsPct) || 0) / 100);
  const friction = developed * ((Number(frictionPer100) || 0) / 100) * (viscosityFactor(pct) || 1);
  const total = friction + (Number(componentHeadFt) || 0);
  return {
    developedFt: Math.round(developed),
    frictionFt: Math.round(friction * 10) / 10,
    componentFt: Number(componentHeadFt) || 0,
    totalFt: Math.round(total * 10) / 10,
  };
}

// Brake horsepower at the shaft. NEMA sizes exist because you cannot buy 2.3 hp.
export const NEMA_HP = [1 / 6, 1 / 4, 1 / 3, 1 / 2, 3 / 4, 1, 1.5, 2, 3, 5, 7.5, 10, 15, 20, 25, 30, 40, 50];

// ── THE MOTOR YOU BUY IS NOT THE NEXT SIZE ABOVE BHP ─────────────────────────
// This module used to hand back the first NEMA frame that cleared the computed
// brake horsepower, which is arithmetically tidy and wrong at the counter.
// Engineers select pumps NON-OVERLOADING: the motor has to carry the shaft load
// anywhere on the curve, not only at the design point. Ride out to runout — a
// balance valve open further than designed, a filter clean instead of loaded —
// and bhp climbs past where it sat on the schedule. A motor picked to just clear
// the design point trips on the day the system is at its best.
//
// CALIBRATED AGAINST A REAL SCHEDULE. Edmonds SD College Place, hydronic pump
// schedule, two independent selections by the engineer of record:
//
//   HWP-01  276 GPM @ 83 ft,  78% eff, water     → 7.42 bhp, scheduled 10 HP
//   CWP-01  455 GPM @ 125 ft, 75% eff, 20% PG    → 19.44 bhp, scheduled 25 HP
//
// The bare next-size answer is 7.5 and 20 — one frame light in both cases. A
// 15% margin ahead of the frame lookup reproduces both selections exactly.
//
// This matters past the pump itself: the motor size drives the VFD, the starter,
// the feeder and the breaker. Two data points from one engineer is thin
// calibration, so both figures come back and the caller shows the gap.
export const NON_OVERLOADING_MARGIN = 0.15;

export const nemaAtLeast = hp => NEMA_HP.find(x => x >= hp) ?? NEMA_HP[NEMA_HP.length - 1];

export function pumpHorsepower(gpm, headFt, {
  pct = 35, efficiency = DEFAULT_PUMP_EFFICIENCY, margin = NON_OVERLOADING_MARGIN,
} = {}) {
  const g = Number(gpm), h = Number(headFt), e = Number(efficiency);
  if (!(g > 0) || !(h > 0) || !(e > 0)) return null;
  const bhp = (g * h * (specificGravity(pct) || 1)) / (3960 * e);
  const m = Number(margin) >= 0 ? Number(margin) : NON_OVERLOADING_MARGIN;
  return {
    bhp: Math.round(bhp * 100) / 100,
    // What you buy.
    motorHp: nemaAtLeast(bhp * (1 + m)),
    // The frame that merely clears the design point — kept so the difference is
    // visible rather than folded away, and so a bare selection can be spotted.
    minMotorHp: nemaAtLeast(bhp),
    marginPct: Math.round(m * 100),
  };
}

// One call for the card: load and ΔT in, flow, head, horsepower out.
// Anything it cannot compute comes back null rather than zero — a zero reads
// like an answer and this must never pretend to be one.
export function glycolHydraulics({
  btuh, deltaT, pct = 35, longestPathFt = 0, idInches = 0,
  frictionPer100 = DEFAULT_FRICTION_PER_100FT,
  fittingsPct = DEFAULT_FITTINGS_PCT,
  componentHeadFt = 0,
  efficiency = DEFAULT_PUMP_EFFICIENCY,
  redundant = true,
} = {}) {
  const gpm = glycolGpm(btuh, deltaT, pct);
  const onWater = waterGpm(btuh, deltaT);
  const head = pumpHead(longestPathFt, { frictionPer100, fittingsPct, componentHeadFt, pct });
  const hp = gpm && head ? pumpHorsepower(gpm, head.totalFt, { pct, efficiency }) : null;
  const vel = velocityFtSec(gpm, idInches);
  return {
    gpm,
    waterGpm: onWater,
    extraFlowPct: gpm && onWater ? Math.round((gpm / onWater - 1) * 1000) / 10 : null,
    head,
    hp,
    velocity: vel,
    velocityVerdict: velocityVerdict(vel),
    // The spec calls for dual redundant pumps; you buy two and run one.
    pumpCount: redundant ? 2 : 1,
  };
}
