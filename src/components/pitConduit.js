// ── THE PIT AND CONDUIT PLAN ─────────────────────────────────────────────────
// A sheet class this app could not read, and the one that answers a question it
// has been guessing at since it was written.
//
// Food Lion #0047, Asheboro: "REFRIGERATION PIT AND CONDUIT PLAN". It is not a
// redline. There are no orange callout boxes with leader lines — which is the
// only thing callClaudeVisionRedline knows how to look for, so a sheet like
// this comes back with zero field tasks and the estimator is told the page had
// nothing on it. What it actually has is a SYMBOL LEGEND, and the legend is the
// content:
//
//   EXISTING ACCESS PIT TO BE FILLED WITH 2500 PSI CONCRETE
//   EXISTING ACCESS PIT TO REMAIN
//   NEW ACCESS PIT
//   NEW EVAPORATOR COILS
//   EXISTING EVAPORATOR COILS — REFRIGERANT PIPING TO REMAIN
//   EXISTING BELOW SLAB REFRIGERANT CONDUIT TO BE REUSED
//   EXISTING BELOW SLAB REFRIGERANT CONDUIT TO BE ABANDONED
//   NEW BELOW SLAB REFRIGERANT CONDUIT
//   NEW OVERHEAD REFRIGERANT PIPING
//   NEW ABOVE SLAB AND BELOW CASE REFRIGERATION PIPING
//
// ── WHY THIS IS THE SHEET THAT MATTERS ───────────────────────────────────────
// `inFloor` has been a checkbox on the Circuits step since the beginning, off
// by default, set by hand or not at all. Nothing in this app has ever read it
// off a drawing. It drives three separate things:
//
//   JOINTS. jointSpacingFt returns coilLength (50 ft) instead of stickLength
//   (20 ft) for a soft-copper floor run, because a line pushed under a slab is
//   pulled off a coil and does not come in sticks. On a 400 ft circuit that is
//   26 joints against 14.
//   HANGERS. hangers.js skips a floor run outright. A line in the ground is
//   not hung, and the app was buying strut and rod for it.
//   COPPER. Step4 prices soft coil against hard stick.
//
// On a 400 ft, 7/8" circuit the labour alone is 4.8 man-hours — about $456 at
// $95, near $9,000 across twenty circuits — and that is before the hangers
// nobody needs and the wrong copper.
//
// The estimator could always have ticked the box. The point is that nothing
// TOLD him to, and the sheet that says which circuits run under the floor was
// being reported as an empty page.
//
// ── AND WHAT THIS SHEET IS NOT ───────────────────────────────────────────────
// It is not a measurement. Printed across the sales floor on #0047:
//
//   "ALL REFRIGERATION PIPING RUNS ARE SHOWN DIAGRAMMATIC. REFRIGERATION
//   CONTRACTOR TO FIELD VERIFY REFRIGERATION PIPING IN BACK ROOM AND STOCK AND
//   SALES PIPING AS NEEDED. COORDINATE WITH ALL TRADES."
//
// So it says WHICH WAY a circuit goes and it does not say HOW FAR. Routing off
// this sheet is evidence; a length scaled off it is not, and the app says so
// rather than letting a scale bar turn a diagram into a takeoff.
//
// Pure — no React, no network.

// ── RECOGNISING THE SHEET ────────────────────────────────────────────────────
// Two independent signals, because one stray phrase should not reclassify a
// drawing. The consequence of a false positive is reading a sheet with the
// wrong prompt, which loses scope — the same asymmetry api/pageSkip.js is
// built around.
const TITLE_RE = /\bpit\s+and\s+conduit\b|\bconduit\s+and\s+pit\b/i;
const PIT_RE = /\baccess\s+pit\b/i;
const CONDUIT_RE = /\bbelow[\s-]*slab\b[^.]{0,40}\bconduit\b|\bconduit\b[^.]{0,40}\bbelow[\s-]*slab\b/i;

export function isPitConduitPlan(text) {
  const s = String(text || '');
  if (TITLE_RE.test(s)) return true;
  return PIT_RE.test(s) && CONDUIT_RE.test(s);
}

