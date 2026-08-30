// ── PARTS ORDER FORM — DETERMINISTIC READ ────────────────────────────────────
// Food Lion's parts order forms (rack parts, case ends) arrive as legacy .xls
// on every remodel, and the app read them by shipping the sheet's text to an AI
// and asking what was on it. For a form THIS regular that is the wrong tool:
//
//   row 8   Part Number | Qty | Description | … | Color | … | Where used
//   row 9+  the items
//   then    a legend block — reason codes, technician names, state
//           abbreviations — which is not parts and must never be read as parts
//
// The AI read costs money, needs a key, can be down, and can hallucinate a part
// that is not on the order. None of that is acceptable for a form whose shape
// does not vary. So this reads it directly, and the AI stays as the fallback for
// a layout this does not recognise.
//
// THE RULE THAT DOES THE WORK: an item row has a POSITIVE NUMBER IN THE QTY
// COLUMN. Section headings ("Produce", "Meat", "FF & IC") have a description
// and no quantity. Every row of the legend block — "CE Engineering",
// "812 Ray Bishop", "AL", "AK" — has neither. One rule separates all three.
//
// Section headings are KEPT as context rather than discarded: a case end for
// Meat and one for Produce are different parts, and on a form where three rows
// carry no model number at all, the heading above them is the only thing saying
// which case they belong to.
//
// CommonJS, because the Vercel function that uses it is.

const HEADER_MAX_SCAN = 20;   // the header is at row 8 on every form seen
const LEGEND_COL = 14;        // the reason-code block starts here

const txt = v => String(v === null || v === undefined ? '' : v).trim();
const norm = v => txt(v).toLowerCase().replace(/\s+/g, ' ');

// Find the header row and the meaning of each column, so the reader follows the
// form's own labels rather than hard-coded positions.
function findHeader(rows) {
  for (let r = 0; r < Math.min(rows.length, HEADER_MAX_SCAN); r++) {
    const row = rows[r] || [];
    const idx = { part: -1, qty: -1, desc: -1, color: -1, where: -1 };
    row.forEach((cell, c) => {
      const n = norm(cell);
      if (n === 'part number' || n === 'part #' || n === 'part no') idx.part = c;
      else if (n === 'qty' || n === 'quantity') idx.qty = c;
      else if (n === 'description') idx.desc = c;
      else if (n === 'color' || n === 'colour') idx.color = c;
      else if (n === 'where used' || n === 'where-used') idx.where = c;
    });
    if (idx.qty >= 0 && (idx.part >= 0 || idx.desc >= 0)) return { row: r, idx };
  }
  return null;
}

function isPartsOrderForm(rows) {
  const top = (rows || []).slice(0, 12).map(r => (r || []).join(' ')).join(' ').toLowerCase();
  if (top.includes('parts order form')) return true;
  return top.includes('part number') && top.includes('where used');
}

// A quantity is a positive number. "1", 1, " 2 " count; "", "Yes", "AL" do not.
function parseQty(v) {
  const s = txt(v);
  if (!s) return null;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Everything between the Description column and Color, joined. The forms split
// one description across two columns — a model in one and the prose in another
// — and either can be empty.
function describe(row, idx) {
  const from = idx.desc >= 0 ? idx.desc : 0;
  const to = idx.color > from ? idx.color : (idx.where > from ? idx.where : row.length);
  const parts = [];
  for (let c = from; c < to; c++) {
    const s = txt(row[c]);
    if (s) parts.push(s.replace(/\s+/g, ' '));
  }
  return parts.join(' · ');
}

// A row that is entirely out in the legend columns is the reason-code block,
// and everything below it is reference material rather than the order.
function isLegendRow(row) {
  const filled = (row || []).map((v, c) => (txt(v) ? c : -1)).filter(c => c >= 0);
  return filled.length > 0 && filled.every(c => c >= LEGEND_COL);
}

function parsePartsOrderForm(rows) {
  const head = findHeader(rows || []);
  if (!head) return { ok: false, items: [], reason: 'no header row found' };
  const { idx } = head;
  const items = [];
  let section = '';

  for (let r = head.row + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    if (isLegendRow(row)) break;
    const qty = parseQty(row[idx.qty]);
    const description = describe(row, idx);
    const partNumber = idx.part >= 0 ? txt(row[idx.part]) : '';

    if (qty === null) {
      // No quantity: either a section heading or a blank spacer. A heading has
      // description text and no part number.
      if (description && !partNumber) section = description;
      continue;
    }
    if (!description && !partNumber) continue;   // a stray number, not an item

    items.push({
      qty,
      partNumber,
      description,
      whereUsed: idx.where >= 0 ? txt(row[idx.where]) : '',
      section,
    });
  }

  return { ok: true, items, reason: '' };
}

// "701 Case Ends" / "701 Rack Parts" appear in the Mark For cell; the file name
// carries the same words. Either is enough to say which form this is.
function formTypeOf(rows, fileName = '') {
  const hay = ((rows || []).slice(0, 8).map(r => (r || []).join(' ')).join(' ') + ' ' + fileName).toLowerCase();
  if (/case\s*ends?/.test(hay)) return 'case ends';
  if (/rack\s*parts?/.test(hay)) return 'rack parts';
  return 'parts';
}

function storeNumberOf(rows) {
  const hay = (rows || []).slice(0, 8).map(r => (r || []).join(' ')).join(' ');
  const m = hay.match(/\bFL\s*#?\s*(\d{2,5})\b/i) || hay.match(/\bstore\s*#?\s*:?\s*(\d{2,5})\b/i);
  return m ? m[1] : '';
}

module.exports = {
  isPartsOrderForm, parsePartsOrderForm, formTypeOf, storeNumberOf,
  parseQty, findHeader, isLegendRow, LEGEND_COL,
};
