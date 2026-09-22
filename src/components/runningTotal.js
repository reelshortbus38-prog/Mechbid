// ── WHAT IS IN THE NUMBER, AND WHAT IS NOT ──────────────────────────────────
// The breakdown behind the running total, kept out of the component so a test
// can ask what it says rather than grep for whether it says anything.
//
// bidLetterBreakdown already splits the bid five ways for the bid letter. This
// adds the part a running total needs and a printed letter does not: which of
// those five are still empty, by name.
//
// A total on an unfinished bid is a number that looks final and is not. On the
// Materials step there is usually no labor yet — so the figure is most of a
// bid missing its biggest line, and a large green number reads as the answer
// whatever caption sits above it.
//
// Pure — no React, no store.

// Refrigerant is its own line because it is bought by the pound against a
// charge nobody has weighed yet, and it is routinely the largest single item
// an estimator has left at zero.
const PARTS = [
  ['materials', 'Materials'],
  ['refrigerant', 'Refrigerant'],
  ['labor', 'Labor'],
  ['oot', 'Out of town'],
  ['other', 'Subs, rentals, bond & permits'],
];

// Parts that a bid is not a bid without. Out-of-town is genuinely zero on an
// in-town job and subs are zero on plenty of jobs, so neither is missing when
// it is empty — saying so would cry wolf on every local bid and teach an
// estimator to ignore the panel.
const REQUIRED = ['materials', 'labor'];

export function totalParts(breakdown = {}) {
  return PARTS.map(([key, label]) => ({ key, label, amount: Number(breakdown?.[key]) || 0 }));
}

export function missingFromTotal(breakdown = {}) {
  return PARTS
    .filter(([key]) => REQUIRED.includes(key) && !(Number(breakdown?.[key]) > 0))
    .map(([, label]) => label.toLowerCase());
}

export function totalIsWhole(breakdown = {}) {
  return (Number(breakdown?.total) || 0) > 0 && missingFromTotal(breakdown).length === 0;
}
