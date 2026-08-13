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
