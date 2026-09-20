// ── DOES THIS BID AGREE WITH ITSELF? ─────────────────────────────────────────
// checkBidReadiness asks whether anything is MISSING — unpriced gear, duct with
// no footage. This asks a different question, and it is the one that has caught
// every expensive bug in this app: does the job agree with itself?
//
// Every real defect found in the last week was of that shape, and not one was
// caught by a unit test:
//
//   The Proposal step priced a job at 0% markup while the Materials step priced
//   the SAME state at 20%. $20,000 apart, both on screen at once.
//   A rack task set to zero men was displayed as zero and billed as one.
//   A saved job re-priced itself when a default moved.
//   Generated tasks claimed man-hours their own men × hrs did not come to.
//
// A unit test cannot see any of those, because each one is two correct-looking
// halves that disagree. You need the whole job in front of you and you need to
// compute the same number twice.
//
// ── AND IT IS THE THING THAT SUBSTITUTES FOR A REAL BID ──────────────────────
// Nobody has run a job through this app end to end. That is the largest open
// risk in it, and the two ways to close it — an estimator with a spare
// afternoon, or contractors trying it — are both outside anyone's control.
//
// This is the third way. It is a reconciliation the app can run on ANY job,
// including one built in a test, so the end-to-end pass that nobody has had
// time to do can at least be done against a realistic job on every commit.
//
// The report it produces carries NO customer identity — no store name, no
// address, no GC, no file names. Numbers and structure only. That is what makes
// it safe to paste into a chat or an email, which is the whole point: a
// contractor can send back something useful without sending anybody's drawings.
//
// Pure over state; no React, no network.

import { laborDoubleCount, countGeneratedTasks } from '../steps/laborMethod.js';
import { unitsOwnership } from '../state/companyDefaults.js';
import { taskMen } from '../steps/laborUnits.js';
import { pctOr } from '../state/numberField.js';
import { forMode } from '../state/tradeScope.js';
// The same two functions the task costing itself calls. Reading the rate any
// other way would be checking a different number than the bid used.
import { jobCrew, avgCrewRate } from '../state/store.js';

const round = (n, p = 2) => Math.round((Number(n) || 0) * 10 ** p) / 10 ** p;
const money = n => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');

// Two money figures that must be the same figure. A cent of floating-point
// drift is not a disagreement; a dollar is.
const DOLLAR_TOLERANCE = 1;

// ── THE CHECKS ───────────────────────────────────────────────────────────────
// Each returns null (nothing to say) or a finding. A finding is never a matter
// of taste: every one of these is the app contradicting itself, which is always
// a defect in the app even when the estimator could work around it.

// 1. THE SAME MARKUP EVERYWHERE. The bug this is named for: three readers of
//    state.markupPct with three different fallbacks, two of them on screen at
//    the same time showing different totals for one job.
function markupAgrees(state) {
  const readers = {
    'bid totals': pctOr(state?.markupPct, 20),
    'materials step': pctOr(state?.markupPct, 20),
    'scenario card': Number(state?.scenarios?.[state?.scenarios?.active]?.markupPct),
  };
  const seen = Object.entries(readers).filter(([, v]) => Number.isFinite(v));
  const values = [...new Set(seen.map(([, v]) => v))];
  if (values.length <= 1) return null;
  return {
    key: 'markupDisagrees', severity: 'blocker',
    title: `Two parts of the app are using different markups on this job: ${values.map(v => `${v}%`).join(' and ')}`,
    detail: seen.map(([who, v]) => `${who} ${v}%`).join(' · ')
      + '. The printed total depends on which screen you read it from, which means one of them is wrong.',
  };
}

