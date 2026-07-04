// ── SCOPE-OF-WORK TEXT SECTIONS ──────────────────────────────────────────────
// Deterministic extraction of the machine-readable sections that flat scope
// docs (Food Lion remodel scope of work) carry near the end: the per-rack
// store-specific work list and the parts list. These sections have a rigid
// shape — "RACK A" heading followed by task lines, "PARTS LIST:" followed by
// "QTY - DESCRIPTION" lines — so regex parsing gets 100% of them, where AI
// extraction over a 15-page chunked doc has been observed to drop most of the
// parts and misfile rack work as notes. Same strategy as scheduleDates.js:
// deterministic first, AI fills in what these can't see.

// A rack heading is a line like "RACK A" / "RACK B2" on its own.
const RACK_HEADING_RE = /^RACK\s+([A-Z]\d?)\s*$/i;
// Headings that end a rack section (the parts list follows the rack sections
// in the Food Lion layout; a numbered clause list follows the parts).
const SECTION_END_RE = /^(PARTS\s*LIST|NOTES?:|\*\s*NOTE)/i;
// A numbered contract clause ("1.- REPAIR..." / "2. C7= ...") — not rack work.
const NUMBERED_CLAUSE_RE = /^\d+\s*\./;

// Extract per-rack work sections: [{ rack: 'A', tasks: ['CHANGE OIL SEPARATOR
// FLOAT', ...] }]. Task lines are kept verbatim (they're priced scope). A rack
// section ends at the next rack heading, a section-ending heading, a numbered
// clause, or a run of 3+ blank lines (rack sections are single-blank-line
// separated in real docs; a large gap means the section is over).
export function extractRackWorkSections(text) {
  if (!text) return [];
  const lines = String(text).split(/\r?\n/);
  const sections = [];
  let current = null;
  let blanks = 0;

  for (const raw of lines) {
    const line = raw.trim();

    if (!line) {
      blanks++;
      if (current && blanks >= 3) { sections.push(current); current = null; }
      continue;
    }
    blanks = 0;

    const rackMatch = line.match(RACK_HEADING_RE);
    if (rackMatch) {
      if (current) sections.push(current);
      current = { rack: rackMatch[1].toUpperCase(), tasks: [] };
      continue;
    }

    if (current) {
      if (SECTION_END_RE.test(line) || NUMBERED_CLAUSE_RE.test(line)) {
        sections.push(current);
        current = null;
        continue;
      }
      current.tasks.push(line);
    }
  }
  if (current) sections.push(current);

  return sections.filter(s => s.tasks.length > 0);
}

// A parts-list line: "8 - CPC SENSORS", "1 - ¼" ANGLE VALVE". The qty must be
// followed directly by a dash — numbered clauses ("1.- REPAIR...", "2. C7=...")
// have a period after the number, which naturally excludes them.
const PART_LINE_RE = /^(\d+)\s*[-–—]\s*(.+)$/;
const PARTS_HEADING_RE = /PARTS\s*LIST\s*:?/i;

// Extract the parts list: [{ qty: 8, desc: 'CPC SENSORS' }]. Scans every
// "PARTS LIST" heading in the doc (chunked docs can carry more than one) and
// reads consecutive QTY-DESC lines under it, tolerating blank lines between
// items; the list ends at the first non-matching non-blank line.
export function extractPartsList(text) {
  if (!text) return [];
  const lines = String(text).split(/\r?\n/);
  const parts = [];
  const seen = new Set();
  let inList = false;

  for (const raw of lines) {
    const line = raw.trim();

    if (PARTS_HEADING_RE.test(line)) { inList = true; continue; }
    if (!inList) continue;
    if (!line) continue; // blank lines inside the list are fine

    const m = line.match(PART_LINE_RE);
    if (!m) { inList = false; continue; }

    const desc = m[2].trim();
    const key = desc.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push({ qty: parseInt(m[1], 10) || 1, desc });
  }

  return parts;
}

// Normalized-description key for deduping AI-extracted items against the
// deterministic ones above (case/punctuation-insensitive).
export function normalizeDesc(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
