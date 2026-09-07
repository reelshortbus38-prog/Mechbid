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
// TWO SIZES, NOT ONE. The run is whatever the circuit is; the case is stubbed
// small — 5/8" suction and 3/8" liquid as a rule, and "some are different".
// Everything here is sized off one or the other, and the bushing spans them.
//
// Pure — no React, no store.

// Stub from the branch down to the case connection. Short, because the branch
// runs past the lineup; the length that matters is already in the circuit.
export const DEFAULT_STUB_FT = 5;

// ── THE DRAIN IS THE CASE, NOT THE WALK TO A HUB ────────────────────────────
// This was modelled as "distance from the case to the floor drain hub" and
// defaulted to 15 ft, which is the wrong SHAPE, not just the wrong number:
// "They try to have a hub under every case, so the longest run would be 12 ft
// on a 12 ft case, 8 ft on a 8 ft case."
//
// The hub is underneath. The pipe runs the length of the case and drops. So
// the quantity is the CASE LENGTH, and the setting says so — a shop running 8
// ft cases sets 8 and gets the right answer, which "distance to hub" never
// would have let them do.
export const DEFAULT_CASE_FT = 12;
export const DEFAULT_DRAIN_SIZE = '1-1/4"';

// ── THE CASE IS STUBBED SMALL, WHATEVER THE RUN IS ──────────────────────────
// The stubs took the circuit's own line size, which made a 1-1/8" run buy
// 1-1/8" stubs down to every case. It does not: "Case stubs are usually 5/8
// for suction and 3/8 for liquid. Some are different but that's what I would
// set as a default."
//
// The run size and the case size are two different numbers, and the fitting
// that spans them is the bushing — which is exactly the caveat the estimator
// attached to it. With both sizes known the bushing stops being a caveat and
// becomes a real 1-1/8" × 5/8" part.
export const DEFAULT_STUB_SUCTION = '5/8"';
export const DEFAULT_STUB_LIQUID = '3/8"';

// ── WHERE A CASE SITS IN THE LINEUP DECIDES ITS FITTINGS ────────────────────
// The piping runs along the case tops, and the two ends of that run are
// different jobs. The estimator gave both, and the difference between them is
// a TEE — which is the detail that makes the whole model make sense.
//
// THE END CASE. Nothing continues past it, so the run terminates: it turns
// down into the case and stops. No tee.
//
//   "For piping on top of the cases, just for the top of the case on the end
//    case, there is usually 2 ells, 1 street ell, a coupling, and a bushing
//    for suction. For liquid it would be 2 ells, a coupling and a bushing."
//
// THE START CASE. The run has to serve this case AND carry on to the next one,
// so it tees: one leg down into the case, one leg onward.
//
//   "For cases that start the line up it would be one coupling, one bushing, a
//    tee, and one ell for liquid and 2 for suction."
//
// Read as: the coupling, bushing and tee are on EACH line, and only the ell
// count differs between them — which is how the end case was described too,
// with its own coupling and bushing named for suction and again for liquid.
//
// EVERY CASE IN BETWEEN. The run passes over them and each one taps it:
//
//   "The middle cases just get a tee and 2 ells and coupling and bushing
//    depending on the size the case is stubbed up."
//
// These are the ones that MULTIPLY. Start and end are one set each per lineup;
// middle is one set per case, so a lineup of eight carries six of them — and
// until this was filled in they carried nothing at all, which made the middle
// of every lineup free. Two ells on both lines here, not the one-versus-two
// split the start case has.
//
// `at` says which pipe each fitting is ON, now that the run and the case are
// known to be different sizes. A tee sits in the RUN and is run-sized. The
// bushing SPANS the two — that is its whole job, and it is why the estimator
// tied the sizing caveat to that fitting and no other. Everything downstream of
// the bushing is on the stub and is stub-sized, which at 5/8" against a 1-1/8"
// run is a real difference: $9.60 an ell against $24.30.
//
// Only the tee's position is stated fact; the rest follows from a reducing
// branch being reduced at the bushing. If ells and couplings are really bought
// at run size, they are cheap to move — `at` is the one word to change.
export const MIDDLE_CASE_SUCTION = [
  { type: 'Elbow 90°', qty: 2, at: 'stub' },
  { type: 'Tee', qty: 1, at: 'run' },
  { type: 'Coupling', qty: 1, at: 'stub' },
  { type: 'Bushing', qty: 1, at: 'span' },
];
export const MIDDLE_CASE_LIQUID = [
  { type: 'Elbow 90°', qty: 2, at: 'stub' },
  { type: 'Tee', qty: 1, at: 'run' },
  { type: 'Coupling', qty: 1, at: 'stub' },
  { type: 'Bushing', qty: 1, at: 'span' },
];
export const END_CASE_SUCTION = [
  { type: 'Elbow 90°', qty: 2, at: 'stub' },
  { type: 'Street Ell', qty: 1, at: 'stub' },
  { type: 'Coupling', qty: 1, at: 'stub' },
  { type: 'Bushing', qty: 1, at: 'span' },
];
export const END_CASE_LIQUID = [
  { type: 'Elbow 90°', qty: 2, at: 'stub' },
  { type: 'Coupling', qty: 1, at: 'stub' },
  { type: 'Bushing', qty: 1, at: 'span' },
];
export const START_CASE_SUCTION = [
  { type: 'Elbow 90°', qty: 2, at: 'stub' },
  { type: 'Tee', qty: 1, at: 'run' },
  { type: 'Coupling', qty: 1, at: 'stub' },
  { type: 'Bushing', qty: 1, at: 'span' },
];
export const START_CASE_LIQUID = [
  { type: 'Elbow 90°', qty: 1, at: 'stub' },
  { type: 'Tee', qty: 1, at: 'run' },
  { type: 'Coupling', qty: 1, at: 'stub' },
  { type: 'Bushing', qty: 1, at: 'span' },
];

