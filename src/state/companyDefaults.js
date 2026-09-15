// ── WHAT IS TRUE OF THE SHOP, NOT OF THE JOB ─────────────────────────────────
// Different companies charge different rates. The app carried that as a per-JOB
// setting, which means a shop whose technician bills $118 re-typed $118 —
// alongside their markup, their tax rate, their bond percentage and their whole
// crew make-up — on every bid, forever, starting from numbers that came from
// nobody in particular.
//
// The company profile already existed and held the letterhead: name, licence,
// phone. Everything an estimator actually gets wrong by retyping was outside it.
//
// A rate is a fact about the shop. So is a markup, a bond percentage, a per diem
// and whether the crew rate is a billing rate or a burdened cost. Those belong
// to the company and seed each new job; the takeoff, the crew for THIS job and
// the schedule stay with the job.
//
// SEEDING IS NOT OVERWRITING. Defaults apply to a NEW job only. Loading a saved
// bid never touches it — a bid priced last spring keeps last spring's markup,
// because that is what was quoted.
//
// Pure — no React, no localStorage. The profile is passed in.

// Job-state keys the shop owns. Anything not listed here is per-job.
export const COMPANY_DEFAULT_KEYS = [
  // What a crew hour is worth, and what that figure means.
  'laborRateBasis', 'laborCostRatio',
  // What the shop sells at.
  'markupPct', 'equipMarkupPct', 'subMarkupPct',
  // What the shop adds to a rented lift. A fact about how they bill, not about
  // this job — some pass rental through at cost, some do not.
  'rentalMarkupPct', 'rentalTaxPct',
  // What the shop burns per labor dollar — nitrogen, rod, tips, abrasives.
  // A shop fact, not a job one, and previously retyped or left at the app's
  // number on every bid.
  'consumablesPct',
  // What the shop pays for night work. This lived only on individual labor
  // PERIODS, hardcoded at 1.5× the moment one was created, so a shop whose
  // night premium is 1.15 (or 1.0, or 2.0) re-typed it on every night period
  // of every job forever and could never store the right answer. On a grocery
  // remodel that is most of the hours on the job.
  'nightPremium',
  // Whether this shop bids lump sum or time and materials. Most bid the same
  // way every time; the ones that do should not choose on every job.
  'bidMethod',
  // How many go on a circuit — presentation for the generated tasks, and still
  // a fact about how this shop crews the work.
  'circuitCrewSize',
  // Where the shop works.
  'materialsTaxPct', 'bondPct',
  // How the shop treats travel.
  'ootBasis', 'outOfTown',
  // Meals, hotel and fuel rates. What a shop pays for a room is a fact about
  // the shop, not about this store.
  'ootRates',
  // The shop's own labor productivity, once it has been tuned against a job.
  // One object holding every unit — refrigeration, the scope lines and HVAC —
  // so all of them travel together and none has to be captured separately.
  'laborUnits',
  // ── THE BASELINE THE UNITS ARE MEASURED AGAINST ──────────────────────────
  // What conditions this shop's labor units describe, and what this shop
  // reckons each harder condition costs. Both belong here rather than on the
  // job for the same reason `laborUnits` does: they are a property of where
  // the numbers came from, not of the store being bid. The job supplies only
  // its own conditions, and the app prices the difference — see
  // steps/conditionFactor.js.
  'unitsBasis', 'conditionPct',
  // Standing scope fence and conditions of bid.
  'exclusions', 'proposalTerms', 'bidValidDays',
  'preferredSupplier',
];

// The standard crew is a shop fact too, but it is a list rather than a scalar
// and it seeds differently — into whichever labor mode the job uses.
export const CREW_KEY = 'standardCrew';

// What the shop bills a man-hour at on a residential job — the single most
// obviously per-shop number in the app: "no contractor charges the same rate."
// It shipped as a per-job box and was re-typed on every changeout.
//
// Kept OUT of COMPANY_DEFAULT_KEYS deliberately: those are keys that map
// one-to-one onto a job field, and a test holds them to it. This one maps into
// manHoursJob.rate, so it is handled explicitly the way the crew is.
export const MANHOUR_RATE_KEY = 'manHoursRate';