// 2. A GENERATED TASK'S OWN NOTE. The generator writes "N man-hours over M men"
//    into the note and then stores men and hrs. If somebody edits one of them
//    the row still claims the old figure, and the note is what the estimator
//    reads when he is checking the bid.
function generatedTasksReconcile(state) {
  const tasks = forMode(state?.fieldTasks, state?.mode) || [];
  const off = [];
  for (const t of tasks) {
    const m = /Auto-estimated\s*—\s*([\d.]+)\s*man-hours/i.exec(String(t?.notes || ''));
    if (!m) continue;
    const claimed = Number(m[1]);
    const actual = taskMen(t, 0) * (Number(t?.hrs) || 0);
    if (Math.abs(claimed - actual) > 0.05) {
      off.push({ desc: String(t?.desc || '').slice(0, 40), claimed, actual: round(actual, 2) });
    }
  }
  if (!off.length) return null;
  return {
    key: 'taskNoteDrift', severity: 'warn',
    title: `${off.length} generated task${off.length === 1 ? '' : 's'} no longer match${off.length === 1 ? 'es' : ''} its own note`,
    detail: off.slice(0, 4).map(o => `"${o.desc}" says ${o.claimed} man-hrs, bills ${o.actual}`).join(' · ')
      + '. The hours or the crew were edited after the row was generated. The bid uses men × hrs; '
      + 'the note is what you read when checking it, and they no longer say the same thing.',
  };
}

// 3. BOTH LABOR METHODS FILLED IN. Existing engine, surfaced here so one report
//    carries everything.
function laborNotDoubled(state, totals) {
  const hit = laborDoubleCount({
    periodsTotal: Number(totals?.laborTotal) || 0,
    fieldTasksTotal: Number(totals?.fieldTasksTotal) || 0,
    rackLaborTotal: Number(totals?.rackLaborTotal) || 0,
    autoGeneratedCount: countGeneratedTasks(forMode(state?.fieldTasks, state?.mode)),
  });
  if (!hit) return null;
  return {
    key: 'laborDoubleCount',
    severity: hit.severity === 'blocker' ? 'blocker' : 'warn',
    title: 'This bid may be carrying its labor twice',
    detail: hit.message,
  };
}

// 4. THE TOTAL IS THE SUM OF WHAT IS PRINTED. The most basic promise a bid
//    makes, and the one nobody checks: the number at the bottom is the number
//    above it added up.
function totalIsTheSum(totals) {
  if (!totals || !Number.isFinite(Number(totals.total))) return null;
  const parts = [
    'equipTotal', 'matsTotal', 'partsTotal', 'linesetTotal', 'laborTotal',
    'rackLaborTotal', 'fieldTasksTotal', 'ootTotal', 'rentalsTotal', 'subsTotal',
    'escalationAmt', 'consumablesAmt', 'markupAmt', 'taxAmt', 'bondAmt', 'permitFee',
  ].reduce((s, k) => s + (Number(totals[k]) || 0), 0);
  const gap = Number(totals.total) - parts;
  if (Math.abs(gap) <= DOLLAR_TOLERANCE) return null;
  return {
    key: 'totalDoesNotSum', severity: 'blocker',
    title: `The bid total is ${money(Math.abs(gap))} ${gap > 0 ? 'more' : 'less'} than its own line items add up to`,
    detail: `Total ${money(totals.total)} against ${money(parts)} of parts. Either a category is being counted `
      + 'twice or one is missing from the printed breakdown. Send this diagnostic — it is an app bug, not a takeoff problem.',
  };
}

// 5. A REFRIGERATION JOB WHERE NOTHING WAS EVER ROUTED. Not a contradiction —
//    a silence. inFloor is off by default and changes the joint count, the
//    hangers and the copper, and until the pit & conduit plan is read nothing
//    tells anybody it exists.
function routingWasConsidered(state) {
  const circuits = state?.circuits || [];
  if (circuits.length < 3) return null;
  const anyRouted = circuits.some(c => c?.inFloor);
  const readPitPlan = (state?.pitConduitReads || []).length > 0;
  if (anyRouted || readPitPlan) return null;
  const longRuns = circuits.filter(c => (Number(c?.runLength) || 0) >= 100).length;
  if (!longRuns) return null;
  return {
    key: 'noRoutingSet', severity: 'warn',
    title: `${circuits.length} circuits and not one is marked as running in the floor`,
    detail: `${longRuns} of them run 100 ft or more. That may be right — plenty of stores run everything overhead — `
      + 'but a below-slab run is soft coil at 50 ft between joints instead of 20 ft of hard stick, takes no hangers '
      + 'and buys different copper. If this store has pipe under the floor, upload the pit & conduit plan or tick '
      + 'the box on the Circuits step.',
  };
}

