// ── WHAT THE GLYCOL NUMBERS ARE STANDING ON ──────────────────────────────────
// This module exists because of a specific situation: an estimator bidding a
// secondary loop who has not run one before, working from an app whose glycol
// support was written in a day. Most of what the app computes is sound. Some of
// it is a placeholder wearing the same font as the sound parts, and that is the
// dangerous kind of number — it does not look like a guess.
//
// So every glycol figure gets labelled with WHERE IT CAME FROM, and the ones
// that can only come from the job's own paperwork say so plainly:
//
//   physics    — geometry and fluid properties. Gallons per foot of pipe, the
//                freeze point of a mix, the flow a load needs. These do not
//                drift and do not need checking.
//   yours      — derived from a number the estimator actually gave. The copper
//                table is scaled off their own 3/4" quote.
//   placeholder— a round trade number nobody here has quoted. Will be wrong by
//                some amount in any particular market.
//   submittal  — cannot be known from a drawing at all. Has to be read off the
//                equipment paperwork, and the app is guessing until it is.
//
// The last category is the one that changes a bid quietly, so it is reported
// even when nothing looks wrong.
//
// Pure — no React.

import { DEFAULT_FRICTION_PER_100FT, DEFAULT_FITTINGS_PCT, DEFAULT_PUMP_EFFICIENCY } from './glycolHydraulics.js';

export const DEFAULT_COMPONENT_HEAD_FT = 25;

// severity: 'blocker' (a number is missing and the bid is wrong without it),
// 'verify' (a real number that came from an assumption), 'fyi' (sound, said
// once so nobody goes looking for it).
export function reviewGlycolInputs(input = {}) {
  const {
    loopType = 'chilled', pct, protectTo, mix,
    coilGal = 0, tankGal = 0, fixtures = 0,
    btuh = 0, deltaT = 0, componentHeadFt = DEFAULT_COMPONENT_HEAD_FT,
    frictionPer100 = DEFAULT_FRICTION_PER_100FT,
    fittingsPct = DEFAULT_FITTINGS_PCT,
    efficiency = DEFAULT_PUMP_EFFICIENCY,
    longestPathFt = 0, velocityVerdict = null, runFt = 0,
  } = input;
  const out = [];
  const add = (severity, source, label, detail) => out.push({ severity, source, label, detail });
  const isWater = loopType === 'water';

  // ── Things only the paperwork knows ────────────────────────────────────────
  if (!(Number(coilGal) > 0)) {
    add('blocker', 'submittal', 'Coil + barrel fluid volume is 0',
      'The pipe is not the system. Case coils and the chiller barrel hold a real share of the charge, '
      + 'and at zero the glycol buy is short by that much. It is on the equipment submittals — nothing '
      + 'on a drawing gives it.');
  }
  if (!isWater && Number(componentHeadFt) === DEFAULT_COMPONENT_HEAD_FT) {
    add('verify', 'submittal', `Equipment head is the ${DEFAULT_COMPONENT_HEAD_FT} ft default`,
      'Pressure drop through the chiller heat exchanger, the case coils and the control valves. '
      + 'It is often the LARGER half of total head on a compact loop, and it comes off the submittals. '
      + 'Until it does, the pump size is a placeholder.');
  }
  if (!(Number(fixtures) > 0)) {
    add('blocker', 'submittal', 'No case or walk-in coil count',
      'Every fixture carries a valve set — on a fin-tube-style job that is the largest single line in '
      + 'the takeoff. Count them off the plan or the case schedule.');
  }

  // ── Things the spec states and the app should not invent ───────────────────
  if (!(Number(btuh) > 0)) {
    add('blocker', 'submittal', 'No load entered',
      'Without BTU/h there is no flow, no pump and no velocity check — only the material list.');
  }
  if (Number(btuh) > 0 && !(Number(deltaT) > 0)) {
    add('blocker', 'submittal', 'No ΔT entered',
      'Supply minus return, off the spec. Flow is inversely proportional to it, so a guess here scales '
      + 'the whole hydraulic side.');
  }
  if (mix && !mix.ok) {
    add('blocker', 'physics', `${pct}% glycol does not reach ${protectTo}°F`,
      `It freezes at ${mix.freeze}°F, which is ${Math.abs(mix.margin)}°F short. Raise the concentration.`);
  } else if (mix && mix.margin > 20) {
    add('verify', 'physics', `${pct}% is ${mix.margin}°F richer than the target needs`,
      'Over-mixing costs twice — more glycol to buy, and more pump horsepower forever after, because '
      + 'heat transfer drops and viscosity climbs. Check what the spec actually calls for.');
  }
  if (velocityVerdict && !velocityVerdict.ok) {
    add('blocker', 'physics', 'Main velocity is outside the 2–8 ft/s band',
      `${velocityVerdict.why}. This is a question for the engineer BEFORE the bid — if the main has to `
      + 'grow, the copper, the insulation and the fittings all grow with it.');
  }
  if (Number(longestPathFt) > 0 && Number(runFt) > 0 && Number(longestPathFt) >= Number(runFt)) {
    add('verify', 'physics', 'Longest path is as long as all the pipe entered',
      'Head comes off the CRITICAL CIRCUIT — out to the furthest case and back — not the total pipe in '
      + 'the building, which is in parallel with it. Feeding total footage in is how a 7.5 HP job sizes '
      + 'a 20 HP motor.');
  }

  // ── Estimating assumptions that are defensible but still assumptions ───────
  if (!isWater) {
    add('verify', 'placeholder', 'Fluid, insulation and valve prices are placeholders',
      'Nothing here is anchored to a quote. Glycol concentrate, closed-cell insulation, balance valves, '
      + 'circuit setters and solenoids are all round trade numbers. Correct any one of them and the '
      + 'price book keeps it for good.');
  }
  if (Number(frictionPer100) === DEFAULT_FRICTION_PER_100FT
      || Number(fittingsPct) === DEFAULT_FITTINGS_PCT
      || Number(efficiency) === DEFAULT_PUMP_EFFICIENCY) {
    add('fyi', 'placeholder', 'Head is estimated on standard design assumptions',
      `${frictionPer100} ft per 100 ft of friction, +${fittingsPct}% developed length for fittings, `
      + `${Math.round(efficiency * 100)}% pump efficiency. Normal for an estimate; the engineer's `
      + 'selection is the number that governs.');
  }

  // ── Sound, and worth saying once ───────────────────────────────────────────
  add('fyi', 'physics', 'Volume, freeze point and flow are computed, not guessed',
    'Gallons per foot is pipe geometry, the freeze curve is published fluid data, and flow follows from '
    + 'the load. These do not go stale and do not need checking.');
  add('fyi', 'yours', 'Copper is scaled off your own quote',
    'The whole copper table rides on the 3/4" figure you gave, by weight of metal. Change that one '
    + 'number and every size moves with it.');

  return out;
}

// A one-line read for the card header.
export function reviewSummary(items = []) {
  const b = items.filter(i => i.severity === 'blocker').length;
  const v = items.filter(i => i.severity === 'verify').length;
  if (b) return { tone: 'blocker', text: `${b} number(s) missing that the bid needs${v ? `, ${v} to verify` : ''}` };
  if (v) return { tone: 'verify', text: `${v} assumption(s) worth verifying before this goes out` };
  return { tone: 'ok', text: 'Nothing outstanding — every input is entered or computed' };
}
