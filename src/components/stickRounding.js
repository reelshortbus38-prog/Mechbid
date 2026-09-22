// ── YOU BUY WHOLE STICKS ────────────────────────────────────────────────────
// "So after all copper lengths are gathered from drops-main pipe run-case tops
//  the number needs to round up to the nearest 20."
//
// This is the THIRD rounding in the app and it is not either of the other two,
// which is the whole reason it needs its own pass:
//
//   RISERS round per circuit, in copperRates.js. A 12 ft riser takes a whole
//   stick and the 8 ft offcut will not make another 12 ft riser, so pooling
//   them would quietly assume the scraps add up.
//
//   LONG RUNS are not rounded at all at the line. A 150 ft main is cut from
//   sticks end to end and the waste factor covers the joint offcuts.
//
//   THE PURCHASE is what this is. Every foot of hard copper at one size, from
//   every part of the job — main run, case drops, case tops, spare drops —
//   comes off the same pile of sticks, and the pile is bought in twenties. The
//   takeoff can land on 73 ft; the order cannot.
//
// It pools ACROSS sections deliberately. Rounding each line to 20 would buy a
// stick for a 5 ft case drop and another for a 7 ft jog, which is three sticks
// where the job takes one.
//
// SOFT COPPER IS NOT IN THIS. It is coil — cut to length, no sticks — and the
// in-floor lines that use it are already excluded from every stick calculation
// in the app.
//
// Pure — no React, no store.
import { HARD_STICK_FT } from './copperRates.js';

// A line whose footage comes off the stick pile. Insulation carries a pipeSize
// too and is bought by the foot, so the test is what the line IS.
export function isHardCopperLine(line) {
  if (!line || line.softCopper) return false;
  if (!line.pipeSize) return false;
  return line.section === 'Copper' || line.material === 'copper';
}

// → [{ pipeSize, takeoffFt, sticks, purchaseFt, addFt }], only for the sizes
// that do not already land on a whole stick.
export function stickRounding(lines = [], stickFt = HARD_STICK_FT) {
  const stick = Number(stickFt) > 0 ? Number(stickFt) : HARD_STICK_FT;
  const bySize = new Map();
  for (const l of lines || []) {
    if (!isHardCopperLine(l)) continue;
    const ft = Number(l.qty) || 0;
    if (ft <= 0) continue;
    bySize.set(l.pipeSize, (bySize.get(l.pipeSize) || 0) + ft);
  }
  const out = [];
  for (const [pipeSize, takeoffFt] of bySize) {
    const sticks = Math.ceil(takeoffFt / stick);
    const purchaseFt = sticks * stick;
    const addFt = purchaseFt - takeoffFt;
    // A size already on a whole stick needs no line. Pushing a zero would put
    // a row on the bid that says nothing and prices nothing.
    if (addFt <= 0) continue;
    out.push({ pipeSize, takeoffFt, sticks, purchaseFt, addFt });
  }
  return out;
}

export function roundingNote({ pipeSize, takeoffFt, sticks, purchaseFt }, stickFt = HARD_STICK_FT) {
  return `takeoff is ${takeoffFt} ft of ${pipeSize}" across every line on this job — drops, run, `
    + `case tops and spares. Hard copper comes in ${stickFt} ft lengths, so the order is `
    + `${sticks} stick(s) = ${purchaseFt} ft.`;
}
