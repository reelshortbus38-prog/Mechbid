// ── WHICH BPR ROWS ARE NEW COPPER ────────────────────────────────────────────
// Validated against FL 701, where the estimator's own count was ten new
// circuits and one riser-only. The parser said fifteen. Both errors were in
// this decision.
//
// ERROR ONE — A NEW HEAT EXCHANGER IS NOT A NEW CIRCUIT.
// The column is labelled "Heat Exchr.", and a bare "NEW" in it means a new
// EVAPORATOR COIL: the coil is replaced, the pipe that feeds it is not. On 701
// four rows carry it — Deli Cooler, Meat Cooler, Tray Cooler, Dairy Cooler —
// and the scope of work independently names those same four as "NEW EVAPORATOR
// COILS". None of the four has a single highlighted line-size cell, because
// none of them is new copper. Counting them as circuits put four line runs and
// their footage into a takeoff that should not have had them.
//
// "New Piping", "New Circuit" and "New Install" in that column DO mean new
// copper and are kept — different techs mark new work differently, and dropping
// the text signal entirely would lose the ones that are real.
//
// The coil rows are not discarded silently. They are real work — a coil and the
// labor to set it — so they come back as `coilOnly` for the caller to surface.
// A row that vanishes without a word is how a bid loses scope.
//
// ERROR TWO — RISER-ONLY WAS THE WRONG TEST.
// parseBPR asked "is there no run length?", which is never true on a sheet that
// fills the run column in for every row. The Kysor parser already had the right
// rule and it was not shared: the RISER cell is highlighted and the HORIZONTAL
// cells are not, meaning the horizontal pipe already exists and only the drop is
// new. On 701 that is Deli/Bakery 10-12 — suction riser marked, suction and
// liquid horizontals clear — and it is the one riser-only circuit on the job.
//
// CommonJS, matching the Vercel function that uses it.

// New copper, stated as text.
const NEW_COPPER_TEXT = /^New\s+(Piping(\s+Line)?|Circuit|Install)\b/i;
// A new heat exchanger and nothing more.
const NEW_COIL_TEXT = /^NEW$|^New\s+Coil\b/i;

// horizMarked  — suction-horizontal OR liquid-horizontal is highlighted/shaded
// riserMarked  — the suction-riser cell is highlighted/shaded
function classifyBprRow({ horizMarked = false, riserMarked = false, heatExchanger = '', allNew = false } = {}) {
  if (allNew) return { include: true, riserOnly: false, reason: 'new store' };

  if (horizMarked || riserMarked) {
    return {
      include: true,
      // Only the drop is new copper; the horizontal run is already there.
      riserOnly: riserMarked && !horizMarked,
      reason: 'highlighted',
    };
  }

  const he = String(heatExchanger || '').trim();
  if (NEW_COPPER_TEXT.test(he)) {
    return { include: true, riserOnly: false, reason: `text: ${he}` };
  }
  if (NEW_COIL_TEXT.test(he)) {
    return { include: false, riserOnly: false, coilOnly: true, reason: 'new heat exchanger only — coil, not copper' };
  }
  return { include: false, riserOnly: false, reason: '' };
}

module.exports = { classifyBprRow, NEW_COPPER_TEXT, NEW_COIL_TEXT };
