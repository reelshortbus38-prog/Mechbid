// ── DRIP PANS ───────────────────────────────────────────────────────────────
// "Drip pans. They are only used above sales floor and any drop ceilings. The
//  specs say no larger than 16" wide pans and they are 8' long made from sheet
//  metal."
//
// They were on no list. A pan catches what comes off a cold line before it
// lands on product, a customer, or a finished ceiling tile, and a store has
// hundreds of feet of them.
//
// ── THEY FOLLOW THE ROUTE, NOT THE FOOTAGE ──────────────────────────────────
// This is the trapeze problem again and it has the same answer. A pan sits
// UNDER the pipe, so one run of pans catches whatever is above it — eleven
// circuits down the same back hall need one line of pans, not eleven. Summing
// circuit footage would buy eleven times what the job takes, which is exactly
// the mistake hangers.js was written to stop.
//
// So the quantity comes off the ROUTE: the longest run, or the header if there
// is one, which hangerBasis already works out for the trapezes.
//
// ── AND ONLY PART OF THAT ROUTE IS OVER A SALES FLOOR ───────────────────────
// Which part is the one thing here nobody can calculate. The run leaves a rack
// room, crosses a back room, and at some point passes under finished ceiling —
// and where that happens is a walk of the piping plan, like the conditioned
// space question on the medium-temp liquid.
//
// So the covered footage is ASKED FOR. Left blank the line generates at zero
// carrying the route length, which is the number an estimator works from —
// the same shape as the trapeze lines, and for the same reason: a zero reads
// as unfinished, a confident wrong number reads as done.
//
// Pure — no React, no store.

// His chain's spec. Both are specs rather than constants — "the specs say"
// is a sentence about Food Lion, and the hanger spacing next door carries the
// same warning.
export const PAN_LENGTH_FT = 8;
export const PAN_MAX_WIDTH_IN = 16;

// Pans for a length of covered route. Whole pans — you cannot buy two thirds
// of one, and the offcut from a cut pan does not start the next run.
export function panCount(coveredFt, panFt = PAN_LENGTH_FT) {
  const ft = Number(coveredFt) || 0;
  const len = Number(panFt) > 0 ? Number(panFt) : PAN_LENGTH_FT;
  if (!(ft > 0)) return 0;
  return Math.ceil(ft / len);
}

// → the line, or null when there is no route to cover at all (a riser-only or
// rack-only scope has no horizontal pipe and therefore no pans).
export function dripPanLine({
  routeFt = 0, coveredFt, panFt = PAN_LENGTH_FT, maxWidthIn = PAN_MAX_WIDTH_IN,
} = {}) {
  const route = Math.round(Number(routeFt) || 0);
  if (!(route > 0)) return null;

  const len = Number(panFt) > 0 ? Number(panFt) : PAN_LENGTH_FT;
  const width = Number(maxWidthIn) > 0 ? Number(maxWidthIn) : PAN_MAX_WIDTH_IN;
  const said = coveredFt === '' || coveredFt === undefined || coveredFt === null
    ? null : Math.max(0, Number(coveredFt) || 0);

  const qty = said === null ? 0 : panCount(said, len);
  const basis = said === null
    // Says the route length because that is the ceiling on the answer and the
    // number somebody pacing the plan starts from.
    ? `MEASURE ON SITE — the pipe route is about ${route} ft end to end; pans go over the `
      + 'sales floor and under any drop ceiling, not over the back room. Enter the covered '
      + 'feet on the Materials step and this fills in.'
    : `${said} ft of route over sales floor / drop ceiling ÷ ${len} ft per pan`;

  return {
    section: 'Hardware',
    // Flagged for the pre-flight the same way the trapeze lines are: a zero
    // here is a line somebody still has to answer, not a line that costs
    // nothing.
    ...(said === null ? { hangerManual: true } : {}),
    desc: `Drip pans — ${len}' sheet metal, ${width}" max width (${basis})`,
    qty, unit: 'ea', unitCost: 0, total: 0,
    dripPan: true, routeFt: route, coveredFt: said,
  };
}
