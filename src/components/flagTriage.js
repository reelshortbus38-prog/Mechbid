// ── FLAG TRIAGE ──────────────────────────────────────────────────────────────
// A clean run should read like a takeoff, not a transcript. Analyzing a full
// set produces three very different kinds of note, and dumping them into one
// list makes a correct extraction LOOK like a pile of problems:
//
//   scope       "PROVIDE WIRE MESH SCREEN AT THE END OF THE RETURN DUCT"
//               — work the estimator has to price or qualify. The gold.
//   note        "DUCTWORK ELBOWS SHALL BE LONG RADIUS … PER SMACNA"
//               — a requirement that sets the material grade. Reference.
//   diagnostic  "This page contains only BMS/controls legend … no equipment
//               schedule table is present in this excerpt."
//               — the analyzer explaining what a sheet WASN'T. True, and
//               useless once the takeoff is built. This is what makes a good
//               run feel broken.
//
// Only diagnostics are demoted, and only on high-precision patterns: anything
// unrecognized stays visible. Data-COMPLETENESS warnings (truncated schedule,
// counts may be short) are deliberately NOT diagnostics — those change whether
// the numbers are trustworthy, so they stay up front.
//
// Pure — no React.

// Statements ABOUT the document or the extraction pass, rather than about the
// work. Drawn from the wording the analyzers actually produce.
const DIAGNOSTIC_RE = [
  // "no schedule table on this sheet" in its many phrasings
  /\bno (?:actual |extractable |individual )?(?:equipment |unit |terminal )?(?:schedule|rows?)\b[^.]*\b(?:present|found|provided|extract|available|captured)\b/i,
  /\bno (?:equipment|units?|rows?)\b[^.]*\bcould (?:be )?(?:extracted|captured)\b/i,
  /\bzero (?:scheduled )?units? could be extracted\b/i,
  /\bnot itemized as (?:equipment|tagged units)\b/i,
  /\bnot (?:a|an) (?:full |dedicated |traditional |standard )?(?:specification|spec|equipment specification) (?:section|sheet)\b/i,
  /\bthis (?:sheet|page|document|section|excerpt)\b.{0,40}?\bcontains only\b/i,
  /\bthis (?:is|document is|sheet is)\b.{0,80}?\b(?:floor plan|drawing sheet|schematic|diagram|legend)\b.{0,80}?\bnot (?:a|an)\b/i,
  // tags mentioned in narrative rather than scheduled
  /\breferenced (?:equipment )?tags? found in\b|\breferenced only within a sequence\b/i,
  /\bare (?:referenced|inferred) (?:as associated units|from narrative|only)\b/i,
  /\bthese are not separate (?:scheduled )?equipment\b/i,
  // process/telemetry lines the app emits about its own run
  /^read as a mechanical set\b/i,
  /^hvac takeoff\b/i,
  /^drawing scale detected\b/i,
  /^cad geometry cross-check\b/i,
  /\bcross-check: a second ai model\b/i,
  /\bmatch lines?\/callouts\b/i,
  /\bequipment (?:tags?|schedules?)[^.]*\b(?:carried|detailed|scheduled) (?:on|elsewhere)\b/i,
];

// Never demote these, even if a diagnostic pattern also matches: they speak to
// whether the NUMBERS are complete, which is the estimator's problem, not the
// analyzer's housekeeping.
const NEVER_DIAGNOSTIC_RE = /\btruncated\b|\bcut off\b|\bmay exist beyond\b|\bgarbled\b|\bfield verification\b|\bmisread\b|\bvendor[-\s]?package\b|\balternate\b|\badd\s*alt\b|\balt\s*#\s*\d|\bowner[-\s]?furnished\b|\bsuppressed\b|\bdropped as cross-references\b|\bfailed\b|\bre-run\b/i;

// Work the contractor has to perform or price — imperative, addressed to us.
const SCOPE_RE = /\b(?:provide|install|furnish|coordinate|connect|route|seal|support|coordinate with|coordinate all)\b/i;

export function flagCategory(flag) {
  const text = String((typeof flag === 'string' ? flag : flag?.text) || '');
  if (!text.trim()) return 'note';
  if (NEVER_DIAGNOSTIC_RE.test(text)) return 'scope';
  if (DIAGNOSTIC_RE.some(re => re.test(text))) return 'diagnostic';
  if (SCOPE_RE.test(text)) return 'scope';
  return 'note';
}

// Split a flag list into what the estimator acts on and what merely records
// how the read went. { actionable, diagnostics } — actionable keeps scope
// first (things to price), then reference notes, each in original order.
export function triageFlags(flags = []) {
  const scope = [], notes = [], diagnostics = [];
  for (const f of flags) {
    if (!f) continue;
    const cat = flagCategory(f);
    (cat === 'diagnostic' ? diagnostics : cat === 'scope' ? scope : notes).push(f);
  }
  return { actionable: [...scope, ...notes], scope, notes, diagnostics };
}