// Which prompt a sheet needs. Lifted out of the vision loop in api/ai.js so
// the DECISION can be tested even though the fetch around it cannot — the loop
// is one line that dispatches on this, and the rule that picks a prompt is the
// part that loses scope when it is wrong.
export function sheetPromptFor(text) {
  return isPitConduitPlan(text) ? 'pitConduit' : 'redline';
}

// ── WHAT EACH LEGEND LINE MEANS FOR THE BID ──────────────────────────────────
// `inFloor` is the field that already exists and already changes the money.
// `newCopper` says whether this run is copper being bought and installed at
// all — an abandoned conduit and piping that stays are both scope-free, and
// they are on the legend precisely so nobody prices them.
export const ROUTING = [
  {
    key: 'belowSlabNew', inFloor: true, newCopper: true,
    label: 'New below-slab refrigerant conduit',
    note: 'A new run under the floor. Soft coil, no hangers, and somebody has to open the slab — '
      + 'check the general notes for whether that trenching and patching is yours or the GC\'s.',
  },
  {
    key: 'belowSlabReuse', inFloor: true, newCopper: true,
    label: 'Existing below-slab conduit — reused',
    note: 'New copper pulled through conduit that is already in the ground. Soft coil, no hangers, '
      + 'and no slab work — but pulling a line through an existing sleeve is its own job, and it is '
      + 'not the same hours as a clean open run.',
  },
  {
    key: 'belowSlabAbandon', inFloor: true, newCopper: false,
    label: 'Existing below-slab conduit — abandoned',
    note: 'Dead. No copper, no hours. On the legend so it is not mistaken for conduit you can reuse.',
  },
  {
    key: 'overhead', inFloor: false, newCopper: true,
    label: 'New overhead refrigerant piping',
    note: 'Hard stick overhead. Hung, so hangers apply.',
  },
  {
    key: 'aboveSlab', inFloor: false, newCopper: true,
    label: 'New above-slab and below-case piping',
    note: 'Above the slab and under the case line. Not a floor run — the app prices it as hard pipe, '
      + 'which is right, but it is not hung from a ceiling either. Worth a look at the hanger count.',
  },
  {
    key: 'pipingRemains', inFloor: false, newCopper: false,
    label: 'Existing evaporator coils — refrigerant piping to remain',
    note: 'A coil that stays on the pipe it is already on. No new copper. The COIL may still be new '
      + 'and still take labor to set — that is the coil-only case the BPR flags separately.',
  },
];

export const ROUTING_KEYS = ROUTING.map(r => r.key);

export function routingOf(key) {
  return ROUTING.find(r => r.key === key) || null;
}

// A legend line, as transcribed, to one of the keys above. Order matters:
// "EXISTING BELOW SLAB REFRIGERANT CONDUIT TO BE REUSED" contains both
// "existing" and "conduit", so the specific tests run before the general ones.
export function classifyRouting(phrase) {
  const s = String(phrase || '').toLowerCase();
  if (!s.trim()) return null;
  const belowSlab = /below[\s-]*slab/.test(s);
  if (belowSlab && /\babandon/.test(s)) return 'belowSlabAbandon';
  if (belowSlab && /\bre-?use/.test(s)) return 'belowSlabReuse';
  if (belowSlab && /\bnew\b/.test(s)) return 'belowSlabNew';
  if (/\bover-?head\b/.test(s)) return 'overhead';
  if (/above[\s-]*slab|below[\s-]*case/.test(s)) return 'aboveSlab';
  if (/\bto remain\b|\bpiping to remain\b/.test(s)) return 'pipingRemains';
  // An unrecognised legend line is not forced into the nearest bucket. The
  // caller shows it to the estimator instead — an unknown category he can read
  // is worth more than a wrong one he cannot see.
  return null;
}

// Does a circuit routed this way run in the floor? Null for an unknown key, so
// a caller can tell "no" from "no idea" — the app must not tick a box on a
// guess, because the box changes the joint count.
export function inFloorFor(key) {
  const r = routingOf(key);
    return r ? r.inFloor : null;
}

