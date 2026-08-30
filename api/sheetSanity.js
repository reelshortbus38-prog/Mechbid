// ── DID THE PARSER ACTUALLY READ THIS SHEET? ─────────────────────────────────
// Everything fixed on store 701 was found because a real file happened to be
// uploaded and a real estimator happened to know the right answer. That method
// works and it does not generalise: the next contractor sends a Kroger BPR, or
// Food Lion revises its template, and the parser meets a layout nobody has
// tested against.
//
// The failure that matters is not "read it wrong". It is "read NOTHING and said
// nothing". On 701 the Circuits step showed "No circuits yet", which is exactly
// what a job with no new work looks like. There was no way to tell the two
// apart, and the difference was most of the copper on the job.
//
// So this asks one question that needs NO knowledge of any format:
//
//     Does this sheet contain rows that look like circuits, and did we get any?
//
// A circuit-shaped row is a numeric id, some application text, and at least one
// pipe size. Every refrigeration schedule ever drawn has those three, whoever
// drew it. If a sheet has several and the parser returned none, either the
// format was not recognised or the whole job is existing work — and both are
// worth a human glance, so it says so rather than staying quiet.
//
// DELIBERATELY ONLY THE ZERO CASE. A ratio rule — "extracted far fewer than are
// present" — would fire on every remodel, because most rows on a remodel are
// existing circuits that are correctly excluded. On 701 eleven of twenty rows
// were right. A rule that cried wolf on every correct read would be turned off
// within a week, and then it would not be there for the one job that needed it.
//
// CommonJS, matching the Vercel function that uses it.

// Enough rows to mean the sheet really is a schedule rather than a stray number.
const MIN_SHAPED = 3;

const PIPE_SIZE = /^\s*\d?\s*\d{1,2}\s*\/\s*\d{1,2}\s*"?\s*$|^\s*\d\s+\d{1,2}\/\d{1,2}\s*"?\s*$|^\s*[1-4](\.\d+)?\s*"\s*$/;

function looksLikePipeSize(v) {
  const s = String(v === null || v === undefined ? '' : v).trim();
  if (!s) return false;
  return PIPE_SIZE.test(s);
}

// rows: raw 2D array of cell values, any format.
function countCircuitShapedRows(rows = []) {
  let n = 0;
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const cells = row.map(c => String(c === null || c === undefined ? '' : c).trim());
    // A numeric id in the first few columns.
    const hasId = cells.slice(0, 3).some(c => c !== '' && Number.isFinite(Number(c)) && Number(c) > 0 && Number(c) < 500);
    if (!hasId) continue;
    // Application text: a word or two of prose, not another number.
    const hasText = cells.some(c => c.length >= 4 && /[a-z]{3}/i.test(c) && !/^spare$/i.test(c));
    if (!hasText) continue;
    // And at least one pipe size, which is what makes it a CIRCUIT row rather
    // than any other numbered list.
    if (!cells.some(looksLikePipeSize)) continue;
    n++;
  }
  return n;
}

// Returns null when there is nothing to say.
function extractionSanity({ shaped = 0, extracted = 0, fileName = '' } = {}) {
  if (shaped < MIN_SHAPED) return null;
  if (extracted > 0) return null;
  return {
    severity: 'warn',
    shaped,
    message:
      `${fileName ? fileName + ': ' : ''}this sheet has ${shaped} rows that look like circuits — `
      + 'a numbered line with an application and a pipe size — but NONE were extracted. '
      + 'Either every circuit on this job is existing work, or the sheet is in a layout '
      + 'Coldgauge does not recognise yet. An empty circuit list looks the same either way, '
      + 'so check it before bidding, and send the file if the layout is new.',
  };
}

module.exports = { countCircuitShapedRows, extractionSanity, looksLikePipeSize, MIN_SHAPED };
