// ── HOOKING UP A CASE ───────────────────────────────────────────────────────
// The most repeated job on a supermarket remodel. A store has forty of them and
// the takeoff had none — case work existed only as a single labor unit, and the
// material it consumes was folded invisibly into circuit footage.
//
// What is actually in one, from the estimator who does them:
//
//   ONE SUCTION BRANCH SERVES A LINEUP. "One 1-1/8 suction could run multiple
//   cases." So a hookup is a short drop off a branch that is already running
//   past, not a home run back to the rack. The stubs are small; the branch is
//   where the real footage is, and the circuit's run length already carries it.
//
//   THE VALVES ARE NOT HERE. On a direct-expansion job — anything that is not a
//   secondary loop — "the EPR and liquid ball valves are on the rack." They are
//   rack parts, they are already on the rack parts list, and putting a liquid
//   ball valve at every case would buy forty valves that live in the motor
//   room. This module deliberately does not price them.
//
//   TXVs ARE MOSTLY SOMEBODY ELSE'S. "Sometimes we set the TXV but I think the
//   energy team comes in and sets them now." Off by default, with a switch,
//   because a shop that does set them is buying and installing forty of them.
//
//   THE DRAINS ARE THEIRS. "We run all drains from the case to the drain hub on
//   the floor." This was the biggest hole — the first draft of this module left
//   drains out entirely on the assumption they were plumbing by others. Forty
//   cases of PVC to floor hubs is real money that was on nobody's list.
//
// Line SIZES are not decided here. "A lot of that is determined by how long the
// run is and what each case carries as far as what it needs to run properly" —
// so the stub takes the circuit's own size as a starting point and the
// estimator changes it, rather than this module inventing a rule.
//
// Pure — no React, no store.

// Stub from the branch down to the case connection. Short, because the branch
// runs past the lineup; the length that matters is already in the circuit.
export const DEFAULT_STUB_FT = 5;
// Case to the floor drain hub. Varies with where the hub landed, which is why
// it is a setting and not a constant.
export const DEFAULT_DRAIN_FT = 15;
export const DEFAULT_DRAIN_SIZE = '1-1/4"';
// Suction on, suction off, liquid on, liquid off.
export const JOINTS_PER_CASE = 4;

// ── READING THE CASE COUNT OFF THE LEGEND ───────────────────────────────────
// "The legend that I upload usually says what cases are hooked to each
// circuit." It is already in the app: the circuit's application field carries
// exactly that, and the placeholder in the UI has said so from the start —
// "MD Produce 2-4, N71" is a medium-temp circuit feeding produce cases 2
// through 4.
//
// So the count is often sitting in text the app already extracted, and asking
// somebody to re-type it is asking them to copy from one box into another.
//
// This SUGGESTS, it does not set. A range that reads as three cases might be
// two cases and a mislabel, and a wrong count now multiplies straight into the
// labor. The estimator taps to accept.
//
// → { cases, basis } or null when nothing case-shaped is in the string.
export function casesFromApplication(application) {
  const s = String(application || '');
  if (!s.trim()) return null;

  // A range: "Produce 2-4", "DAIRY 12-18". Hyphen, en dash or "to".
  // Anchored to a word boundary so it cannot read a pipe size ("1-1/8") or a
  // drawing tag ("N71") as a case range.
  const range = s.match(/\b(\d{1,3})\s*(?:-|–|—|\bto\b)\s*(\d{1,3})\b(?!\s*\/)/);
  if (range) {
    const lo = Number(range[1]), hi = Number(range[2]);
    // Descending or absurd is not a case range, it is something else.
    if (hi >= lo && hi - lo < 40) {
      return { cases: hi - lo + 1, basis: `"${range[0]}" reads as cases ${lo} through ${hi}` };
    }
  }

  // A list: "Produce 2, 3, 4" or "Deli 6 & 7".
  const list = s.match(/\b\d{1,3}(?:\s*(?:,|&|and)\s*\d{1,3})+\b/);
  if (list) {
    const nums = list[0].match(/\d{1,3}/g) || [];
    if (nums.length > 1) {
      return { cases: nums.length, basis: `"${list[0].trim()}" reads as ${nums.length} cases` };
    }
  }

  return null;
}

