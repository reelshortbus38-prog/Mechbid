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
  // Where the shop works.
  'materialsTaxPct', 'bondPct',
  // How the shop treats travel.
  'ootBasis', 'outOfTown',
  // The shop's own labor productivity, once it has been tuned against a job.
  'laborUnits',
  // Standing scope fence and conditions of bid.
  'exclusions', 'proposalTerms', 'bidValidDays',
  'preferredSupplier',
];

// The standard crew is a shop fact too, but it is a list rather than a scalar
// and it seeds differently — into whichever labor mode the job uses.
export const CREW_KEY = 'standardCrew';

const isSet = v => v !== undefined && v !== null && v !== '';

// Pull the shop-level settings out of a job that has been set up correctly.
// This is the "these are my numbers" button: get one bid right, keep it.
export function captureCompanyDefaults(state = {}, crew = []) {
  const out = {};
  for (const k of COMPANY_DEFAULT_KEYS) {
    if (isSet(state[k])) out[k] = state[k];
  }
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
export function companyDefaultPatch(profile = {}) {
  const patch = {};
  for (const k of COMPANY_DEFAULT_KEYS) {
    if (isSet(profile[k])) patch[k] = profile[k];
  }
  return patch;
}

export function hasCompanyDefaults(profile = {}) {
  return COMPANY_DEFAULT_KEYS.some(k => isSet(profile[k])) || (profile[CREW_KEY] || []).length > 0;
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
  if (isSet(profile.laborUnits)) out.push('tuned labor units');
  return out;
}
