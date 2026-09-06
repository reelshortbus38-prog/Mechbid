// ── HOW EACH MATERIAL IS ACTUALLY BOUGHT ────────────────────────────────────
// A materials table with a bare Qty column is ambiguous in a way that costs
// money. "8" next to fabricated galvanized duct means eight POUNDS; "45" next
// to spiral means forty-five FEET; "3" next to a diffuser means three of them.
// Same column, three different things, and the only way to tell them apart was
// to already know.
//
// The refrigeration side has had a Unit column since the beginning and every
// generated line fills it in — copper by the foot, refrigerant and brazing rod
// by the pound, nitrogen by the cylinder, unistrut by the stick, the fittings
// allowance as a lot. The HVAC side never had the column at all, and the row
// shape had no field for it, so the units its own calculators worked out were
// computed and then thrown away: ductPurchase() decides 'lb' vs 'ft' vs 'box'
// vs 'roll' for every line it generates, and every one of them landed in the
// parts table as a naked number.
//
// This module is the one place that answers "what is this bought by". The
// generators that already know pass their unit through; everything else —
// takeoff lines, quick-add chips, rows typed by hand, and rows saved by an
// older build that has no unit on them at all — resolves through unitFor().
//
// Pure — no React, no store.

// The units a mechanical estimate actually uses. Offered in the row dropdown,
// in this order, because that is roughly how often they come up.
export const PURCHASE_UNITS = [
  'ea', 'ft', 'lb', 'lot', 'set', 'roll', 'box', 'stick', 'gal',
  'can', 'tube', 'cylinder', 'sq ft', 'sheet', 'pair', 'day', 'hr',
];