// ── ACCESS PITS ──────────────────────────────────────────────────────────────
// Scope with no line anywhere in this app. Four legend categories, two of them
// work. Deliberately carries NO hours: nobody has quoted this app a figure for
// filling a pit or cutting a new one, and a number nobody has given is not a
// number. They arrive as named, counted rows the estimator prices — or zeroes,
// which says the GC has it.
export const PITS = [
  {
    key: 'fill', work: true,
    label: 'Existing access pit — fill with 2500 PSI concrete',
    note: 'Filling a pit that is being taken out of service. Usually the GC\'s concrete, '
      + 'often the RC\'s coordination — check the general notes on the sheet before pricing or excluding it.',
  },
  { key: 'new', work: true, label: 'New access pit', note: 'Cutting a new pit. Same question: whose scope?' },
  { key: 'remain', work: false, label: 'Existing access pit — to remain', note: 'No work. Counted so the sheet reconciles.' },
  { key: 'existing', work: false, label: 'Existing access pit', note: 'Shown for context. No work.' },
];

export const PIT_KEYS = PITS.map(p => p.key);

// ── LEGEND LINES THAT ARE REAL AND NOT ACTIONABLE ────────────────────────────
// A legend also defines symbols this module has nothing to do: the evaporator
// coils, the generic "REFRIGERATION CIRCUIT" line. Reporting those as entries
// the app could not understand would put a false alarm on every sheet of this
// class, and an alarm that is always wrong is one the estimator learns to skip
// past — including the time it is right.
//
// So there are three outcomes for a legend line, not two: it routes pipe, it
// counts a pit, or it is a symbol somebody else's part of the app owns.
const KNOWN_NON_ROUTING = [
  /\bevaporator\s+coils?\b/i,
  /\brefrigeration\s+circuit\b/i,
  /\brefrigerant\s+piping\b\s*$/i,
];

export function isKnownLegendLine(phrase) {
  const s = String(phrase || '').trim();
  return !!s && KNOWN_NON_ROUTING.some(re => re.test(s));
}

export function classifyPit(phrase) {
  const s = String(phrase || '').toLowerCase();
  if (!/\bpit\b/.test(s)) return null;
  if (/\bfill/.test(s)) return 'fill';
  if (/\bnew\b/.test(s)) return 'new';
  if (/\bto remain\b/.test(s)) return 'remain';
  if (/\bexisting\b/.test(s)) return 'existing';
  return null;
}

// Counted pits → rows for the scope list. Only the ones that are work, and
// every one at zero hours, because this app has no figure for them.
export function pitScopeLines(counts = {}) {
  const out = [];
  for (const pit of PITS) {
    if (!pit.work) continue;
    const n = Math.max(0, Math.round(Number(counts[pit.key]) || 0));
    if (!n) continue;
    out.push({
      key: pit.key,
      count: n,
      desc: `${pit.label} — ${n} ${n === 1 ? 'pit' : 'pits'}`,
      hrs: 0,
      note: pit.note,
      // Said on the row, not only in a comment. An hours box at zero that the
      // estimator has not been told about reads as "free", and this is the one
      // thing on the sheet the app cannot price for him.
      needsPrice: true,
    });
  }
  return out;
}

// What was counted but is NOT work, so the sheet reconciles and the estimator
// can see the app read all four categories rather than only the two it acted on.
export function pitsNotPriced(counts = {}) {
  return PITS.filter(p => !p.work)
    .map(p => ({ key: p.key, count: Math.max(0, Math.round(Number(counts[p.key]) || 0)), label: p.label }))
    .filter(p => p.count > 0);
}

