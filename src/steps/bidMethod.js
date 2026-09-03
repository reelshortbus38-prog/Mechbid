// ── HOW IS THIS JOB BEING BID? ───────────────────────────────────────────────
// A working estimator, asked about the labor-unit questions: "all those
// questions is if they bid the job using time and materials."
//
// He is right that there are two methods, and the app supported both without
// ever asking which one a job was using:
//
//   LUMP SUM — crew and calendar. "Medium Temp Cases, four men, six nights,"
//   priced off the schedule. The unit hours never enter the number.
//
//   TIME & MATERIALS — the unit build-up. Hours per foot, per joint, per case,
//   multiplied through the takeoff and billed as tasks.
//
// They are two prices for the SAME work, and bidTotals added them. A job with
// crew periods filled in AND field tasks generated from its circuits carried
// the running labor twice, with nothing on screen saying so. A warning caught
// it after the fact; this removes the way in.
//
// Each method owns the total. Whichever one is not driving the bid stays fully
// visible and editable — a lump-sum job still wants its circuit hours as a
// cross-check on whether the crews cover the work, and a T&M job still wants
// the schedule to know how many nights it is on site.

export const LUMP_SUM = 'lumpSum';
export const TIME_AND_MATERIALS = 'tm';
// A job saved before this setting existed. It must NOT be silently assigned a
// method: doing that would change what an already-quoted job totals. Unset
// keeps the old behaviour exactly and asks the estimator to choose.
export const UNSET = 'unset';

export function resolveBidMethod(v) {
  return v === LUMP_SUM || v === TIME_AND_MATERIALS ? v : UNSET;
}

// Which side of the labor actually reaches the bid.
export function billedLabor(method) {
  switch (resolveBidMethod(method)) {
    case LUMP_SUM:            return { periods: true,  tasks: false };
    case TIME_AND_MATERIALS:  return { periods: false, tasks: true };
    default:                  return { periods: true,  tasks: true };
  }
}

export const METHOD_LABEL = {
  [LUMP_SUM]: 'Lump sum',
  [TIME_AND_MATERIALS]: 'Time & materials',
  [UNSET]: 'Not set',
};

// What each method means on screen, in the terms an estimator would use.
//
// These say LABOR every time, on purpose. This setting decides which side of
// the labor reaches the total and touches nothing else — the takeoff, the
// markup, the tax and the escalation all work the same either way. A crew job
// still has its materials calculated; the crew price is the labor half of the
// number, not the whole of it.
export const METHOD_BLURB = {
  [LUMP_SUM]: 'Crew and calendar carry the LABOR. Task hours stay as scope and cross-check — they are not added to the bid. Materials are taken off and priced exactly the same as on any other job.',
  [TIME_AND_MATERIALS]: 'The task list carries the LABOR. Crew periods stay as the schedule — nights on site and per diem — but their labor is not added. Materials are taken off and priced the same either way.',
  [UNSET]: 'Not chosen yet, so this job bills BOTH the crew periods and the task hours. If they cover the same work, the LABOR is in twice. Materials are unaffected.',
};

// Said plainly next to the switch, because "the crew price" sounds like the
// whole bid and it is half of it.
export const MATERIALS_NOTE =
  'Either way, materials are their own half of the bid — the takeoff, markup, tax and escalation '
  + 'are untouched by this setting. A crew job still has its copper, fittings, insulation and parts '
  + 'calculated the same as any other.';

// ── ESCALATION IS A FIXED-PRICE RISK ─────────────────────────────────────────
// Material escalation exists because a lump-sum number is quoted in month one
// and the copper is bought through month six, and the shop absorbs whatever
// moved in between. On a job billed at cost as it is used, that movement is
// passed through rather than absorbed — so carrying an escalation percentage
// on a T&M bid is charging for a risk somebody else is already holding.
//
// Informational, never automatic: plenty of "T&M" jobs have a not-to-exceed or
// a fixed material component, and zeroing a live number on a guess about which
// is not this app's call.
export function escalationFit(method, escalationPct) {
  const pct = Number(escalationPct) || 0;
  if (pct <= 0 || resolveBidMethod(method) !== TIME_AND_MATERIALS) return null;
  return {
    pct,
    note: `This bid carries ${pct}% material escalation, which covers copper moving between quoting and `
      + 'buying — a risk the shop absorbs on a fixed price. Billed at cost as it is used, that movement '
      + 'passes through to the customer instead. Worth a look before it goes out; leave it if the material '
      + 'side of this job is actually fixed.',
  };
}

// ── THE SAME DECISION, ASKED TWICE ───────────────────────────────────────────
// The Setup step had its own switch — "Tasks are notes" vs "Bid each task" —
// deciding whether an extracted scope task arrives as a billable field task
// with hours or as a scope note. That is not a second question. It is this one,
// asked earlier and worded differently:
//
//   lump sum       → labor is bought in bulk, so a scope task is a NOTE
//   time & materials → labor is billed task by task, so it is a LINE ITEM
//
// Two controls for one idea is how the double-count got in, so the method now
// answers both. taskBidMode is still honoured when no method has been chosen,
// because jobs and shops already have it set and it must not flip under them.
export function scopeTasksBecomeLineItems({ bidMethod, taskBidMode } = {}) {
  switch (resolveBidMethod(bidMethod)) {
    case TIME_AND_MATERIALS: return true;
    case LUMP_SUM:           return false;
    default:                 return taskBidMode === 'lineItems';
  }
}

// A lump-sum job still gets something real out of the unit build-up: whether
// the crews it has bought cover the hours the takeoff implies. That comparison
// was unavailable while the two were being summed instead of compared.
export function crewCoverage({ crewManHours = 0, takeoffManHours = 0 } = {}) {
  const bought = Number(crewManHours) || 0;
  const needed = Number(takeoffManHours) || 0;
  if (bought <= 0 || needed <= 0) return null;
  const ratio = bought / needed;
  // Deliberately wide. The takeoff covers running and connecting circuits; the
  // crews also demo, set cases, prep the rack and stand the punch list, so
  // bought hours SHOULD exceed it. This is a smell test, not a rule.
  const level = ratio < 1 ? 'short' : ratio > 3 ? 'loose' : 'ok';
  return {
    level, ratio, crewManHours: bought, takeoffManHours: needed,
    note: level === 'short'
      ? `The crews come to ${round(bought)} man-hours and running the circuits alone works out at `
        + `${round(needed)}. That leaves nothing for demo, setting cases, rack work or punch — worth a look before this goes out.`
      : level === 'loose'
        ? `The crews come to ${round(bought)} man-hours against ${round(needed)} for the circuit work — `
          + `${ratio.toFixed(1)}× . That can be right on a heavy remodel, and it is worth knowing it is that wide.`
        : `The crews come to ${round(bought)} man-hours; running the circuits accounts for about ${round(needed)} of it.`,
  };
}

function round(n) { return Math.round(n).toLocaleString('en-US'); }
