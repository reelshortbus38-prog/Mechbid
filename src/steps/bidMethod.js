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
export const METHOD_BLURB = {
  [LUMP_SUM]: 'Crew and calendar carry the price. Task hours stay as scope and cross-check — they are not added to the bid.',
  [TIME_AND_MATERIALS]: 'The task list carries the price. Crew periods stay as the schedule — nights on site and per diem — but their labor is not added to the bid.',
  [UNSET]: 'Not chosen yet, so this job bills BOTH the crew periods and the task hours. If they cover the same work, the labor is in twice.',
};

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
