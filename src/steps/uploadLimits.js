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
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
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