// Position → its fitting sets, its wording, and HOW MANY of it a lineup of n
// cases has. The count function is the whole point: start and end happen once,
// the middle happens per case, and getting that backwards is the difference
// between six sets of fittings and one.
//
//   1 case  → end only. It starts and ends at the same case and there is
//             nothing for a tee to carry the run on to.
//   2 cases → start + end, no middle.
//   n cases → start + end + (n − 2) middles.
export const LINEUP_POSITIONS = [
  { key: 'start', label: 'start case', suction: START_CASE_SUCTION, liquid: START_CASE_LIQUID,
    count: n => (n >= 2 ? 1 : 0), per: 'lineup' },
  { key: 'middle', label: 'middle case', suction: MIDDLE_CASE_SUCTION, liquid: MIDDLE_CASE_LIQUID,
    count: n => Math.max(0, n - 2), per: 'case' },
  { key: 'end', label: 'end case', suction: END_CASE_SUCTION, liquid: END_CASE_LIQUID,
    count: n => (n >= 1 ? 1 : 0), per: 'lineup' },
];

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
//   cases       case hookups on this lineup
//   sucSize     the RUN size for suction — the circuit's own line
//   liqSize     the RUN size for liquid
//   stubSuc     what the case is stubbed up with on suction (5/8" as a rule)
//   stubLiq     what the case is stubbed up with on liquid (3/8" as a rule)
//   stubFt      ft of stub per case, each line
//   caseFt      length of a case — the drain runs it and drops to the hub below
//   drainSize   PVC size
//   setsTxv     true when this shop sets the valves rather than the energy team
//   insulate    suction stubs are insulated at the circuit's temperature
//   endFittings include the end-of-lineup fitting set (once per lineup)
//
// → [{ section, desc, qty, unit, notes }] — no ids, no prices; the caller
// prices from its own rate tables so this module never guesses at money.
export function caseHookupLines({
  cases = 0, sucSize = '', liqSize = '',
  stubSuc = DEFAULT_STUB_SUCTION, stubLiq = DEFAULT_STUB_LIQUID,
  stubFt = DEFAULT_STUB_FT,
  caseFt = DEFAULT_CASE_FT, drainSize = DEFAULT_DRAIN_SIZE,
  setsTxv = false, insulate = true, endFittings = true,
} = {}) {
  const n = Math.max(0, Math.round(Number(cases) || 0));
  if (n === 0) return [];
  const stub = Math.max(0, Number(stubFt) || 0);
  const drain = Math.max(0, Number(caseFt) || 0);
  const lines = [];

  // The stub is the CASE's size, not the run's. This used to take the circuit's
  // line size, which bought 1-1/8" copper down to every case on a 1-1/8" run.
  if (stub > 0 && stubSuc) {
    lines.push({
      section: 'Case Hookups', desc: `${stubSuc} Case suction stubs`, qty: Math.ceil(n * stub), unit: 'ft',
      notes: `${n} case(s) × ${stub} ft — what the case is stubbed up with, off a ${sucSize || 'larger'} run`,
      pipeSize: stubSuc,
    });
  }
  if (stub > 0 && stubLiq) {
    lines.push({
      section: 'Case Hookups', desc: `${stubLiq} Case liquid stubs`, qty: Math.ceil(n * stub), unit: 'ft',
      notes: `${n} case(s) × ${stub} ft — what the case is stubbed up with, off a ${liqSize || 'larger'} run`,
      pipeSize: stubLiq,
    });
  }
  if (insulate && stub > 0 && stubSuc) {
    lines.push({
      section: 'Case Hookups', desc: `${stubSuc} Case stub insulation`, qty: Math.ceil(n * stub), unit: 'ft',
      notes: 'suction stubs are insulated at the circuit temperature, same as the run',
      pipeSize: stubSuc,
    });
  }

  // The drains. Left off the first draft entirely on the assumption they were
  // plumbing by others; they are not. A hub sits under each case, so the run is
  // the length of the case and no further.
  if (drain > 0) {
    lines.push({
      section: 'Case Hookups', desc: `${drainSize} PVC case drain — runs the case to the hub below`, qty: Math.ceil(n * drain), unit: 'ft',
      notes: `${n} case(s) × ${drain} ft — a hub under each case, so this is the CASE LENGTH, not a walk across the floor`,
    });
    lines.push({
      section: 'Case Hookups', desc: 'PVC drain fittings, hub adapters & solvent cement', qty: 1, unit: 'lot',
      notes: `elbows and couplings for ${n} drain run(s)`,
    });
  }

  // The run along the case tops: one set at each end, and one at every case in
  // between. See LINEUP_POSITIONS for why the start case tees, the end case
  // does not, and the middle is the part that multiplies.
  if (endFittings) {
    LINEUP_POSITIONS.forEach(pos => {
      const sets = pos.count(n);
      if (sets <= 0) return;
      const basis = pos.per === 'case'
        ? `${sets} middle case(s) on a ${n}-case lineup — the run passes over each one and it taps in`
        : `one set per lineup — the ${pos.label} where the piping runs along the case tops`;
      const set = (list, runSize, stubSize, line) => list.forEach(f => {
        // A fitting on the run needs the run size; on the stub, the stub size;
        // a bushing needs both, because spanning them is what it is for.
        const size = f.at === 'run' ? runSize : stubSize;
        if (!size) return;
        if (f.at === 'span' && !runSize) return;
        const label = f.at === 'span' ? `${runSize} × ${stubSize}` : size;
        lines.push({
          section: 'Case Hookups', desc: `${label} ${f.type} — ${line} at ${pos.label}`,
          qty: f.qty * sets, unit: 'ea',
          fittingType: f.type, pipeSize: size, spanSize: f.at === 'span' ? runSize : undefined,
          lineupPosition: pos.key, fittingAt: f.at,
          notes: f.at === 'span'
            ? `${basis} · reduces the ${runSize} run to the ${stubSize} case stub`
            : basis,
        });
      });
      set(pos.suction, sucSize, stubSuc, 'suction');
      set(pos.liquid, liqSize, stubLiq, 'liquid');
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

// ── STILL OPEN: WHAT THESE ADD TO THE LABOR ─────────────────────────────────
// There was a caseHookupJoints() here returning four per case — suction on and
// off, liquid on and off. It was a guess, and the end-case fitting set above
// replaced the guess with a counted list of real parts, so it went.
//
// Nothing now feeds case hookups into the BRAZING time, and that is deliberate
// rather than forgotten. The circuit already carries a fittings allowance, but
// that allowance is described as the ells a RUN takes crossing the store —
// whether it also covers the connections at the lineup is a question for the
// estimator, and quietly adding joints on top of it would double-count the
// exact way this app keeps finding elsewhere.
//
// The material is right. The labor for hooking a case up is still the flat
// perCase unit, now correctly multiplied by the case count.