// ── APPLYING THE ROUTING TO THE CIRCUIT LIST ─────────────────────────────────
// The sheet names circuits; the circuit list came off the BPR. This joins them
// and reports every circuit it could NOT place, because a partial application
// that looks complete is worse than one that says what it missed.
//
// routingByCircuit: { [circuitId]: routingKey }
export function applyRouting(circuits = [], routingByCircuit = {}) {
  const want = new Map();
  for (const [id, key] of Object.entries(routingByCircuit || {})) {
    const clean = String(id || '').trim().toUpperCase();
    if (clean && routingOf(key)) want.set(clean, key);
  }
  const changed = [], unchanged = [], unmatched = new Set(want.keys());

  const next = (circuits || []).map(c => {
    const id = String(c?.circuitId || '').trim().toUpperCase();
    const key = want.get(id);
    if (!key) return c;
    unmatched.delete(id);
    const floor = inFloorFor(key);
    if (floor === null || Boolean(c.inFloor) === floor) {
      unchanged.push({ circuitId: id, routing: key });
      return c;
    }
    changed.push({ circuitId: id, routing: key, inFloor: floor, was: Boolean(c.inFloor) });
    return { ...c, inFloor: floor };
  });

  return {
    circuits: next,
    changed,
    unchanged,
    // Circuits the sheet routed that are not in the takeoff. Usually a circuit
    // on the plan that the BPR did not mark as new work — worth a look, not an
    // error.
    notInTakeoff: [...unmatched],
  };
}

// ── WHAT THIS SHEET IS NOT ───────────────────────────────────────────────────
export const DIAGRAMMATIC_NOTE =
  'Routing off a pit and conduit plan, not lengths. This sheet class states outright that the piping runs '
  + 'are DIAGRAMMATIC and that the refrigeration contractor is to field verify — so which way a circuit goes '
  + 'is evidence and how far it goes is not. Nothing here has changed any run length, and a length scaled off '
  + 'this drawing is a guess wearing a measurement\'s clothes.';

// The one-line summary for the extraction log.
export function routingSummary(routingByCircuit = {}) {
  const tally = new Map();
  for (const key of Object.values(routingByCircuit || {})) {
    if (routingOf(key)) tally.set(key, (tally.get(key) || 0) + 1);
  }
  if (!tally.size) return '';
  return [...tally.entries()]
    .map(([key, n]) => `${n} ${routingOf(key).label.toLowerCase()}`)
    .join(' · ');
}

// ── FROM A PARSED SHEET TO CHANGES IN THE BID ────────────────────────────────
// The vision read hands back verbatim legend lines and a circuit-to-legend-line
// mapping. Everything from here is deterministic, which is the point: what the
// model is asked for is TRANSCRIPTION, and every decision that moves money is
// made in code that can be tested without it.
//
// Returns the new circuit list plus a plain account of what happened, because
// this silently ticks a box that changes the joint count — and a change to the
// money that the estimator cannot see is one he cannot defend.
export function applyPitConduitRead(circuits = [], parsed = {}) {
  // Legend line → routing key, once, so an unreadable legend is reported as a
  // legend problem rather than as a hundred unplaced circuits.
  const byPhrase = new Map();
  const unreadable = [];
  for (const entry of parsed?.legend || []) {
    const phrase = String(entry || '').trim();
    if (!phrase) continue;
    const key = classifyRouting(phrase);
    if (key) { byPhrase.set(phrase.toLowerCase(), key); continue; }
    // A pit line is counted below, and a coil or circuit symbol belongs to
    // another part of the app. Neither is a failure to understand the legend.
    if (classifyPit(phrase) || isKnownLegendLine(phrase)) continue;
    unreadable.push(phrase);
  }

  const routingByCircuit = {};
  const unplaced = [];
  for (const row of parsed?.routing || []) {
    const id = String(row?.circuitId || '').trim().toUpperCase();
    if (!id) continue;
    const phrase = String(row?.legendText || '').trim();
    // The legend is the authority; fall back to reading the row's own phrase so
    // a circuit is not lost to a legend line the transcription missed.
    const key = byPhrase.get(phrase.toLowerCase()) || classifyRouting(phrase);
    if (key) routingByCircuit[id] = key;
    else unplaced.push({ circuitId: id, legendText: phrase });
  }

  const applied = applyRouting(circuits, routingByCircuit);

  const counts = {};
  for (const row of parsed?.pitCounts || []) {
    const key = classifyPit(String(row?.legendText || ''));
    if (!key) continue;
    counts[key] = (counts[key] || 0) + Math.max(0, Math.round(Number(row?.count) || 0));
  }

  return {
    ...applied,
    routingByCircuit,
    pitCounts: counts,
    pitLines: pitScopeLines(counts),
    pitsNotPriced: pitsNotPriced(counts),
    unplaced,
    unreadableLegend: unreadable,
    // Notes that assign work between trades. Not interpreted — deciding whose
    // scope the slab is from a sentence is exactly the judgement this app
    // should hand to the estimator rather than make for him.
    generalNotes: (parsed?.generalNotes || []).map(n => String(n || '').trim()).filter(Boolean),
  };
}

