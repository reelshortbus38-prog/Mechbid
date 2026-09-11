// ── THE PRICE BOOK, IN AND OUT ──────────────────────────────────────────────
// Getting real prices in was the biggest missing piece of this app: every
// default in here is a ballpark nobody quoted, and a branch manager will email
// a catalog export to anybody who asks. This reads that file.
//
// It also fixes the export, which was broken in a way this trade would hit on
// almost every line. It built CSV as:
//
//     csv += `"${e.category}","${e.desc}",…`
//
// with no escaping. Descriptions in refrigeration are full of inch marks —
// `Pipe — 1-1/8" copper` — so the field came out as
//
//     "Pipe — 1-1/8" copper"
//
// which any reader splits in the wrong place. The export could not even be
// read back by this app. A quote inside a quoted field has to be doubled.
//
// ── WHAT MAKES A SUPPLIER FILE HARD ─────────────────────────────────────────
// Every branch exports something different. The columns are never called the
// same thing twice ("Item", "SKU", "Catalog #"; "Price", "Net Price", "Your
// Price"), prices arrive as "$1,234.56" and sometimes "(12.50)" for a credit,
// and the file may open with a BOM, a title row, or blank lines before the
// header. None of that is the estimator's problem to fix in a text editor.
//
// ── AND THE ONE THAT COSTS MONEY ────────────────────────────────────────────
// UNITS. A price is per something, and this app already shipped a bug where a
// per-box price met a footage quantity and multiplied 25×. So a catalog line
// whose unit disagrees with the unit already on the book's entry is NOT
// silently applied — it is reported as a conflict. Guessing there is how the
// flex-duct line became $5,700.
//
// Pure — no React, no store, no file reading.

