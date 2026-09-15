// ── WHERE A FLAG CAME FROM ───────────────────────────────────────────────────
// Every flag already names its sheet in prose — "Page 7: duct size 32x0 looks
// misread" — but prose is not something a button can act on. To jump to the
// sheet the flag is talking about, the page has to be a FIELD.
//
// Flags raised from here on carry `page` directly. Everything already written,
// and everything the AI phrases itself, only has the sentence — so the page is
// recovered from the wording as a fallback. Both paths land in one place so
// the UI asks a single question: which sheet is this about, if any?
//
// Deliberately conservative: a flag with no recoverable page gets no button,
// because a verify link that opens the wrong sheet is worse than none. An
// estimator who taps "check the plan" and lands on the title block stops
// trusting the button, and then stops tapping it on the one that mattered.
//
// Pure — no React.

// "Page 7:", "Page 12 cross-check:", "p6" inside a deferred-sheets warning.
const PAGE_RE = /\bpage\s*(\d{1,3})\b/i;

// The flag's sheet number, or null when it doesn't name one.
export function flagPage(flag) {
  if (!flag) return null;
  if (typeof flag === 'object' && Number.isFinite(Number(flag.page)) && Number(flag.page) > 0) {
    return Number(flag.page);
  }
  const text = String((typeof flag === 'string' ? flag : flag.text) || '');
  const m = PAGE_RE.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 ? n : null;
}

// The document the flag came from. `source` is set at every merge point; a
// flag raised by the app itself uses 'System' and belongs to no file.
export function flagFile(flag) {
  const src = String((typeof flag === 'object' && flag?.source) || '').trim();
  return !src || src === 'System' ? null : src;
}

// Can this flag be verified against a sheet the app still holds?
// available: (fileName) => boolean — the caller knows which files are in memory.
export function flagVerifyTarget(flag, available = () => false) {
  const file = flagFile(flag);
  const page = flagPage(flag);
  if (!file || !page || !available(file)) return null;
  return { file, page };
}

// ── THE OTHER DOCUMENT A REFRIGERATION FLAG IS ABOUT ─────────────────────────
// Everything above assumes the evidence is a PAGE. On the HVAC side it always
// is — the flags come off plan sheets. Refrigeration has two documents and only
// one of them has pages:
//
//   THE PRINT — the redline set. Pages, and `page` covers it.
//   THE SCHEDULE — the BPR / legend, which is a SPREADSHEET. Its flags are
//   about a row: "3 circuit(s) are marked as changed but have NO new line
//   sizes… B11; C6". There is no page number to carry and never was, so the
//   verify button simply never appeared on half of the refrigeration flags.
//
// A row's address on a BPR is its circuit ID — column 1, and the thing the
// flag already names in prose. Same rule as the page: it has to be a FIELD.
// Scraping IDs back out of the sentence would mean guessing which capital-
// letter-plus-digit token is a circuit and which is a case number or a store
// number, and a button that opens the wrong row is the failure this whole file
// exists to avoid.
export function flagCircuits(flag) {
  const raw = (typeof flag === 'object' && flag?.circuits) || [];
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const c of raw) {
    const id = String(c || '').trim().toUpperCase();
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

// Can this flag be verified against a schedule the app still holds?
// Deliberately separate from the page target rather than folded into it: a
// flag could in principle carry both, and the estimator should be offered the
// document the finding is actually about rather than whichever the code
// checked first.
export function flagScheduleTarget(flag, available = () => false) {
  const file = flagFile(flag);
  const circuits = flagCircuits(flag);
  if (!file || !circuits.length || !available(file)) return null;
  return { file, circuits };
}