// The flags this read should raise, in the app's own voice. Separated from the
// application above so the wording can be tested without the circuit maths.
export function pitConduitFlags(result = {}, fileName = '') {
  const flags = [];
  const src = fileName || 'Pit & conduit plan';
  const { changed = [], notInTakeoff = [], unplaced = [], unreadableLegend = [], pitLines = [], generalNotes = [] } = result;

  if (changed.length) {
    const floor = changed.filter(c => c.inFloor);
    const up = changed.filter(c => !c.inFloor);
    const bits = [];
    if (floor.length) bits.push(`${floor.length} moved to BELOW SLAB (${floor.map(c => c.circuitId).join(', ')})`);
    if (up.length) bits.push(`${up.length} moved OUT of the floor (${up.map(c => c.circuitId).join(', ')})`);
    flags.push({
      type: 'warn', source: src,
      circuits: changed.map(c => c.circuitId),
      text: `The pit & conduit plan changed the in-floor setting on ${changed.length} circuit${changed.length === 1 ? '' : 's'}: `
        + `${bits.join('; ')}. That changes the joints — a floor run is soft coil at 50 ft between joints rather than `
        + '20 ft of hard stick — and it drops the hangers, which a line in the ground does not need. Check these against '
        + 'the drawing before the bid goes out.',
    });
  }

  if (pitLines.length) {
    flags.push({
      type: 'warn', source: src,
      text: `${pitLines.map(l => l.desc).join(' · ')}. This app has no hours for pit work — nobody has quoted it one — `
        + 'so these are on the scope list at zero until you price them. Zero them deliberately if the GC has the slab, '
        + 'and check the general notes on the sheet: who cuts it, who patches it, who supplies the concrete.',
    });
  }

  if (generalNotes.length) {
    flags.push({
      type: 'info', source: src,
      text: `Notes on this sheet that split work between trades: ${generalNotes.slice(0, 4).join(' | ')}`,
    });
  }

  if (unplaced.length) {
    flags.push({
      type: 'warn', source: src,
      circuits: unplaced.map(u => u.circuitId),
      text: `${unplaced.length} circuit${unplaced.length === 1 ? '' : 's'} on the plan could not be matched to a legend `
        + `category (${unplaced.map(u => u.circuitId).join(', ')}), so nothing was changed for them. Their in-floor setting `
        + 'is whatever it already was.',
    });
  }

  if (notInTakeoff.length) {
    flags.push({
      type: 'info', source: src,
      text: `${notInTakeoff.join(', ')} ${notInTakeoff.length === 1 ? 'is' : 'are'} routed on this plan but not in the `
        + 'circuit takeoff. Usually a circuit the BPR did not mark as new work — worth a look, not necessarily a miss.',
    });
  }

  if (unreadableLegend.length) {
    flags.push({
      type: 'warn', source: src,
      text: `${unreadableLegend.length} legend entr${unreadableLegend.length === 1 ? 'y' : 'ies'} on this sheet did not match `
        + `anything this app knows: ${unreadableLegend.slice(0, 3).join(' | ')}. Circuits drawn in those categories were left alone.`,
    });
  }

  flags.push({ type: 'info', source: src, text: DIAGRAMMATIC_NOTE });
  return flags;
}
