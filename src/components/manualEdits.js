// ── A NUMBER SOMEBODY TYPED IS NOT THE ANALYZER'S TO THROW AWAY ─────────────
// Re-analyzing a file REPLACES that file's takeoff lines — it has to, or every
// re-read stacks a second takeoff on the first. But replacement deletes the
// row, and with it anything a human had corrected on that row.
//
// Half of this was already noticed and fixed: a unit cost the estimator typed
// is carried across the replacement, because resetting a job to $0 on a re-read
// was obviously wrong. The other half was not. QUANTITY is editable in the
// same table, and quantity is where field knowledge lands — somebody walks the
// route, finds the sheet says 220 ft and the building says 260, and corrects
// it. Re-analyze that sheet and it silently goes back to 220. The unit is the
// same story: a line the analyzer called 'ea' that is really bought by the
// foot goes back to 'ea'.
//
// WHY PER FIELD AND NOT A PER-ROW FLAG. The obvious design is one boolean —
// "this row was touched, leave it alone." It is worse. The app gets better at
// reading sheets over time, and a row frozen because somebody fixed its
// quantity would never again accept an improved description or a corrected
// size. Per field, the correction survives AND the better read still lands on
// the parts nobody touched. The two are not in conflict and should not be
// made to fight.
//
// WHAT IS DELIBERATELY NOT HERE: derived numbers. Labor hours and bid totals
// are computed on every render from the circuit list — estimateCircuitLabor
// and computeBidTotals are called inline, never stored — so there is no
// recalculation that could overwrite them and nothing here to protect. This
// module is only about values a person typed into a row that a re-read will
// delete.
//
// Pure — no React, no store.

// The fields worth carrying across a re-read. Description is NOT one of them,
// and that is a limit rather than a decision: the old row is matched to the
// incoming row BY its normalized description, so a row whose description was
// edited cannot be found again. Carrying an edited description would need a
// stable identity that survives re-reading, which a regenerated line does not
// have.
export const CARRIED_FIELDS = ['qty', 'unit', 'unitCost'];

// Record that a person changed this field. Only meaningful on a row that came
// from a file — a hand-added row has no `src` and is never replaced anyway —
// but marking either is harmless and keeps the caller simple.
export function markEdited(row, field) {
  if (!row || !CARRIED_FIELDS.includes(field)) return row;
  const seen = new Set(row.editedFields || []);
  if (seen.has(field)) return row;
  seen.add(field);
  return { ...row, editedFields: [...seen] };
}

export function isEdited(row, field) {
  return !!(row && Array.isArray(row.editedFields) && row.editedFields.includes(field));
}

// What to rescue from a row that is about to be replaced.
// → a patch of field → value, empty when there is nothing worth keeping.
export function rescuedEdits(row) {
  const out = {};
  if (!row) return out;

  // A price typed before editedFields existed carries no mark, but it is still
  // the estimator's number. This was the original rule and jobs saved under it
  // must keep behaving exactly as they did.
  if (Number(row.unitCost) > 0) out.unitCost = Number(row.unitCost);

  for (const f of CARRIED_FIELDS) {
    if (!isEdited(row, f)) continue;
    const v = row[f];
    if (v === undefined || v === null || v === '') continue;
    out[f] = v;
  }
  return out;
}

// Lay a rescued patch over a freshly-read line, and keep `total` honest —
// it is qty × unitCost and must not survive as a stale product of the two
// numbers it was computed from.
export function applyRescued(line, rescued) {
  if (!line) return line;
  const patch = rescued || {};
  if (!Object.keys(patch).length) return line;
  const out = { ...line, ...patch };
  out.total = (Number(out.qty) || 0) * (Number(out.unitCost) || 0);
  // The marks travel with the values, so a second re-read keeps them too.
  const carried = CARRIED_FIELDS.filter(f => Object.prototype.hasOwnProperty.call(patch, f)
    && f !== 'unitCost');
  const priceWasMarked = Object.prototype.hasOwnProperty.call(patch, 'unitCost')
    && (line.editedFields || []).includes('unitCost');
  const marks = new Set([...(line.editedFields || []), ...carried]);
  if (priceWasMarked) marks.add('unitCost');
  if (marks.size) out.editedFields = [...marks];
  return out;
}
