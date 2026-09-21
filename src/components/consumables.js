// ── CONSUMABLES THAT ARE DEFINED IN ONE PLACE ───────────────────────────────
// The materials step builds its consumables list twice — once for the bid
// (Generate from Circuits) and once for the supply house list (autofill) — and
// the two lists are written out longhand, item by item, in both. They are not
// identical lists and should not be forced to be: the bid carries things the
// supply house never sees.
//
// But an item added to one and forgotten in the other is invisible. Nothing
// fails, both lists render, and the only symptom is that what got ordered does
// not match what got bid. So an item that belongs on both is written HERE,
// once, and pushed into both — which is a thing a test can check, where "did
// somebody remember to paste it twice" is not.
//
// Pure — no React, no store.

// ── SILICONE ─────────────────────────────────────────────────────────────────
// Asked for by the mechanic, who was clear about the part that mattered:
//
//   "Can you add silicone to materials. Maybe with color options. I don't know
//    but definitely need the silicone added to the list."
//
// On colour: it does not change the bid. Every colour of the same sealant is
// the same money, so splitting one line into four would put three extra zeros
// on the estimate and change no total. What colour DOES change is the order —
// a case of clear when the job wanted white is a wasted trip — so the colours
// are named on the line, where they travel with it onto the supply house list
// and into the order.
export const SILICONE_COLORS = ['clear', 'white', 'black', 'almond'];

export const SILICONE = {
  unit: 'tube',
  desc: 'Silicone Sealant — case joints, penetrations, flashing and trim. '
    + `Colour is per store and per fixture — say which when you order (${SILICONE_COLORS.join(', ')}). `
    + 'Use an NSF / food-zone grade anywhere it touches a case interior.',
};

// A consumable at zero, ready to push into either list. Quantities start at 0
// for the same reason every other consumable does: nothing is charged until
// somebody fills in what the job actually takes.
export function consumableLine(def, extra = {}) {
  return { desc: def.desc, unit: def.unit, qty: 0, unitCost: 0, total: 0, ...extra };
}
