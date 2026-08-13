// ── SESSION FILE CACHE ───────────────────────────────────────────────────────
// To show the estimator the sheet a flag is talking about, the app has to
// still HOLD that sheet. It doesn't: Step1 creates a blob URL at upload and
// keeps only the URL, and store.js deliberately strips even that when a job
// saves, because a blob URL is dead after a reload and a dead link in a saved
// job is worse than no link.
//
// So the File objects live here instead — in a plain module-level Map, outside
// React state on purpose. Anything in state gets serialized to localStorage on
// every save, and a 20 MB PDF would blow the quota on the first job.
//
// This is SESSION-scoped by design. Upload a set, work down the flags, click
// through to the sheets — that all works. Save the job, close the tab, reopen
// it tomorrow and the files are gone, so the verify buttons simply don't
// appear. That is the honest behaviour: no broken links, and the button is
// present exactly when it works.
//
// Making it survive a reload means IndexedDB, which is local and free and
// needs no account. Worth doing if re-checking old jobs turns out to matter;
// it is not needed for reviewing a run you just made.

const files = new Map(); // fileName → File

export function rememberFile(file) {
  if (file?.name) files.set(file.name, file);
}

export function getCachedFile(name) {
  return files.get(String(name || '')) || null;
}

export function hasCachedFile(name) {
  return files.has(String(name || ''));
}

// Only for tests and for clearing between jobs — the map is small (references,
// not copies), so ordinary use never needs this.
export function clearFileCache() {
  files.clear();
}