// ── THE PART OF `rates` THE SHOP OWNS ────────────────────────────────────────
// state.rates was left out of the shop profile entirely, and it is three
// different kinds of thing wearing one name:
//
//   MARKET PRICES — cu, insul, hpPipeMultiplier. These belong to the day, not
//   to the shop. Copper moved by a factor of three the last time this app's
//   table was refreshed, and seeding a new bid with whatever last month's job
//   was priced at would be worse than the generic table, not better. NOT
//   captured.
//
//   THE SHOP'S PRACTICE — how much waste they buy, what they carry for
//   fittings, what they add on a fitting. Those do not change job to job, and
//   they were being re-typed on every bid or left at a number that came from
//   nobody. Captured.
//
//   A CHAIN'S SPEC — hangerSpacingFt is 6 because that is the Food Lion
//   standard. It belongs to the job in front of you, not to the shop. NOT
//   captured.
//
// Splitting them is the whole point: a shop keeps its practice and prices its
// copper today.
export const COMPANY_RATE_KEYS = [
  'wasteFactor',
  'fittingsMode', 'fittingsPct', 'fittingsMarkupPct',
  'hydronicFittingsPct',
  'ductAccessoryPct',
];

const isSet = v => v !== undefined && v !== null && v !== '';

// Pull the shop-level settings out of a job that has been set up correctly.
// This is the "these are my numbers" button: get one bid right, keep it.
export function captureCompanyDefaults(state = {}, crew = []) {
  const out = {};
  for (const k of COMPANY_DEFAULT_KEYS) {
    if (isSet(state[k])) out[k] = state[k];
  }
  // The rate off whichever labor mode this job used, so a residential job set
  // up correctly hands the shop its rate without a second button.
  if (isSet(state.manHoursJob?.rate) && Number(state.manHoursJob.rate) > 0) {
    out.manHoursRate = Number(state.manHoursJob.rate);
  }
  // Only the practice half of `rates` — see COMPANY_RATE_KEYS.
  const rates = {};
  for (const k of COMPANY_RATE_KEYS) {
    if (isSet(state.rates?.[k])) rates[k] = state.rates[k];
  }
  if (Object.keys(rates).length) out.rates = rates;
  // Roles and rates carry; ids do not — a new job mints its own.
  const list = (crew || []).filter(m => m && isSet(m.role));
  if (list.length) {
    out[CREW_KEY] = list.map(m => ({
      role: m.role,
      rate: parseFloat(m.rate) || 0,
      hrsPerDay: parseFloat(m.hrsPerDay) || 8,
      travels: m.travels !== false,
    }));
  }
  return out;
}

// Seed a NEW job. Returns only the keys that should be dispatched, so a caller
// can apply them without knowing which are set.
export function companyDefaultPatch(profile = {}, baseRates = {}) {
  const patch = {};
  for (const k of COMPANY_DEFAULT_KEYS) {
    if (isSet(profile[k])) patch[k] = profile[k];
  }
  // Rates MERGE onto the app's table rather than replacing it. The shop stored
  // its practice only; the copper prices have to come from the current table,
  // or a saved waste factor would arrive carrying an empty price list with it.
  if (profile.rates && Object.keys(profile.rates).length) {
    patch.rates = { ...baseRates, ...profile.rates };
  }
  // The stored rate seeds the man-hours box; the hours are always this job's.
  if (isSet(profile.manHoursRate) && Number(profile.manHoursRate) > 0) {
    patch.manHoursJob = { hours: 0, rate: Number(profile.manHoursRate) };
  }
  return patch;
}

export function hasCompanyDefaults(profile = {}) {
  return COMPANY_DEFAULT_KEYS.some(k => isSet(profile[k]))
    || (profile[CREW_KEY] || []).length > 0
    || Object.keys(profile.rates || {}).length > 0;
}