// ── THE MATERIAL ────────────────────────────────────────────────────────────
// One set of lines for a whole job, already multiplied by the case count. The
// caller passes total cases rather than looping, because the estimate wants one
// "Case suction stubs" line, not forty.
//
// opts:
//   cases       total case hookups on the job
//   sucSize     stub size for suction — the circuit's own size, as a start
//   liqSize     stub size for liquid
//   stubFt      ft of stub per case, each line
//   drainFt     ft of PVC per case to the floor hub
//   drainSize   PVC size
//   setsTxv     true when this shop sets the valves rather than the energy team
//   insulate    suction stubs are insulated at the circuit's temperature
//
// → [{ section, desc, qty, unit, notes }] — no ids, no prices; the caller
// prices from its own rate tables so this module never guesses at money.
export function caseHookupLines({
  cases = 0, sucSize = '', liqSize = '', stubFt = DEFAULT_STUB_FT,
  drainFt = DEFAULT_DRAIN_FT, drainSize = DEFAULT_DRAIN_SIZE,
  setsTxv = false, insulate = true,
} = {}) {
  const n = Math.max(0, Math.round(Number(cases) || 0));
  if (n === 0) return [];
  const stub = Math.max(0, Number(stubFt) || 0);
  const drain = Math.max(0, Number(drainFt) || 0);
  const lines = [];

  if (stub > 0 && sucSize) {
    lines.push({
      section: 'Case Hookups', desc: `${sucSize} Case suction stubs`, qty: Math.ceil(n * stub), unit: 'ft',
      notes: `${n} case(s) × ${stub} ft — drop off the branch, not a run back to the rack`,
      pipeSize: sucSize,
    });
  }
  if (stub > 0 && liqSize) {
    lines.push({
      section: 'Case Hookups', desc: `${liqSize} Case liquid stubs`, qty: Math.ceil(n * stub), unit: 'ft',
      notes: `${n} case(s) × ${stub} ft`,
      pipeSize: liqSize,
    });
  }
  if (insulate && stub > 0 && sucSize) {
    lines.push({
      section: 'Case Hookups', desc: `${sucSize} Case stub insulation`, qty: Math.ceil(n * stub), unit: 'ft',
      notes: 'suction stubs are insulated at the circuit temperature, same as the run',
      pipeSize: sucSize,
    });
  }

  // The drains. Left off the first draft entirely on the assumption they were
  // plumbing by others; they are not. Forty cases to floor hubs is real pipe.
  if (drain > 0) {
    lines.push({
      section: 'Case Hookups', desc: `${drainSize} PVC case drain — case to floor hub`, qty: Math.ceil(n * drain), unit: 'ft',
      notes: `${n} case(s) × ${drain} ft — set the run length to the hub distance on this store`,
    });
    lines.push({
      section: 'Case Hookups', desc: 'PVC drain fittings, hub adapters & solvent cement', qty: 1, unit: 'lot',
      notes: `elbows and couplings for ${n} drain run(s)`,
    });
  }

  if (setsTxv) {
    lines.push({
      section: 'Case Hookups', desc: 'TXV / expansion valve — field set', qty: n, unit: 'ea',
      notes: 'ON because this job sets its own valves. Turn it off if the energy team sets them.',
    });
  }

  return lines;
}

// Braze joints the case hookups add, for the labor side. Four per case —
// suction on and off, liquid on and off — and they are NOT already in the
// circuit's fittings allowance, which covers the ells the RUN takes getting
// across the store.
export function caseHookupJoints(cases = 0) {
  return Math.max(0, Math.round(Number(cases) || 0)) * JOINTS_PER_CASE;
}
