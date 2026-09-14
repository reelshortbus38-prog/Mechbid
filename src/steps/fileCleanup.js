// ── WHAT A REMOVED FILE LEAVES BEHIND ───────────────────────────────────────
// removeFile dropped the row from state.uploadedFiles and the blob from the
// cache, and stopped there. Everything the app had READ out of that file
// stayed in the job, keyed to a filename that no longer exists anywhere.
//
// Two kinds of residue, and both of them produce wrong output rather than
// merely stale output:
//
//   FACTS. The cross-sheet ledger exists to catch a number on one sheet
//   disagreeing with a number on another — 25% glycol in the equipment
//   schedule against 20% PG at the make-up unit, that sort of thing. A fact
//   whose sheet has been removed is still compared, so the app raises an RFI
//   between a live drawing and a document the estimator deleted. api/jobFacts
//   has had `dropSheet` for exactly this since it was written, called from
//   nowhere.
//
//   Worse on a re-issue, which is the common case: delete "M0.1.pdf", upload
//   "M0.1 REV B.pdf". mergeFacts replaces by sheet NAME, so a different name
//   is a different sheet — rev A's numbers and rev B's numbers sit in the
//   ledger together and disagree with each other. The app then reports a
//   conflict it invented out of its own bookkeeping.
//
//   FLAGS. A flag says "SOW.pdf requires night work". With SOW.pdf gone, that
//   is a warning about a document nobody can open to check.
//
// ── WHAT DELIBERATELY STAYS ─────────────────────────────────────────────────
// Anything the estimator ACCEPTED. Circuits, line items, rack parts, field
// tasks — those went through the review screen and he said yes to them. They
// are his takeoff now, not the file's. Removing a PDF does not un-count 240 ft
// of pipe, and a remove button that silently deleted priced work would be far
// worse than the bug it fixes.
//
// The read LOG (extractionResults) also stays. Those are plain sentences —
// "M0.1.pdf: 6 circuits read" — and picking them apart by matching the
// filename inside a string is the kind of thing that breaks quietly later. A
// log line naming a file that was removed is honest history.
//
// Pure — no React, no store.

// → { jobFacts, flags, dropped: { facts, flags } }
// `dropped` is counted rather than assumed, because removing a file takes
// warnings off the screen and the estimator should be told which and how many
// rather than watching them vanish.
export function withoutFile({ jobFacts = [], flags = [] } = {}, fileName = '') {
  const name = String(fileName || '').trim();
  if (!name) {
    return { jobFacts, flags, dropped: { facts: 0, flags: 0 } };
  }

  // Facts key their origin as `sheet`; flags as `source`. Same idea, two names,
  // because they were written months apart — matching both here rather than
  // renaming a field that rides inside every saved job.
  const keptFacts = jobFacts.filter(f => String(f?.sheet || '').trim() !== name);
  const keptFlags = flags.filter(f => String(f?.source || '').trim() !== name);

  return {
    jobFacts: keptFacts,
    flags: keptFlags,
    dropped: {
      facts: jobFacts.length - keptFacts.length,
      flags: flags.length - keptFlags.length,
    },
  };
}

// One sentence for the screen, or null when nothing went. Says what left and
// from where, so a warning disappearing is something the estimator watched
// happen rather than something he later fails to find.
export function removalNote(fileName, dropped) {
  const facts = Number(dropped?.facts) || 0;
  const flags = Number(dropped?.flags) || 0;
  if (!facts && !flags) return null;
  const bits = [];
  if (flags) bits.push(`${flags} flag${flags === 1 ? '' : 's'}`);
  if (facts) bits.push(`${facts} cross-sheet fact${facts === 1 ? '' : 's'}`);
  return `Removed ${fileName} — ${bits.join(' and ')} from it went with it. `
    + 'Anything already accepted into the takeoff stays.';
}
