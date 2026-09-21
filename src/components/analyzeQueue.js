// ── WHAT STILL NEEDS ANALYZING ──────────────────────────────────────────────
// Reported from a live bid: "if you want to go back and upload a file and
// analyze it it seems to want to analyze all the other files it already did."
//
// It did. The filter was right —
//
//   state.uploadedFiles.filter(f => f.mode === state.mode
//                                && fileStatuses[f.id] !== 'done')
//
// — and the thing it read was wrong. `fileStatuses` was component state:
//
//   const [fileStatuses, setFileStatuses] = useState({});
//
// So "done" lived exactly as long as the Setup step stayed mounted. Step over
// to Circuits and back, reload the page, reopen the job tomorrow, open it on
// the iPad instead of the laptop — and every file is 'ready' again. Upload one
// new sheet, press Analyze, and the whole plan set goes back through vision.
//
// That is slow, it spends real money per sheet, and worst of it: every file's
// findings come back round as fresh review items to accept, against a takeoff
// that already has them. The analysis was never wrong. It just ran again, on
// work that was already done, and asked somebody to accept it a second time.
//
// So the fact is stored where it belongs — on the file, in the job, next to
// the file's name and mode, which is saved and synced. A file analyzed on the
// laptop is analyzed when the job opens on the iPad.
//
// ── AND IT STAYS RE-RUNNABLE ────────────────────────────────────────────────
// Re-analysis is sometimes exactly what is wanted. The app itself says so: a
// CO₂ addendum skipped on an HFC job comes with "switch the system type on the
// Materials step and re-analyze". So this skips a file by default and never
// prevents it — clearing the mark puts the file back in the queue.
//
// Pure — no React, no store.

// Component status wins while the step is mounted (it carries 'analyzing' and
// 'error', which are about THIS run); the stored mark is the fallback that
// survives everything else.
export function fileStatusOf(file, statuses = {}) {
  const live = statuses?.[file?.id];
  if (live) return live;
  return file?.analyzedAt ? 'done' : 'ready';
}

export function isAnalyzed(file, statuses = {}) {
  return fileStatusOf(file, statuses) === 'done';
}

// The files this run should actually read: this mode's, not already done.
export function filesToAnalyze(files = [], mode, statuses = {}) {
  return (files || []).filter(f => f && f.mode === mode && !isAnalyzed(f, statuses));
}

// Everything in this mode that has been read, for telling somebody what a
// re-analyze would redo.
export function analyzedFiles(files = [], mode, statuses = {}) {
  return (files || []).filter(f => f && f.mode === mode && isAnalyzed(f, statuses));
}