// 6. EVERY HOUR PRICED AT THE APP'S FALLBACK RATE.
//    Found by running this check against a realistic job, which is the whole
//    reason it exists.
//
//    Field and rack tasks cost themselves as men x hrs x avgCrewRate(jobCrew).
//    jobCrew reads the FIRST LABOR PERIOD'S crew — there is no separate crew
//    list. So a job bid the time-and-materials way, where the task list carries
//    the labor and there are no crew periods at all, has no crew anywhere, and
//    every hour in it silently falls through to FALLBACK_MANHOUR_RATE: $100.
//
//    That is precisely the method a T&M contractor uses, and the app's own
//    position is that "no contractor charges the same rate." A shop billing
//    $118 is nine thousand dollars light on a five-hundred-hour job and nothing
//    on screen says a word. The fallback is right — a task entered before the
//    Labor step should not read as free — but it must not be silent.
function laborRateIsTheirs(state, totals) {
  const taskLabor = (Number(totals?.fieldTasksTotal) || 0) + (Number(totals?.rackLaborTotal) || 0);
  if (taskLabor <= 0) return null;
  // avgCrewRate(jobCrew(state)) is exactly what calcFieldTaskCost calls, so
  // this is the rate the bid actually used, not a second opinion about it.
  if (avgCrewRate(jobCrew(state)) > 0) return null;
  return {
    key: 'fallbackRate', severity: 'blocker',
    title: `${money(taskLabor)} of labor is priced at the app's $100/man-hour fallback, not your rate`,
    detail: 'No crew is set on this job, so every task hour fell back to the app\'s number. The crew comes off the '
      + 'labor periods — on a time-and-materials bid, where the task list carries the labor, it is easy to have no '
      + 'period at all and therefore no rate. Add a period with your crew and rates (its days can be zero), or set '
      + 'your standard crew on the Proposal step so every new job starts from it.',
  };
}

// 7. RUNNING ON SOMEBODY ELSE'S NUMBERS. Not a defect, and the single most
//    useful line in a beta tester's report: it says whether the figures that
//    produced this bid were ever theirs.
function unitsAreTheirs(profile, shipped) {
  const { mine, total } = unitsOwnership(profile, shipped);
  if (!total || mine > 0) return null;
  return {
    key: 'shippedUnits', severity: 'info',
    title: `All ${total} labor units are still the ones the app shipped`,
    detail: 'Fine for building a bid against, wrong to send one out on. They came from one shop\'s numbers, '
      + 'not yours — set the ones you know on the Labor step and save them.',
  };
}

// 8. A JOB PRICED ON UNITS THAT HAVE SINCE MOVED. Not a bug — the app freezes
//    each job on the units it was bid with, on purpose. But it explains a
//    discrepancy an estimator would otherwise chase, so the report says it.
function unitsAsBid(state, shipped) {
  const stamped = state?.laborUnits;
  if (!stamped || !shipped) return null;
  const moved = Object.keys(shipped).filter(k => Number(stamped[k]) !== Number(shipped[k]));
  if (!moved.length) return null;
  return {
    key: 'unitsFrozen', severity: 'info',
    title: `${moved.length} labor unit${moved.length === 1 ? '' : 's'} on this job differ from today's defaults`,
    detail: `${moved.slice(0, 6).join(', ')}. That is deliberate: a saved bid keeps the numbers it was quoted `
      + 'with, so changing a default never re-prices work you have already sent out. Mentioned because it explains '
      + 'why this job and a new one can estimate differently.',
  };
}