// ── WRITING ─────────────────────────────────────────────────────────────────
export function csvCell(value) {
  const s = value === undefined || value === null ? '' : String(value);
  // Doubling the quote is the whole fix. Also quote anything containing a
  // separator or a newline, or the row breaks somewhere else instead.
  if (/["\n\r,]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export const CSV_HEADER = ['Category', 'Description', 'Part Number', 'Unit', 'Price'];

export function toCsv(entries = []) {
  const rows = [CSV_HEADER.join(',')];
  for (const e of entries || []) {
    rows.push([e.category, e.desc, e.partId, e.unit, e.price].map(csvCell).join(','));
  }
  return rows.join('\r\n') + '\r\n';
}

// ── READING ─────────────────────────────────────────────────────────────────
// A real parser, not a split on commas. Handles quoted fields, doubled quotes
// inside them, embedded commas and newlines, CRLF, and a leading BOM.
export function parseCsv(text) {
  const src = String(text || '').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let i = 0;

  const endField = () => { row.push(field); field = ''; };
  const endRow = () => { endField(); rows.push(row); row = []; };

  while (i < src.length) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"' && field === '') { quoted = true; i++; continue; }
    if (c === ',') { endField(); i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { endRow(); i++; continue; }
    field += c; i++;
  }
  if (field !== '' || row.length) endRow();

  // Drop rows that are entirely empty — trailing newlines, spacer lines.
  return rows.filter(r => r.some(cell => String(cell).trim() !== ''));
}

// ── COLUMNS ─────────────────────────────────────────────────────────────────
// What each branch calls the same five things. Order matters: the first
// pattern that matches a header cell wins, so the more specific ones come
// first ("unit price" is a PRICE, not a unit).
const COLUMN_RULES = [
  ['price', [/\b(?:unit|net|your|contract|sell|list)\s*(?:price|cost)\b/i, /^\s*(?:price|cost|amount)\s*$/i, /\bprice\b/i, /\bcost\b/i]],
  ['unit', [/\bu\/?m\b/i, /\bunit\s*of\s*measure\b/i, /^\s*(?:unit|uom|per)\s*$/i]],
  ['partId', [/\b(?:part|item|catalog|cat|product|mfr)\s*(?:number|no\.?|#|code|id)\b/i, /^\s*(?:sku|part|item|upc)\s*#?\s*$/i]],
  ['desc', [/\b(?:item\s*)?description\b/i, /^\s*(?:desc|description|product|item\s*name|name)\s*$/i]],
  ['category', [/\b(?:category|class|group|department|type)\b/i]],
];

// → { price: 3, desc: 1, … } for the header row given, with columns it could
//   not place left out entirely.
export function detectColumns(header = []) {
  const map = {};
  const taken = new Set();
  for (const [field, patterns] of COLUMN_RULES) {
    for (const re of patterns) {
      const idx = header.findIndex((h, i) => !taken.has(i) && re.test(String(h || '')));
      if (idx >= 0) { map[field] = idx; taken.add(idx); break; }
    }
  }
  return map;
}

// A header row is the first row that yields both a description and a price —
// supplier files open with title rows, export dates and blank lines, and the
// estimator should not have to delete them by hand.
export function findHeader(rows = [], maxScan = 10) {
  for (let i = 0; i < Math.min(rows.length, maxScan); i++) {
    const map = detectColumns(rows[i]);
    if (map.desc !== undefined && map.price !== undefined) return { index: i, map };
  }
  return null;
}

// ── PRICES ──────────────────────────────────────────────────────────────────
// "$1,234.56", "1 234,56", "(12.50)" for a credit, "12.50 EA", "" for a line
// with no price on it.
// → a number, or null when there is genuinely no price here. Null is not zero:
//   zero is a price and would overwrite a real one.
export function parsePrice(raw) {
  if (raw === undefined || raw === null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  const negative = /^\(.*\)$/.test(s);
  s = s.replace(/[()]/g, '');
  // Strip currency, spaces and any trailing unit text.
  s = s.replace(/[^\d.,-]/g, '');
  if (!s) return null;
  // If both separators appear, the LAST one is the decimal point.
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    // A lone comma is a thousands separator unless exactly two digits follow.
    s = /,\d{2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  }
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

// ── ROWS → ENTRIES ──────────────────────────────────────────────────────────
// → { entries, skipped } — skipped says WHY, because "imported 412 of 900" with
//   no explanation is not something anybody can act on.
export function rowsToEntries(rows = [], header) {
  const h = header || findHeader(rows);
  if (!h) return { entries: [], skipped: [{ reason: 'no header row with a description and a price', count: 1 }] };

  const { index, map } = h;
  const at = (row, field) => (map[field] === undefined ? '' : String(row[map[field]] ?? '').trim());
  const entries = [];
  const reasons = new Map();
  const skip = why => reasons.set(why, (reasons.get(why) || 0) + 1);

  for (let i = index + 1; i < rows.length; i++) {
    const row = rows[i];
    const desc = at(row, 'desc');
    const price = parsePrice(at(row, 'price'));
    if (!desc) { skip('no description'); continue; }
    if (price === null) { skip('no price'); continue; }
    if (price < 0) { skip('negative price (credit or return line)'); continue; }
    entries.push({
      desc,
      partId: at(row, 'partId'),
      unit: at(row, 'unit').toLowerCase(),
      category: at(row, 'category') || 'Imported',
      price,
    });
  }
  return {
    entries,
    skipped: [...reasons.entries()].map(([reason, count]) => ({ reason, count })),
  };
}

// ── MERGING ─────────────────────────────────────────────────────────────────
// Matched on part number first, then on description — the same order
// findPriceMatch uses, so an import lands where a lookup would look.
const keyOf = e => (e.partId || '').trim().toLowerCase() || ('desc:' + (e.desc || '').trim().toLowerCase());

// → { merged, added, updated, unchanged, conflicts }
//
// CONFLICTS are unit disagreements, and they are NOT applied. A price is per
// something; this app has already shipped a bug where a per-box price met a
// footage quantity and multiplied 25×. When the catalog says one unit and the
// book says another, one of them is wrong and a computer cannot tell which.
export function mergeIntoBook(existing = [], incoming = [], { updatePrices = true } = {}) {
  const byKey = new Map();
  for (const e of existing || []) byKey.set(keyOf(e), e);

  const merged = [...(existing || [])];
  const added = [];
  const updated = [];
  const conflicts = [];
  let unchanged = 0;

  for (const inc of incoming || []) {
    const key = keyOf(inc);
    const found = byKey.get(key);
    if (!found) {
      const row = { ...inc, id: null };
      merged.push(row);
      added.push(row);
      byKey.set(key, row);
      continue;
    }
    const oldUnit = (found.unit || '').trim().toLowerCase();
    const newUnit = (inc.unit || '').trim().toLowerCase();
    if (oldUnit && newUnit && oldUnit !== newUnit) {
      conflicts.push({ desc: found.desc, partId: found.partId, was: oldUnit, now: newUnit, price: inc.price, oldPrice: found.price });
      continue;
    }
    if (!updatePrices) { unchanged++; continue; }
    if (Number(found.price) === Number(inc.price)) { unchanged++; continue; }
    updated.push({ desc: found.desc, partId: found.partId, from: Number(found.price) || 0, to: inc.price });
    const i = merged.indexOf(found);
    // An empty unit on the book takes the catalog's — that is new information,
    // not a disagreement.
    merged[i] = { ...found, price: inc.price, unit: oldUnit || newUnit };
  }

  return { merged, added, updated, unchanged, conflicts };
}

// One line an estimator can read before agreeing to any of it.
export function importSummary(result) {
  const r = result || {};
  const bits = [];
  if (r.added?.length) bits.push(`${r.added.length} new`);
  if (r.updated?.length) bits.push(`${r.updated.length} price${r.updated.length === 1 ? '' : 's'} changed`);
  if (r.unchanged) bits.push(`${r.unchanged} already matched`);
  if (r.conflicts?.length) bits.push(`${r.conflicts.length} held back`);
  return bits.join(' · ') || 'nothing to import';
}
