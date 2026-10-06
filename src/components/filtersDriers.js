// ── SUCTION FILTERS AND LIQUID LINE DRIERS ──────────────────────────────────
// Asked for by the mechanic: "Can we add suction filters 3"-4"-5" and liquid
// line dryers to materials list."
//
// These were on no list at all. Not folded into another line, not priced at a
// guess — simply absent, which on a rack job means a set of parts that get
// bought and never bid.
//
// ── WHY THEY GENERATE AT ZERO ───────────────────────────────────────────────
// The app does not know how many. A suction filter goes in at the rack, one
// per suction group, and the number of groups is a rack question this module
// has no access to. A liquid line drier is one per liquid line off the rack,
// plus whatever the spec calls for at a case or a coil — and "whatever the
// spec calls for" is not something a takeoff can count.
//
// The same rule as the trapeze lines in hangers.js applies, for the same
// reason: a zero reads as unfinished and gets filled in, a confident wrong
// number reads as done. So the lines carry what the takeoff DOES know — for
// the driers, the actual liquid line sizes on this job — and the count comes
// from somebody who has looked at the rack.
//
// ── THE SIZES ARE HIS ───────────────────────────────────────────────────────
// 3", 4" and 5" are the sizes he named. Unlike the saddles, no rule was given
// that would let a fourth size be derived, and inventing one would be making
// up a spec rather than encoding one. Three lines, exactly as asked.
//
// Pure — no React, no store.

export const SECTION = 'Filters & Driers';

export const SUCTION_FILTER_SIZES = [3, 4, 5];

// ── THE CORE IS THE PART THAT GETS BOUGHT ───────────────────────────────────
// The line read "shell with replaceable core" and added, helpfully and
// wrongly, that "cores are ordered separately". From the mechanic:
//
//   "We just buy the suction filter cores not the shell."
//
// On a remodel the shell is already on the rack — these jobs are revisions to
// existing Margaux racks — so what the job buys is the core that goes in it.
// A line reading "Suction Filter" on a remodel is a part nobody orders, and
// worse, it prices like one: a shell is several times a core, so a bid built
// on it is high on a line somebody will eventually question.
//
// A NEW STORE IS THE OTHER WAY. There is no shell to put a core in, so it
// takes both. The job already states which it is, so this reads that rather
// than asking again — and the line SAYS which it assumed, because a remodel
// that happens to be adding a new suction group does need the shell.
export function suctionFilterLines(projectType = 'remodel') {
  const newRack = String(projectType || '').toLowerCase().startsWith('new');
  return SUCTION_FILTER_SIZES.map(size => ({
    section: SECTION,
    filterSize: size,
    unit: 'ea',
    qty: 0,
    unitCost: 0,
    total: 0,
    desc: newRack
      ? `${size}" Suction Filter — shell AND core. New rack, so there is no shell in place to `
        + 'take a core. One per suction group; count from the rack layout.'
      : `${size}" Suction Filter CORE — the shell is already on the rack. One per suction group `
        + 'being changed; count from the rack layout. Add the shell by hand if this job sets a '
        + 'new suction group.',
  }));
}

// The liquid sizes actually on this job, so the drier line is sized against
// the takeoff instead of from memory. Medium AND low temp — every circuit has
// a liquid line whether or not it is insulated.
export function liquidLineSizes(circuits = [], normalize = s => String(s || '')) {
  const seen = new Set();
  for (const c of circuits || []) {
    // A riser-only drop still has a liquid line; it is the horizontal run that
    // is missing, not the circuit.
    const size = c?.liqHoriz || c?.liqRiser;
    if (!size) continue;
    seen.add(normalize(size));
  }
  return [...seen].sort();
}

export function liquidDrierLine(circuits = [], normalize = s => String(s || '')) {
  const sizes = liquidLineSizes(circuits, normalize);
  const sizeNote = sizes.length
    ? `Liquid lines on this job: ${sizes.map(s => `${s}"`).join(', ')}.`
    : 'No liquid line sizes are set on the Circuits step yet, so the connection size cannot be '
      + 'read off the takeoff.';
  return {
    section: SECTION,
    unit: 'ea',
    qty: 0,
    unitCost: 0,
    total: 0,
    desc: `Liquid Line Driers — ${sizeNote} One per liquid line off the rack, plus any the spec `
      + 'calls for at a case or coil. Size to the connection and the tonnage, and check whether '
      + 'the job wants replaceable-core shells or sealed driers.',
  };
}

// Both, ready to push. The caller adds ids.
export function filterDrierLines(circuits = [], normalize = s => String(s || ''), projectType = 'remodel') {
  return [...suctionFilterLines(projectType), liquidDrierLine(circuits, normalize)];
}