// Ordered. First match wins, so the specific cases sit above the general ones —
// "Duct smoke detector" must not be read as duct, and a linear slot diffuser
// must not be read as a diffuser, because it is bought by the foot of device.
const RULES = [
  // ── The description says it outright ──────────────────────────────────────
  // Several generated lines and one quick-add chip name their own unit. Nothing
  // should ever override that.
  [/\bby (?:the )?(?:lb|lbs|pound|pounds)\b/i, 'lb'],
  [/\bby (?:the )?(?:ft|foot|feet|lf)\b/i, 'ft'],
  [/\bby (?:the )?gal(?:lon)?s?\b/i, 'gal'],
  [/\bper (?:the )?(?:ft|foot|lf)\b/i, 'ft'],

  // ── Lines this app generates, matched on their own wording ────────────────
  // Rectangular duct is fabricated and sold by weight — the gauge is set by the
  // duct size, the pounds by the surface area. This is the single line where
  // getting the unit wrong is worth thousands.
  [/\bfabricated\b/i, 'lb'],
  [/\bsheet metal\b/i, 'lb'],
  // Flex comes in 25' boxes, wrap in ~100 sq ft rolls, strut in 10' sticks.
  [/\bboxes\b|\b\d+'\s*boxes?\b/i, 'box'],
  [/\brolls?\b/i, 'roll'],
  [/\bsticks?\b/i, 'stick'],
  [/\bcylinders?\b/i, 'cylinder'],
  // A percentage-of-material allowance is one lot line, not a countable thing.
  [/\ballowance\b|%\s*of\b|\blot\b/i, 'lot'],
  // "Duct connection / flex / transitions" is a catch-all the estimator prices
  // as one lump for the job. It also has to be caught HERE, above the ductwork
  // rules, or the word "duct" at the front sends it off as footage.
  [/\bduct connection\b|\btransitions\b/i, 'lot'],

  // ── Devices tagged in duct notation ───────────────────────────────────────
  // A linear slot diffuser is tagged "204x4" like a duct size and reads like
  // ductwork all the way through the takeoff. It is bought by the foot of
  // DEVICE, and this rule has to beat both the diffuser rule and the duct rule.
  [/\blinear (?:slot )?(?:diffuser|grille)\b/i, 'ft'],

  // ── Runs scaled off the plan ──────────────────────────────────────────────
  // Anchored to the front of the description because that is where the app puts
  // the word: "Ductwork — 20x12 duct (supply)", "Pipe — 2\" CHWS". A loose
  // \bduct\b here would swallow "Duct smoke detector" and "Duct connection".
  [/^\s*ductwork\b/i, 'ft'],
  [/^\s*spiral\b|\bspiral round duct\b/i, 'ft'],
  [/^\s*pipe\b|^\s*piping\b/i, 'ft'],
  [/^\s*(?:copper|lineset)\b.*\b(?:tube|tubing|acr|type l)\b/i, 'ft'],
  [/\bline insulation\b|\bpipe insulation\b|\binsulation\b.*\bper ft\b/i, 'ft'],

  // ── Assemblies bought as a package ────────────────────────────────────────
  // A split lineset, a set of hail guards and a vibration-isolation kit are all
  // sold as one packaged set per unit, not as loose pieces.
  [/\blineset\b/i, 'set'],
  [/\bhail guards?\b/i, 'set'],
  [/\bvibration isolation\b|\bisolation (?:rails|pads|kit)\b/i, 'set'],

  // ── Priced by time, not by piece ──────────────────────────────────────────
  // Crane and rigging is quoted as a day on the roof. Counting it "1 each"
  // hides the fact that a second day doubles it.
  [/\bcrane\b|\brigging\b/i, 'day'],

  // ── Liquids and consumables ───────────────────────────────────────────────
  // Oil before refrigerant: POE comes in a gallon jug, and "Refrigerant Oil"
  // otherwise trips the refrigerant-by-the-pound rule sitting right under it.
  [/\brefrigerant oil\b|\bpoe oil\b|\bglycol\b|\bpropylene\b|\bdi water\b/i, 'gal'],
  [/\brefrigerant\b|\bbrazing rod\b|\bsolder\b/i, 'lb'],
  [/\bspray foam\b|\badhesive\b|\bgap filler\b/i, 'can'],
  [/\bcaulk\b|\bsealant\b/i, 'tube'],
];

// What is this line bought by?
//
// fallback is what a parts table already means by an unlabeled quantity — one
// of the thing — and it is what a hand-typed row starts at. It stays editable,
// because a guess that cannot be corrected is worse than no guess.
export function unitFor(desc, fallback = 'ea') {
  const s = String(desc || '');
  if (!s.trim()) return fallback;
  for (const [re, unit] of RULES) if (re.test(s)) return unit;
  return fallback;
}

// The unit to SHOW for a row: what the row carries, or what its description
// implies. Rows saved before hvacParts had a unit field arrive with nothing on
// them, and re-reading every old job to fix that is not a thing anyone will do.
//
// Only the HVAC parts table falls back to inference, and only because that is
// the one table where the field is new and every saved job predates it. It gets
// away with it because those descriptions are written by this app — "Ductwork —
// 20x12 duct", "Pipe — 2\" CHWS" — so reading them back is reading our own
// handwriting.
//
// Everywhere else the unit has always been stored and is simply `unit || 'ea'`.
// Guessing there would be worse than not guessing: a residential chip reading
// "Refrigerant (R-410A / R-454B)" is one $160 JUG at qty 1, and a rack parts
// line is whatever a customer's spreadsheet called it.
export function rowUnit(row = {}, fallback = 'ea') {
  const own = String(row.unit || '').trim();
  return own || unitFor(row.desc, fallback);
}

// One unit for a whole section, or '' when its lines are bought differently
// from each other. The parts table's collapsed group headers read
// "12 lines · 340 ft" — which is true of a duct section and a lie about the
// purchase-unit section, where pounds, feet, boxes and rolls sit together.
export function commonUnit(rows = []) {
  const seen = new Set(rows.map(r => rowUnit(r)));
  return seen.size === 1 ? [...seen][0] : '';
}
