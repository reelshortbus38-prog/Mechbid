// ── RENTED EQUIPMENT, WHICH HAD NOWHERE TO GO ───────────────────────────────
// A store remodel sits on a scissor lift for weeks and there was no line for
// it anywhere in this app. Not in materials, not in labor, not in the bid
// totals — which carry subcontractors, bond, permit and tax and nothing else.
// The only places to put a lift were a hand-typed material line or a fake
// subcontractor, and neither is what it is.
//
// It is not a small number. A 26' scissor is a few hundred a week before
// delivery and pickup, a boom is multiples of that, and a grocery remodel
// usually needs somewhere to put the product too.
//
// WHAT MAKES RENTAL DIFFERENT FROM EVERY OTHER COST HERE: it is priced by
// TIME, and the rate steps down as the time goes up. A rental house quotes
// day, week and month, and the month is nowhere near four times the week —
// commonly about three. So four weeks entered as weeks costs a third more than
// the same four weeks entered as a month, and an estimator who does not know
// that has quietly padded the bid. The app can see that mistake in the numbers,
// so it says so.
//
// Pure — no React, no store.

// How rental houses quote. 'ea' is here for the things that come with a rental
// and are not time-based at all: delivery, pickup, damage waiver, fuel refill.
export const RENTAL_UNITS = ['day', 'week', 'month', 'ea'];

// Roughly how many of one unit make the next one up, for the rate-break check
// below. Not a price — just how a calendar divides.
const DAYS = { day: 1, week: 7, month: 30 };

export const newRental = (id, prefill = {}) => ({
  id, desc: '', qty: 0, unit: 'week', rate: 0, notes: '', ...prefill,
});

export const rentalLineTotal = r =>
  Math.max(0, (parseFloat(r?.qty) || 0) * (parseFloat(r?.rate) || 0));

export const rentalsBase = (rentals = []) =>
  (rentals || []).reduce((s, r) => s + rentalLineTotal(r), 0);

// ── THE RATE BREAK ──────────────────────────────────────────────────────────
// A month is commonly about three weeks' money, and a week about three days'.
// So anything at four or more of a unit is very likely cheaper quoted at the
// next unit up, and the estimator should ring the rental house rather than
// multiply.
//
// This does NOT change the number. It cannot — it does not know this supplier's
// rates, and inventing a discount would be worse than the padding it is warning
// about. It points at the line and says go and ask.
//
// → a note, or '' when the line is fine as entered.
export const RATE_BREAK_AT = 4;

export function rateBreakNote(r) {
  const qty = parseFloat(r?.qty) || 0;
  const unit = r?.unit;
  if (!(qty >= RATE_BREAK_AT)) return '';
  if (unit === 'week') {
    return `${qty} weeks — a month is usually around three weeks' money, not four. `
      + 'Ask for the monthly rate before this goes in the bid.';
  }
  if (unit === 'day') {
    return `${qty} days — a week is usually around three days' money. Ask for the weekly rate.`;
  }
  return '';
}

// Every line that ought to be re-quoted at a longer term, for one summary note.
export function rateBreakLines(rentals = []) {
  return (rentals || []).filter(r => rateBreakNote(r) !== '');
}

// ── WHAT THIS TRADE ACTUALLY RENTS ──────────────────────────────────────────
// Quick-add chips, in the order a store remodel meets them. Rates are left at
// zero on purpose: rental pricing is regional, negotiated, and moves — a
// plausible-looking default here would be a number nobody quoted, sitting in a
// bid, looking checked.
//
// The two that a generic equipment list would miss are the ones this trade
// cannot do without. A grocery remodel has to put the PRODUCT somewhere when
// the cases come down, and the crew works NIGHTS in a store with the lights
// half off.
export const COMMON_RENTALS = [
  { desc: 'Scissor lift — 19\'', unit: 'week' },
  { desc: 'Scissor lift — 26\'', unit: 'week' },
  { desc: 'Boom / articulating lift', unit: 'week' },
  { desc: 'Forklift / telehandler', unit: 'week' },
  { desc: 'Reefer trailer — product holding', unit: 'week' },
  { desc: 'Spot coolers / portable refrigeration', unit: 'week' },
  { desc: 'Light tower / temporary lighting (night work)', unit: 'week' },
  { desc: 'Roll-off dumpster', unit: 'ea' },
  { desc: 'Storage container on site', unit: 'month' },
  { desc: 'Generator', unit: 'week' },
  { desc: 'Core drill', unit: 'day' },
  { desc: 'Delivery & pickup', unit: 'ea' },
];

// One line for the totals panel, so what is being added is legible before it
// is agreed to.
export function rentalsSummary(rentals = [], markupPct = 0) {
  const rows = (rentals || []).filter(r => rentalLineTotal(r) > 0);
  const base = rentalsBase(rows);
  const pct = parseFloat(markupPct) || 0;
  return {
    lines: rows.length,
    base: Math.round(base * 100) / 100,
    markupPct: pct,
    total: Math.round(base * (1 + pct / 100) * 100) / 100,
    rateBreaks: rateBreakLines(rows).length,
  };
}
