// ── HOW BIG A FILE THIS CAN ACTUALLY TAKE ────────────────────────────────────
// Nothing checked. A customer could pick a 200 MB file and the app would try,
// and fail in whichever way it happened to fail — a serverless function
// refusing a body it never explains, or an iPad tab going white part-way
// through base64-encoding it. Neither says "that file is too big", which is
// the one thing the person needs to hear.
//
// Two different ceilings, because the two paths are not alike:
//
//   POSTED WHOLE — spreadsheets, .doc/.docx, .eml. These are base64'd and sent
//   to a serverless function, and base64 inflates by a third. Vercel caps a
//   function request body at 4.5 MB, so the real ceiling on the file is about
//   3.3 MB. A BPR or a scope document is a fraction of that; anything near it
//   is a scan somebody should export properly.
//
//   RENDERED HERE — PDFs and images. These never go up whole: pdf.js rasterises
//   pages in the browser and only the page images travel. The limit is the
//   device, not the server, so it is far higher and exists to stop a tab dying
//   quietly on a 400 MB plan set.
//
// Both are about telling the truth early rather than failing obscurely late.

export const POSTED_WHOLE_MAX = 3.3 * 1024 * 1024;   // ~4.5 MB once base64'd
export const RENDERED_MAX = 120 * 1024 * 1024;

// File types that get sent to a serverless function in one piece.
const POSTED_WHOLE = new Set(['excel', 'xls', 'scope', 'email']);

export function limitFor(type) {
  return POSTED_WHOLE.has(type) ? POSTED_WHOLE_MAX : RENDERED_MAX;
}

export function fmtSize(bytes) {
  const n = Number(bytes) || 0;
  if (n >= 1024 * 1024) {
    const mb = n / (1024 * 1024);
    // "120 MB", not "120.0 MB" — a trailing zero on a round number reads as a
    // measurement rather than a limit.
    return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

// null when the file is fine. Otherwise a message saying what to do about it,
// because "too large" on its own leaves somebody stuck with a file they still
// need to read.
export function checkUploadSize({ name = 'This file', size = 0, type = 'other' } = {}) {
  const bytes = Number(size) || 0;
  const max = limitFor(type);
  if (bytes <= max) return null;
  const posted = POSTED_WHOLE.has(type);
  return {
    name, size: bytes, max, type,
    message: `${name} is ${fmtSize(bytes)}, over the ${fmtSize(max)} limit for this kind of file. `
      + (posted
        ? 'Spreadsheets and documents are sent to the server whole, and it will not accept one this big. '
          + 'If it is a scan, export it as a PDF and upload that instead — plans and scans are read page by '
          + 'page here on the device and can be far larger. If it is a real spreadsheet this size, delete '
          + 'the sheets that are not part of this job and upload it again.'
        : 'Plans this large are usually a whole issued set. Export just the refrigeration or mechanical '
          + 'sheets and upload those — it will read faster and cost less as well.'),
  };
}

// ── WHAT TO TELL SOMEBODY BEFORE THEY UPLOAD ─────────────────────────────────
// An estimator's instinct is to drag the whole issued set in — 120 sheets,
// architectural through electrical — and let the app find the refrigeration.
// It will not. It reads a bounded number of sheets, and the ones past the
// limit are simply absent from the takeoff. The app already SAYS so afterwards
// (a flag naming the sheets it skipped), but afterwards is too late to be
// useful: the upload has burned minutes and the number on screen is already
// short. Say it on the upload screen, before the file picker opens.
//
// The page numbers come from pdfRender.js, so this note cannot drift away from
// what the readers actually do.
export function uploadGuidance(mode, limits = {}) {
  const {
    refrigPages = 12, hvacTextPages = 40, hvacVisionSheets = 18,
  } = limits;
  const hvac = /hvac/i.test(String(mode || ''));
  return {
    headline: hvac
      ? `Up to ${hvacVisionSheets} drawing sheets per PDF`
      : `Up to ${refrigPages} pages per PDF`,
    detail: hvac
      ? `A mechanical set is read ${hvacTextPages} pages deep for schedules and specs, and up to `
        + `${hvacVisionSheets} of its DRAWING sheets go through the vision pass — that is the expensive half. `
        + 'Sheets past that are named in a flag rather than read, so a full issued set will come back short. '
        + 'Pull the M-series sheets out and upload those.'
      : `A redline package is read ${refrigPages} pages deep. Past that, sheets are named in a flag rather `
        + 'than read, so dropping a whole issued set in will come back short. Pull out the refrigeration '
        + 'sheets — the redlines, the BPR, the schedule — and upload those.',
    sizes: `Spreadsheets, Word docs and saved emails: ${fmtSize(POSTED_WHOLE_MAX)} each — they go to the `
      + `server whole. PDFs and photos: ${fmtSize(RENDERED_MAX)} — those are read here on the device, page `
      + 'by page, so they can be much larger.',
    split: 'Nothing is lost by splitting a set across several uploads. Every file adds to the same takeoff, '
      + 'and the cross-sheet check gets better the more sheets it has to compare.',
  };
}

// Split a picked batch into what can be taken and what cannot, so one oversized
// file in a selection of eight does not stop the other seven.
export function partitionBySize(files = []) {
  const accepted = [];
  const rejected = [];
  for (const f of files || []) {
    const problem = checkUploadSize(f);
    if (problem) rejected.push(problem); else accepted.push(f);
  }
  return { accepted, rejected };
}
