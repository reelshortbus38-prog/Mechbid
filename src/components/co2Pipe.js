// ── HIGH-PRESSURE PIPE ON A TRANSCRITICAL CO₂ JOB ────────────────────────────
// The app already switched the LABEL to K65 when the job is set to CO₂, and
// added the high-pressure fittings line. It kept pricing the pipe at the ACR
// copper rate, so a transcritical job read as a standard job wearing a
// different name — and K65 is not priced like ACR copper.
//
// WHY THE WHOLE SYSTEM, NOT JUST THE DISCHARGE SIDE. It is tempting to rate only
// the gas cooler and flash-gas lines for high pressure, because those are what
// run transcritical in operation. The design driver is STANDING pressure: a
// transcritical system sitting off at ambient equalizes across the whole
// circuit, and CO₂'s saturation pressure at a warm plant room is well over
// 1,000 psi. That is why suction lines get K65 too. Rating only the hot side
// under-buys the specialty pipe on the majority of the footage.
//
// K65 is a copper-iron alloy (CuFe2P) rated around 120 bar. It is BRAZED, with
// silver filler and a hotter, tighter procedure than ACR copper — it is NOT
// welded. Stainless sections on some designs are welded, and that is a
// different trade at a different rate. Estimating the whole job as "high
// pressure welding" prices brazing labor as pipefitting and lands nowhere near
// the real number, so the generated line says which is which.
//
// The multiplier is a MULTIPLIER on purpose. Nobody here has a K65 quote, and
// the alloy moves with the copper market plus a specialty-distribution premium
// — so it rides on whatever ACR rate the estimator has already tuned, instead
// of being a second absolute price that goes stale on its own schedule.

// Roughly what K65 tube runs against ACR copper of the same size. A starting
// point to be replaced by a real quote, not a researched figure.
export const DEFAULT_HP_PIPE_MULTIPLIER = 2.0;

export const isHighPressureSystem = systemType => String(systemType || '') === 'CO2';

// baseRate: the estimator's tuned ACR copper rate for this size.
export function hpPipeRate(baseRate, systemType, multiplier = DEFAULT_HP_PIPE_MULTIPLIER) {
  const base = Number(baseRate) || 0;
  if (!isHighPressureSystem(systemType)) return base;
  const m = Number(multiplier);
  // A missing or nonsense multiplier must never silently zero the pipe — that
  // is the exact failure this file exists to fix, in the other direction.
  if (!(m > 0)) return base;
  return Math.round(base * m * 100) / 100;
}

// What to say on the line, so a doubled rate is never a mystery.
export function hpPipeNote(systemType, multiplier = DEFAULT_HP_PIPE_MULTIPLIER) {
  if (!isHighPressureSystem(systemType)) return '';
  return `K65 priced at ${multiplier}× the ACR copper rate — PLACEHOLDER premium, get a quote. `
    + 'Rated for standing pressure across the whole system, not just the transcritical side. '
    + 'K65 is BRAZED (silver filler, hotter procedure than ACR) — price brazing labor, not welding; '
    + 'only stainless sections are welded.';
}
