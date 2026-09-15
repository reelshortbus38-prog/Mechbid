// ── A NUMBER SOMEBODY TYPED, AND A NUMBER NOBODY TYPED ───────────────────────
// `state.markupPct || 20` reads a blank field as 20%, which is right. It also
// reads a typed **0** as 20%, because 0 is falsy and `||` cannot tell "nobody
// said" from "somebody said none."
//
// Zero is an answer on every one of these. A contractor bidding at cost plus a
// fixed fee sets markup to 0. A shop that buys exact lengths sets waste to 0. A
// shop that passes fittings through at cost sets the fitting markup to 0. Those
// are not mistakes to be corrected; they are how those shops bid, and the app
// is meant for shops that are not the one it was written with.
//
// THE APP ALREADY KNEW THIS. equipMarkupPct and subMarkupPct on the Proposal
// step read `?? ''` and write `parseFloat(v) || 0`, so a zero sticks. So does
// the scenario card's own markup box. It is the MAIN markup — the largest lever
// in the bid — that could not be zeroed, and the disagreement was live:
//
//   state.markupPct === 0
//   Proposal step   → computeBidTotals(state, scenario.markupPct)  → 0%
//   Materials step  → computeBidTotals(state, state.markupPct||20) → 20%
//
// On a hundred thousand dollars of material that is twenty thousand dollars,
// and the two screens showed it at the same time.
//
// Pure — no React.

// The number if one was given, the fallback if none was. A typed 0 is a number.
export function numberOr(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  // Not a number is not an answer either — a half-typed "-" or "1e" must not
  // silently price the job at NaN.
  return Number.isFinite(n) ? n : fallback;
}

// The same, for a percentage: never negative, because a negative markup or a
// negative waste factor is a typo rather than a bid.
export function pctOr(value, fallback = 0) {
  return Math.max(0, numberOr(value, fallback));
}

// What a number input should show. Keeps a typed 0 on screen — `value={x || 20}`
// redisplayed a stored 0 as 20, the app overwriting an answer it had just been
// given — and leaves a cleared box cleared so it can be typed in.
export function fieldValue(value) {
  return value === undefined || value === null ? '' : value;
}

// What a number input should store. An empty box stays empty rather than
// becoming 0, so clearing it to retype does not price the job at zero on the
// way through; every reader supplies its own default for the empty case.
export function fieldNumber(raw) {
  if (raw === '') return '';
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : '';
}