// ── HOW MANY OF THESE ARE ACTUALLY YOURS ─────────────────────────────────────
// "Unconfirmed" has been true of nearly every labor unit for months, so it has
// stopped being read. The question a contractor can act on is narrower and
// sharper: is this MY number yet, or am I still running on the one that
// shipped? That is answerable, it changes as they work, and it points at
// something to do.
//
// → { mine, total, still } counted against the app's shipped defaults.
export function unitsOwnership(profile = {}, shipped = {}) {
  const keys = Object.keys(shipped || {});
  const stored = profile?.laborUnits || {};
  let mine = 0;
  for (const k of keys) {
    // Set, and different from what shipped. A shop that deliberately types the
    // same number the app shipped has still not told us anything we did not
    // already assume, and counting it as theirs would overstate the ownership.
    if (isSet(stored[k]) && Number(stored[k]) !== Number(shipped[k])) mine += 1;
  }
  return { mine, total: keys.length, still: keys.length - mine };
}

// The stored crew, with fresh ids. Takes the id minter so this file stays pure.
export function companyCrew(profile = {}, mintId = () => Math.random().toString(36).slice(2)) {
  return (profile[CREW_KEY] || []).map(m => ({
    id: mintId(),
    role: m.role,
    rate: parseFloat(m.rate) || 0,
    hrsPerDay: parseFloat(m.hrsPerDay) || 8,
    ...(m.travels === false ? { travels: false } : {}),
  }));
}

// A plain-language summary for the settings card, so what is stored is visible
// rather than something the estimator has to take on trust.
export function describeCompanyDefaults(profile = {}) {
  const out = [];
  const crew = profile[CREW_KEY] || [];
  if (crew.length) {
    out.push(`${crew.length}-man standard crew — ${crew.map(m => `${m.role} $${m.rate}`).join(', ')}`);
  }
  if (isSet(profile.laborRateBasis)) {
    out.push(profile.laborRateBasis === 'cost'
      ? 'rates are burdened cost'
      : `rates are billing rates${isSet(profile.laborCostRatio) ? ` (cost ≈ ${Math.round(profile.laborCostRatio * 100)}%)` : ''}`);
  }
  if (isSet(profile.markupPct)) out.push(`${profile.markupPct}% markup`);
  if (isSet(profile.materialsTaxPct) && profile.materialsTaxPct > 0) out.push(`${profile.materialsTaxPct}% tax`);
  if (isSet(profile.bondPct) && profile.bondPct > 0) out.push(`${profile.bondPct}% bond`);
  if (isSet(profile.ootBasis)) out.push(`per diem per ${profile.ootBasis === 'person' ? 'person' : 'crew'}`);
  if (isSet(profile.manHoursRate)) out.push(`$${profile.manHoursRate}/man-hr on residential`);
  // Said as "measured on", not as a condition setting, because that is what it
  // means and the difference is the whole safety of the feature.
  if (isSet(profile.unitsBasis)) {
    const words = { new: 'ground-up', closed: 'closed-store remodel', live: 'live-store remodel' };
    out.push(`labor units measured on ${words[profile.unitsBasis] || profile.unitsBasis} work`);
  }
  const r = profile.rates || {};
  if (isSet(r.wasteFactor)) out.push(`${r.wasteFactor}% waste`);
  if (isSet(r.hydronicFittingsPct)) out.push(`${r.hydronicFittingsPct}% hydronic fittings`);
  if (isSet(r.ductAccessoryPct)) out.push(`${r.ductAccessoryPct}% duct hangers`);
  return out;
}

// One line for the settings card: how much of the labor library is the shop's
// own. Said as a count rather than a mark, because a count changes as they work
// and points at something to do.
export function ownershipNote(profile = {}, shipped = {}) {
  const { mine, total, still } = unitsOwnership(profile, shipped);
  if (!total) return null;
  if (!mine) {
    return `All ${total} labor units are still the ones this app shipped. They are a starting point, not `
      + 'your numbers — set the ones you know and save them here.';
  }
  if (!still) return `All ${total} labor units are yours.`;
  return `${mine} of ${total} labor units are yours; ${still} are still the ones this app shipped.`;
}
