// ── HOW THE SECONDARY-LOOP CARD PRESENTS ITSELF ──────────────────────────────
// A secondary loop is a separate axis from the refrigerant: most refrigeration
// jobs are plain DX and have none. The card was rendering fully expanded on
// every job anyway — four pipe-size rows, a glycol percentage, a fluid volume,
// a flow-and-pump block — which reads as a form somebody forgot to fill in.
//
// Worse, the lead sentence said "Set to chilled glycol on the Setup step" no
// matter what the Setup step actually said, because the only branch was
// water-vs-everything-else. On a job with NO loop that sentence is simply
// false, and it is the sentence that tells the estimator what the job is.
//
// So: a job that HAS a loop gets the card open, because then it is the work. A
// job that does not gets one collapsed line that says so, and the calculator
// still opens on a tap for anyone who wants to check a number without
// changing what the job is.

export function loopHeadline(secondaryLoop) {
  const v = secondaryLoop || 'none';
  if (v === 'water') {
    return {
      active: true,
      loopType: 'water',
      title: 'Secondary Loop — Ambient Water',
      lead: 'Set to an ambient water loop on the Setup step.',
    };
  }
  if (v === 'glycol') {
    return {
      active: true,
      loopType: 'chilled',
      title: 'Secondary Loop — Chilled Glycol',
      lead: 'Set to chilled glycol on the Setup step.',
    };
  }
  return {
    active: false,
    // What the calculator assumes if somebody opens it anyway. It is a
    // starting point for a what-if, not a claim about this job.
    loopType: 'chilled',
    title: 'Secondary loop — none on this job',
    lead: 'This job has no secondary loop, so nothing below is part of the bid. '
      + 'Set one on the Setup step if it should be. The calculator still works '
      + 'here if you only want to check a number.',
  };
}
