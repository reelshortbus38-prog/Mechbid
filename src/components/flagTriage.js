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
  /\bnot (?:a |an )?(?:full |dedicated |traditional |standard )?(?:specification|spec|equipment specification)(?: section| sheet| text| language)\b/i,
  /\bthis (?:sheet|page|document|section|excerpt)\b.{0,40}?\bcontains only\b/i,
  // "This document is a drawing sheet (…), not spec text" — the trailing noun
  // is not always preceded by an article, and the parenthetical between the
  // two halves can run long.
  /\bthis (?:is|document is|sheet is)\b.{0,80}?\b(?:floor plan|drawing sheet|schematic|diagram|legend)\b.{0,80}?\bnot\b/i,
  // "No furnished-by, warranty, T&B, or contact information present in
  // extracted text" — the analyzer listing what a sheet didn't carry.
  /\bpresent in (?:the )?extracted text\b/i,
  /\bin this text (?:extract|segment|excerpt)\b/i,
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

// ── THE STRUCTURAL RULE ──────────────────────────────────────────────────────
// Enumerating phrasings does not work. Each run the analyzer says the same
// thing a new way — "appear in sequence-of-operation text only", "This appears
// to be a narrative page rather than an equipment schedule page", "not
// schedule equipment with tags", "no equipment tags ... are shown on this
// sheet" — and every one slipped past a pattern list built from the run
// before. Matching prose against a growing list of sentences the model might
// write is a losing game.
//
// What every one of them has in common is structural, not lexical: they
// describe the DOCUMENT or the extraction pass, and they ask nothing of the
// contractor. A note that matters always demands something — shall, provide,
// install, calls for. A note that describes always talks about the sheet, the
// text, or what could be extracted from it.
//
// So: no requirement + talks about the document = diagnostic. That holds
// across phrasings nobody has written yet, which is the point.

// The flag asks the contractor to do, supply or pay for something.
// NOTE "furnished" is deliberately absent: "furnished-by", "owner-furnished"
// and "no furnished-by clauses are present" are NOUN phrases about who buys
// the equipment, not an instruction to furnish anything. Including it read
// the spec analyzer's "no furnished-by clauses present in this excerpt" as a
// requirement and kept it on screen. Real requirements say "shall be
// furnished", which "shall" already catches.
const REQUIREMENT_RE = /\b(?:shall|must|provide[sd]?|install(?:ed|ation)?|furnish(?:es|ing)?|coordinat(?:e|ion)|connect|route|seal|support(?:ed)?|calls? for|responsible for|include[sd]? in|is to be|are to be|to be (?:set|installed|provided|furnished))\b/i;

// The flag is about the sheet, or about the reading of it.
const ABOUT_THE_DOCUMENT_RE = /\bthis(?:\s+\w+){0,2}\s+(?:sheet|page|document|excerpt|drawing|section|text)\b|\b(?:on|in) this(?:\s+\w+){0,2}\s+(?:sheet|page|excerpt)\b|\bin this text\b|\bextract(?:ed|able|ion)?\b|\bschedule (?:table|page|rows?|data)\b|\bnarrative\b|\bappears? to be\b|\bsequence[-\s]of[-\s]operations?\b|\bper the rules\b|\bdrawing[-\s](?:schedule|keynote)s?\b|\bare shown on\b|\bnot (?:a |an )?(?:scheduled?|spec(?:ification)?)\b|\bno legible\b|\bwith no\b.{0,80}?\b(?:depicted|shown|visible|present)\b/i;

export function flagCategory(flag) {
  // An upstream pass that RESOLVED the flag against the takeoff knows more
  // than any regex can — coverage resolution can tell "these tags are already
  // priced" (bookkeeping) from "these tags were never scheduled" (a hole in
  // the bid), and those two read identically as text. Its call wins.
  if (flag && typeof flag === 'object' && flag.category) return flag.category;
  const text = String((typeof flag === 'string' ? flag : flag?.text) || '');
  if (!text.trim()) return 'note';
  if (NEVER_DIAGNOSTIC_RE.test(text)) return 'scope';
  if (DIAGNOSTIC_RE.some(re => re.test(text))) return 'diagnostic';
  // Describes the sheet and asks nothing of the contractor → transcript.
  if (!REQUIREMENT_RE.test(text) && ABOUT_THE_DOCUMENT_RE.test(text)) return 'diagnostic';
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
