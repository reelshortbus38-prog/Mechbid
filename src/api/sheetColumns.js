// ── READING A SCHEDULE BY ITS COLUMNS ────────────────────────────────────────
// The flat text layer loses the one thing a schedule is made of. A row arrives
// as twenty numbers in a line and nothing says which is capacity and which is
// glycol, because the header that would say so is on a different line and only
// the x position connects them.
//
// So the fact extractor refused to read them, deliberately: a number guessed at
// from column order would sit in the ledger looking exactly like a read one.
// This is what makes them readable properly.
//
// THE HEADER IS THE ANCHOR AND THE GEOMETRY IS EXACT. On a real sheet the
// GLYCOL % header centres at x=352.9 and the value in every heat pump row
// centres at x=352.9 — off by zero. Schedules are machine-drawn; the columns
// line up because a computer put them there. The nearest numeric to a header's
// centre is the value under it, and the runner-up on that row is 17 points away.
//
// A VALUE MUST STILL BE UNDER ITS OWN HEADER. Nearest alone would read the next
// column along whenever a cell is blank, which is how a schedule with a gap in
// it produces a confident wrong answer. So a candidate has to fall inside the
// header's own span widened a little, and a blank cell yields nothing.
//
// Pure — no pdf.js, no React. Takes positioned items: { s, x, y, w }.

export const centerX = it => Number(it.x) + Number(it.w || 0) / 2;

// Rows are bands of y. PDF text on one printed line varies by a point or so.
export const ROW_TOL = 2.5;

export function rowsFrom(items = [], tol = ROW_TOL) {
  const sorted = [...items].filter(i => i && String(i.s || '').trim()).sort((a, b) => b.y - a.y);
  const rows = [];
  for (const it of sorted) {
    const row = rows.find(r => Math.abs(r.y - it.y) <= tol);
    if (row) row.items.push(it);
    else rows.push({ y: it.y, items: [it] });
  }
  for (const r of rows) r.items.sort((a, b) => a.x - b.x);
  return rows;
}

// How far outside a header's own span a value may sit and still belong to it.
// Proportional to the header, so a wide column tolerates more than a narrow one
// — and tight enough that the neighbouring column is never in range.
export const PAD_FRACTION = 0.6;
export const PAD_MIN = 6;

export function columnRange(header) {
  const w = Number(header.w) || 0;
  const pad = Math.max(PAD_MIN, w * PAD_FRACTION);
  return { lo: Number(header.x) - pad, hi: Number(header.x) + w + pad };
}

// Find the header items whose text matches. A schedule may repeat a header
// across stacked tables, so every match is returned.
export function findHeaders(items = [], pattern) {
  return items.filter(it => pattern.test(String(it.s || '').trim()));
}

const NUMERIC = /^-?\d+(?:\.\d+)?$/;

// The value under a header on one row: the nearest numeric whose centre lies
// inside the header's column. Returns null for a blank cell rather than
// reaching into the next column for something to say.
export function valueUnder(row, header, { numericOnly = true } = {}) {
  const { lo, hi } = columnRange(header);
  const hc = centerX(header);
  let best = null, bestOff = Infinity;
  for (const it of row.items || []) {
    const s = String(it.s || '').trim();
    if (numericOnly && !NUMERIC.test(s)) continue;
    const c = centerX(it);
    if (c < lo || c > hi) continue;
    const off = Math.abs(c - hc);
    if (off < bestOff) { best = it; bestOff = off; }
  }
  return best ? { text: String(best.s).trim(), value: Number(best.s), offset: bestOff, item: best } : null;
}

// ── ROWS OF A SCHEDULE ───────────────────────────────────────────────────────
// A data row is one that starts with an equipment mark. Header and unit rows
// ("(GPM)", "(DEG F)") never do, which is what separates them without needing
// to know how many header rows a particular schedule stacked.
export const MARK_RE = /^([A-Z]{1,6}-\d{1,3}(?:\.\d)?[A-Z]?)$/;

export function markOf(row) {
  const first = (row.items || [])[0];
  if (!first) return '';
  const m = String(first.s || '').trim().match(MARK_RE);
  return m ? m[1] : '';
}

// ── A TABLE ENDS SOMEWHERE ───────────────────────────────────────────────────
// One sheet carries half a dozen schedules stacked down the page. Taking every
// mark-row below a header reads the heat pump schedule's GLYCOL % column
// straight through the boiler, the pumps and the expansion tanks underneath it,
// and hands back a weight and a tank volume as glycol concentrations.
//
// A schedule's own rows are evenly spaced — the six heat pumps sit 4 to 8
// points apart — and the next schedule down is a long way below its own title
// and header block. So the table ends at the first gap that is out of scale
// with its own line spacing.
export const GAP_FACTOR = 3;

export function tableRows(rows = [], header) {
  const below = rows.filter(r => r.y < header.y).sort((a, b) => b.y - a.y);
  const out = [];
  let prevY = null, spacings = [];
  for (const row of below) {
    if (!markOf(row)) {
      // Non-mark rows inside a table are its unit line or a wrapped cell; they
      // do not end it. Only a gap does.
      continue;
    }
    if (prevY !== null) {
      const gap = prevY - row.y;
      const typical = spacings.length
        ? spacings.slice().sort((a, b) => a - b)[Math.floor(spacings.length / 2)]
        : gap;
      if (gap > typical * GAP_FACTOR) break;
      spacings.push(gap);
    }
    out.push(row);
    prevY = row.y;
  }
  return out;
}

// Every value in a column, by the mark of the row it sits on. Only rows BELOW
// the header and INSIDE its own table count.
export function columnByMark(items = [], pattern, { numericOnly = true } = {}) {
  const rows = rowsFrom(items);
  const headers = findHeaders(items, pattern);
  const out = [];
  for (const header of headers) {
    for (const row of tableRows(rows, header)) {
      const mark = markOf(row);
      const hit = valueUnder(row, header, { numericOnly });
      if (!hit || !Number.isFinite(hit.value)) continue;
      out.push({ mark, value: hit.value, text: hit.text, header: String(header.s).trim(), offset: hit.offset });
    }
  }
  return out;
}

// ── DOES A COLUMN BELONG TO A GROUP? ─────────────────────────────────────────
// Schedules stack headers: a SOURCE WATER band over MAX WPD / FLOW / CONTROL,
// then LOAD WATER over its own set. A column sitting under one of those bands
// is scoped by it. A column sitting between them belongs to neither, and on the
// sheet this was written against GLYCOL % is exactly that — it starts one point
// after LOAD WATER's last sub-column ends and well before HEATING begins.
//
// That matters more than it looks: the row's own text says "HYDRONIC WATER
// SYSTEM", so inferring the loop from the row would confidently scope the
// glycol to the wrong side of the machine. The sheet does not say. Returning
// nothing is the truthful answer.
export function groupOver(items = [], column, groupPattern, { maxRise = 12 } = {}) {
  const c = centerX(column);
  let best = null, bestDy = Infinity;
  for (const g of findHeaders(items, groupPattern)) {
    const dy = g.y - column.y;
    if (dy <= 0 || dy > maxRise) continue;      // must sit ABOVE, and close
    const { lo, hi } = columnRange(g);
    if (c < lo || c > hi) continue;
    if (dy < bestDy) { best = g; bestDy = dy; }
  }
  return best ? String(best.s).trim() : '';
}