// ── THE WHOLE CHECK ──────────────────────────────────────────────────────────
export function selfCheck(state = {}, totals = {}, { profile = {}, shipped = {} } = {}) {
  const findings = [
    markupAgrees(state),
    totalIsTheSum(totals),
    laborNotDoubled(state, totals),
    generatedTasksReconcile(state),
    laborRateIsTheirs(state, totals),
    routingWasConsidered(state),
    unitsAreTheirs(profile, shipped),
    unitsAsBid(state, shipped),
  ].filter(Boolean);

  const rank = { blocker: 0, warn: 1, info: 2 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return {
    findings,
    blockers: findings.filter(f => f.severity === 'blocker').length,
    warnings: findings.filter(f => f.severity === 'warn').length,
    // The headline. "Agrees with itself" is a narrower claim than "is right",
    // and the difference is the point — this cannot tell you the hours are
    // correct, only that nothing in here contradicts anything else.
    verdict: findings.some(f => f.severity === 'blocker')
      ? 'This bid contradicts itself. Do not send it until the blockers below are understood.'
      : findings.some(f => f.severity === 'warn')
        ? 'Nothing in this bid contradicts itself outright, but the warnings below are worth a look.'
        : 'Everything in this bid reconciles. That is not the same as being right — it means nothing here '
          + 'disagrees with anything else, and the numbers themselves are still yours to check.',
  };
}

// ── THE REPORT ───────────────────────────────────────────────────────────────
// Numbers and structure. NO customer identity: no store name, no address, no
// GC, no file names, no circuit IDs. A contractor has to be able to send this
// without sending anybody's job, or he will not send it.
//
// That constraint is not politeness. A diagnostic that carries a store name is
// one the estimator has to read carefully before pasting, which means most of
// the time he will not paste it at all.
export function bidDiagnostic(state = {}, totals = {}, opts = {}) {
  const check = selfCheck(state, totals, opts);
  const circuits = state?.circuits || [];
  const tasks = forMode(state?.fieldTasks, state?.mode) || [];
  const L = [];

  L.push('COLDGAUGE DIAGNOSTIC');
  L.push('Structure and arithmetic only — no store name, address, contractor or file names.');
  L.push('');
  L.push(`Trade            ${state?.mode || '(not set)'}`);
  L.push(`Project type     ${state?.projectType || 'remodel'}`);
  L.push(`Labor method     ${state?.laborMode || 'periods'}${state?.bidMethod ? ` · bid as ${state.bidMethod}` : ''}`);
  L.push(`Circuits         ${circuits.length}${circuits.length ? ` · ${circuits.filter(c => c?.inFloor).length} in floor` : ''}`);
  L.push(`Field tasks      ${tasks.length} · ${countGeneratedTasks(tasks)} generated`);
  L.push(`Labor periods    ${(state?.laborPeriods || []).length}`);
  L.push(`Rack tasks       ${(state?.rackTasks || []).length}`);
  L.push(`Line items       ${(state?.lineItems || []).length}`);
  L.push(`Flags            ${(state?.flags || []).length}`);
  L.push(`Exclusions       ${(state?.exclusions || []).filter(x => x && x.trim()).length}`);
  L.push('');

  const ownership = unitsOwnership(opts.profile || {}, opts.shipped || {});
  if (ownership.total) L.push(`Labor units      ${ownership.mine} of ${ownership.total} are this shop's own`);
  L.push(`Markup           ${pctOr(state?.markupPct, 20)}%`);
  const rate = avgCrewRate(jobCrew(state));
  L.push(`Crew rate        ${rate > 0 ? money(rate) + '/man-hr' : "none set — tasks at the app's $100 fallback"}`);
  L.push('');

  L.push('TOTALS');
  for (const [label, key] of [
    ['Equipment', 'equipTotal'], ['Materials', 'matsTotal'], ['Parts', 'partsTotal'],
    ['Labor (crew)', 'laborTotal'], ['Labor (tasks)', 'fieldTasksTotal'], ['Labor (rack)', 'rackLaborTotal'],
    ['Out of town', 'ootTotal'], ['Escalation', 'escalationAmt'], ['Consumables', 'consumablesAmt'],
    ['Markup', 'markupAmt'], ['Tax', 'taxAmt'], ['Bond', 'bondAmt'],
  ]) {
    const v = Number(totals?.[key]);
    if (Number.isFinite(v) && v !== 0) L.push(`  ${label.padEnd(16)} ${money(v)}`);
  }
  L.push(`  ${'TOTAL'.padEnd(16)} ${money(totals?.total)}`);
  L.push('');

  L.push('SELF-CHECK');
  L.push(check.verdict);
  if (check.findings.length) {
    L.push('');
    for (const f of check.findings) {
      L.push(`[${f.severity.toUpperCase()}] ${f.title}`);
      L.push(`  ${f.detail}`);
    }
  }
  return L.join('\n');
}
