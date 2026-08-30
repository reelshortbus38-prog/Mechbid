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
// ERROR THREE — A MARKED ROW WITH NO NEW COPPER WAS DROPPED IN SILENCE.
// On 701 five circuits have the case columns highlighted and the line-size
// cells deliberately left clean: Beer Doors 40-43 N87, Produce Doors N70/N71,
// Frozen Food 50/51, Frozen Food 66/67, Frozen Bakery 14. Three carry N-tags,
// which are NEW CASES. The tech was being precise — a new case going onto pipe
// that already exists is not a new line run — but it is still a case to set,
// connect, evacuate and charge.
//
// Excluding them from the circuit count is right. Excluding them without a word
// is not: five circuits of case work would leave the takeoff with nothing on
// screen to say so.
//
// CommonJS, matching the Vercel function that uses it.

// New copper, stated as text.
const NEW_COPPER_TEXT = /^New\s+(Piping(\s+Line)?|Circuit|Install)\b/i;
// A new heat exchanger and nothing more.
const NEW_COIL_TEXT = /^NEW$|^New\s+Coil\b/i;

// horizMarked  — suction-horizontal OR liquid-horizontal is highlighted/shaded
// riserMarked  — the suction-riser cell is highlighted/shaded
// appMarked — the Application cell is highlighted, i.e. the tech marked this
//              row as changed in some way. Asked separately from the line
//              sizes, because "this circuit changed" and "this circuit needs
//              new pipe" are different claims and the sheet distinguishes them.
function classifyBprRow({
  horizMarked = false, riserMarked = false, appMarked = false,
  heatExchanger = '', allNew = false,
} = {}) {
  if (allNew) return { include: true, riserOnly: false, category: 'new', reason: 'new store' };

  if (horizMarked || riserMarked) {
    const riserOnly = riserMarked && !horizMarked;
    return {
      include: true,
      // Only the drop is new copper; the horizontal run is already there.
      riserOnly,
      category: riserOnly ? 'riserOnly' : 'new',
      reason: 'highlighted',
    };
  }

  const he = String(heatExchanger || '').trim();
  if (NEW_COPPER_TEXT.test(he)) {
    return { include: true, riserOnly: false, category: 'new', reason: `text: ${he}` };
  }
  if (NEW_COIL_TEXT.test(he)) {
    return {
      include: false, riserOnly: false, category: 'coilOnly', coilOnly: true,
      reason: 'new heat exchanger only — coil, not copper',
    };
  }
  if (appMarked) {
    return {
      include: false, riserOnly: false, category: 'markedNoCopper', markedNoCopper: true,
      reason: 'marked as changed, but no line size is marked — work on existing pipe',
    };
  }
  return { include: false, riserOnly: false, category: 'none', reason: '' };
}

module.exports = { classifyBprRow, NEW_COPPER_TEXT, NEW_COIL_TEXT };
