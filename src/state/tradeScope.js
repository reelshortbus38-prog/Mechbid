// ── WHICH TRADE A RECORD BELONGS TO ──────────────────────────────────────────
// A job has ONE mode. computeBidTotals proves it: Commercial HVAC totals
// hvacEquipment + hvacParts, Commercial Refrigeration totals lineItems +
// rackParts, and neither ever adds the other's. Switching mode is meant to say
// "this job is an HVAC job", not "show me the HVAC tab of a combined job".
//
// But several buckets are SHARED by both modes — fieldTasks, flags, the
// extraction log — because both trades use the same Setup and Labor steps. Data
// created in one mode stayed visible in the other, and in the case of
// fieldTasks it was also BILLED there: a refrigeration case-move task pushed by
// the redline extractor landed in the subtotal of an HVAC bid. That is the
// difference between an untidy screen and a wrong number.
//
// So records carry the mode they were created under, and the readers filter.
//
// The one rule that matters: a record with NO mode stamp predates this and is
// shown and counted EVERYWHERE. Hiding a line an estimator entered by hand is
// worse than showing it somewhere unexpected — a missing line is silent, and
// silence in a bid is what loses money.
//
// Pure — no React.

export const REFRIGERATION = 'Commercial Refrigeration';
export const COMMERCIAL_HVAC = 'Commercial HVAC';
export const RESIDENTIAL_HVAC = 'Residential HVAC';

// Rack work is refrigeration by definition — there is no rack on an HVAC job.
export const RACK_MODES = [REFRIGERATION];

export function belongsToMode(record, mode) {
  if (record === null || record === undefined) return false;
  // Strings are the legacy extraction-log shape: no stamp, so shown everywhere.
  if (typeof record !== 'object') return true;
  const m = record.mode;
  if (m === undefined || m === null || m === '') return true;
  return m === mode;
}

export function forMode(list, mode) {
  return (list || []).filter(r => belongsToMode(r, mode));
}

// Stamp records as they are created, so the filter above has something to read.
export function stampMode(list, mode) {
  return (list || []).map(r => (
    r && typeof r === 'object' ? { ...r, mode: r.mode || mode } : { text: String(r), mode }
  ));
}

// The extraction log held plain strings before trade scoping and holds
// { text, mode } after it. Every reader goes through here so both render.
export function resultText(r) {
  if (typeof r === 'string') return r;
  return (r && r.text) || '';
}
