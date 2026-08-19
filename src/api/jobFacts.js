// ── THE JOB FACTS LEDGER ─────────────────────────────────────────────────────
// The app accumulates PARTS across sheets, and it accumulates FLAGS. It has
// never accumulated FACTS, and that is where the errors were hiding.
//
// Every real defect found by reading a live set this week needed two sheets in
// the same room at once:
//
//   pump scheduled 276 GPM @ 83 ft      pump schedule
//   + differential pressure held 8-12 PSI  control sequence
//   = a term missing from the head model, worth one motor frame
//
//   0.5 GPM drawn 3/4" at a fin tube     piping plan
//   + 0.5 GPM drawn 1/2" at a panel      same plan, different tag
//   = minimum connection is a device property, not a flow rule
//
//   25% glycol in the heat pump schedule  equipment schedule
//   + 20% PG at the make-up unit          specialties schedule
//   = an RFI
//
// None of those is visible on one sheet. The per-sheet checks the app already
// has — coverage, overlap, dedupe — cannot see any of them by construction,
// because each looks at one sheet at a time.
//
// A fact is a number, what it is about, and WHICH SHEET SAID SO. That last part
// is the whole point: a disagreement is only actionable if you can name the two
// documents that disagree.
//
// PROVENANCE IS ALSO WHAT MAKES RE-ANALYSIS SAFE. Facts are keyed by their
// source sheet and replaced wholesale when that sheet is re-read — the same
// rule the generated parts use via `src`, and for the same reason: without it,
// analysing a sheet twice doubles everything it found.
//
// Pure — no pdf.js, no React.

// What each kind of fact is, and how close two of them have to be before they
// are saying the same thing rather than disagreeing.
export const FACT_KINDS = {
  pumpFlow:    { unit: 'gpm', label: 'Pump design flow', tol: 0.02 },
  pumpHead:    { unit: 'ft',  label: 'Pump design head', tol: 0.02 },
  pumpEff:     { unit: '%',   label: 'Pump efficiency', tol: 0.03 },
  pumpRpm:     { unit: 'rpm', label: 'Pump speed', tol: 0.01 },
  pumpMotorHp: { unit: 'hp',  label: 'Pump motor', tol: 0 },
  dpSetpoint:  { unit: 'psi', label: 'Differential pressure setpoint', tol: 0.01 },
  fluidPct:    { unit: '%',   label: 'Glycol concentration', tol: 0 },
  equipCount:  { unit: 'ea',  label: 'Equipment count', tol: 0 },
  equipHead:   { unit: 'ft',  label: 'Equipment pressure drop', tol: 0.05 },
};

export const factUnit = kind => (FACT_KINDS[kind] ? FACT_KINDS[kind].unit : '');
export const factLabel = kind => (FACT_KINDS[kind] ? FACT_KINDS[kind].label : kind);

let seq = 0;

// subject is what the fact is ABOUT — a pump mark, a system name, an equipment
// type. Facts with the same kind and subject are talking about the same thing,
// which is what makes them comparable and therefore checkable.
export function newFact(kind, subject, value, { sheet = '', raw = '', unit = null, system = '' } = {}) {
  // Number('') and Number(null) are both 0, and a fact of 0 is indistinguishable
  // from one the sheet actually stated. A ledger whose whole value is that its
  // contents were on the page cannot afford an empty field becoming a zero.
  if (value === '' || value === null || value === undefined) return null;
  const v = Number(value);
  if (!FACT_KINDS[kind] || !Number.isFinite(v)) return null;
  return {
    id: `f${Date.now().toString(36)}${(seq++).toString(36)}`,
    kind,
    subject: String(subject || '').trim(),
    value: v,
    unit: unit || factUnit(kind),
    sheet: String(sheet || '').trim(),
    // Which water loop this is about, so nothing is compared across loops.
    system: String(system || '').trim(),
    raw: String(raw || '').trim().slice(0, 200),
  };
}

// ── ACCUMULATION ─────────────────────────────────────────────────────────────
// Replaces everything the named sheet contributed, then appends the new set.
// Re-reading a sheet must not add a second copy of what it already said.
export function mergeFacts(ledger = [], sheet, facts = []) {
  const s = String(sheet || '').trim();
  const kept = ledger.filter(f => f.sheet !== s);
  return [...kept, ...facts.filter(Boolean).map(f => ({ ...f, sheet: s }))];
}

export function dropSheet(ledger = [], sheet) {
  const s = String(sheet || '').trim();
  return ledger.filter(f => f.sheet !== s);
}

// ── COMPARING SUBJECTS ACROSS SHEETS ─────────────────────────────────────────
// Column-wrapped PDF text breaks words mid-token: one real sequence renders
// "heat pump header" as "heat pu mp header". Two sheets naming the same thing
// have to group together anyway, or a conflict between them is invisible. So
// subjects are compared with the spacing and punctuation taken out entirely.
export const subjectKey = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// ── WHICH LOOP A FACT BELONGS TO ─────────────────────────────────────────────
// A building runs several water systems at once and they share nothing but a
// mechanical room. The first run of the reconciler took a hydronic differential
// pressure setpoint and subtracted it from a condenser water pump, and from a
// 1/6 HP kitchen circulator that is on neither loop — producing a confident
// finding about a pump the setpoint has no bearing on.
//
// That is the same failure as the pipe coverage check reading "SEE 1/M10.06 FOR
// CONTROL SEQUENCE" as a fuel-oil line: a check that fires where it does not
// apply teaches the estimator to ignore it, which is worse than not having it.
// So facts carry the loop they are about, and only facts on the same loop are
// ever compared.
export const SYSTEMS = {
  hydronic: /\b(HYDRONIC WATER|HEATING WATER|HW|HHW|LOAD[- ]SIDE)\b/i,
  condenser: /\b(CONDENSER WATER|SOURCE[- ]SIDE|CW|CDW|WELL FIELD)\b/i,
  chilled: /\b(CHILLED WATER|CHW)\b/i,
  glycol: /\b(GLYCOL|PG LOOP)\b/i,
};

export function systemOf(text) {
  const s = String(text || '');
  // Longest, most specific patterns first — "CONDENSER WATER" must not be
  // decided by the bare "CW" branch of another system's alias.
  for (const key of ['chilled', 'condenser', 'hydronic', 'glycol']) {
    if (SYSTEMS[key].test(s)) return key;
  }
  return '';
}

export const factsOfKind = (ledger = [], kind) => ledger.filter(f => f.kind === kind);

export const sheetsInLedger = (ledger = []) => [...new Set(ledger.map(f => f.sheet).filter(Boolean))];

// Everything known about one subject, keyed by kind. Where a subject has the
// same kind from two sheets, the first is kept and the rest are still in the
// ledger for the conflict pass to find — this is a convenience view, not a
// resolution.
export function subjectFacts(ledger = [], subject) {
  const out = {};
  for (const f of ledger) {
    if (subjectKey(f.subject) !== subjectKey(subject)) continue;
    if (out[f.kind] === undefined) out[f.kind] = f;
  }
  return out;
}

export function subjectsWithKind(ledger = [], kind) {
  return [...new Set(ledger.filter(f => f.kind === kind && f.subject).map(f => f.subject))];
}

// A one-line read for a card header.
export function ledgerSummary(ledger = []) {
  const sheets = sheetsInLedger(ledger).length;
  const kinds = new Set(ledger.map(f => f.kind)).size;
  if (!ledger.length) return 'No facts read yet — analyse a sheet with a schedule or a control sequence on it';
  return `${ledger.length} fact(s) of ${kinds} kind(s), from ${sheets} sheet(s)`;
}
