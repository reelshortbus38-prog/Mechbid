// ── FINDING THE ROW A FLAG IS ABOUT ──────────────────────────────────────────
// The refrigeration half of what api/pageMarks.js does for a drawing. A flag
// off the BPR says "3 circuit(s) are marked as changed but have NO new line
// sizes… B11; C6", and checking it meant opening the spreadsheet somewhere
// else and scrolling a sixty-row legend that is twenty-five columns wide.
//
// A BPR is not a page, so none of the page machinery applies. What it has is a
// circuit-ID column, and that is the row's address.
//
// MATCHING IS EXACT, PER CELL. A substring search for "B11" hits B110, and it
// hits the word B11 inside the note column three rows down. Both would box the
// wrong row, and a verify button that opens the wrong row is worse than none —
// the same rule the page marks are held to.
//
// Pure — no SheetJS, no React. A sheet arrives as a grid of rows of cells,
// which is what XLSX.utils.sheet_to_json(ws, { header: 1 }) already returns.

const cell = v => (v === null || v === undefined ? '' : String(v).trim());
const key = v => cell(v).toUpperCase();

// Rows whose circuit-ID cell IS one of these circuits. Returns grid indexes in
// sheet order, each with the id that matched, so the view can label the mark.
export function findCircuitRows(grid = [], circuits = []) {
  const want = new Set((circuits || []).map(key).filter(Boolean));
  if (!want.size) return [];
  const out = [];
  (grid || []).forEach((row, i) => {
    if (!Array.isArray(row)) return;
    for (const c of row) {
      const k = key(c);
      if (k && want.has(k)) { out.push({ row: i, id: k }); return; }
    }
  });
  return out;
}

// The header row, so a marked row is readable instead of twenty-five unlabelled
// values. Taken as the row with the most non-empty TEXT cells above the first
// hit — a BPR's header is words where every row below it is mostly numbers.
// Null when nothing above the hit looks like a header, and the view then shows
// the rows without one rather than captioning them with a wrong line.
export function headerRowIndex(grid = [], before = Infinity) {
  let best = null, bestScore = 1;   // 1, so a single stray word is not a header
  (grid || []).forEach((row, i) => {
    if (i >= before || !Array.isArray(row)) return;
    const words = row.filter(c => {
      const v = cell(c);
      return v.length > 1 && !/^[\d.,$%/-]+$/.test(v);
    }).length;
    if (words > bestScore) { bestScore = words; best = i; }
  });
  return best;
}

// The slice of sheet to show: the hits plus a little either side, so the row
// can be read against its neighbours rather than in isolation.
export function rowWindow(grid = [], hits = [], pad = 4) {
  const rows = (hits || []).map(h => (typeof h === 'number' ? h : h?.row)).filter(n => Number.isFinite(n));
  if (!rows.length) return null;
  const n = (grid || []).length;
  return {
    from: Math.max(0, Math.min(...rows) - pad),
    to: Math.min(Math.max(0, n - 1), Math.max(...rows) + pad),
  };
}

// Which columns are worth drawing. A BPR carries long stretches of empty
// columns between its groups, and on an iPad those are the difference between
// a table that fits and one that scrolls off the right edge. A column survives
// if anything in the visible window — or its header — has something in it.
export function usedColumns(grid = [], from = 0, to = 0, headerIdx = null) {
  const rows = [];
  for (let i = from; i <= to; i += 1) if (Array.isArray(grid[i])) rows.push(grid[i]);
  if (Number.isFinite(headerIdx) && Array.isArray(grid[headerIdx])) rows.push(grid[headerIdx]);
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const out = [];
  for (let c = 0; c < width; c += 1) {
    if (rows.some(r => cell(r[c]) !== '')) out.push(c);
  }
  return out;
}

// Everything the view needs, from a workbook read as { name, grid } sheets.
// Picks the first sheet that actually contains one of the circuits, because a
// BPR workbook has a tab per rack and the flag does not say which.
export function scheduleView(sheets = [], circuits = [], pad = 4) {
  for (const sheet of sheets || []) {
    const grid = sheet?.grid || [];
    const hits = findCircuitRows(grid, circuits);
    if (!hits.length) continue;
    const window = rowWindow(grid, hits, pad);
    // The header is looked for above the first HIT, not above the window.
    // Searching above the window start drops the header whenever the padding
    // reaches back far enough to touch it — which on a BPR is most of the time,
    // because the header sits a couple of rows above the first circuit. The
    // result was a table of twenty-five unlabelled numbers, in exactly the case
    // the labels were most needed.
    const headerIdx = headerRowIndex(grid, hits[0].row);
    // ...and it is drawn once, pinned at the top. A header inside the window
    // would otherwise appear twice — once as the heading and once as a data row
    // partway down, which reads as a second set of circuits.
    const from = Number.isFinite(headerIdx) && headerIdx !== null && headerIdx >= window.from
      ? Math.min(headerIdx + 1, hits[0].row)
      : window.from;
    return {
      sheetName: sheet?.name || '',
      grid,
      hits,
      hitRows: new Set(hits.map(h => h.row)),
      from,
      to: window.to,
      headerIdx,
      columns: usedColumns(grid, from, window.to, headerIdx),
      found: hits.map(h => h.id),
      // Circuits the flag named that are not on this tab. Said out loud rather
      // than quietly shown as if the row were the whole finding.
      missing: (circuits || []).map(key).filter(id => !hits.some(h => h.id === id)),
    };
  }
  return null;
}
