// ── SIZELESS RUNS ────────────────────────────────────────────────────────────
// A run whose size could not be read is still a RUN. It has footage, it has a
// service, somebody has to buy and hang it — the only thing missing is the
// number, and the estimator can supply that from the plan in ten seconds if
// the app tells them which run needs it.
//
// Two things were going wrong.
//
// absorbHvac already drops a run with an EMPTY size, which is right. But the
// model defeated that guard by writing the WORD "unspecified" into the size
// field instead of leaving it blank, so the run sailed through and Step1 built
// its description mechanically: "Ductwork — unspecified duct (unknown)". That
// reads to anyone who did not watch it get made like a real material line, and
// it is unpriceable.
//
// And dropping it outright is wrong too, because the run may carry real
// measured footage. Discarding 20 ft of duct because its label was illegible
// loses scope from the bid.
//
// So: placeholder words count as no size, and a run with no size is kept
// whenever it carries EVIDENCE that something was actually seen — footage, a
// service, a note, a shape. Only a completely empty row is discarded, because
// that is a schema artifact rather than an observation.
//
// Pure — no React, no network.

// Words a model writes when it means "I could not read this". They are not
// sizes, and treating them as one is how "unspecified duct" reached a parts
// table next to real line items.
const PLACEHOLDER_RE = /^(?:unspecified|unknown|undetermined|unlabell?ed|unreadable|illegible|not\s*(?:specified|shown|given|listed|noted)|n\/?a|tbd|todo|various|misc|none|null|-+|\?+|\.+)$/i;

export function isPlaceholder(value) {
  return PLACEHOLDER_RE.test(String(value || '').trim());
}

// The size, or '' when there isn't really one.
export function cleanSize(size) {
  const s = String(size || '').trim();
  return isPlaceholder(s) ? '' : s;
}

// Same treatment for the service, so "(unknown)" stops appearing in captions.
export function cleanService(service) {
  const s = String(service || '').trim();
  return isPlaceholder(s) ? '' : s;
}

// Did the analyzer actually see something here? Footage is the strongest
// signal — it means the run was traced on the sheet — but a service, a note or
// a shape all mean a run was observed and only its label failed.
export function hasEvidence(run = {}) {
  return (Number(run.estLengthFt) || 0) > 0
    || !!cleanService(run.service)
    || !!String(run.notes || '').trim()
    || !!String(run.shape || '').trim();
}

// What the estimator has to supply to finish this line. Said plainly, because
// "unspecified" told them nothing about what to do next.
export function missingSizeNote(run = {}, kind = 'duct') {
  const lf = Math.max(0, Math.round(Number(run.estLengthFt) || 0));
  const want = kind === 'pipe' ? 'the pipe size' : 'W x H (or the diameter, if it is round)';
  return [
    lf
      ? `~${lf} LF was measured${run.lengthBasis ? ` against ${run.lengthBasis}` : ''}, but the size label could not be read`
      : 'this run was seen on the sheet but neither its size nor its length could be read',
    `enter ${want} to price it`,
  ].join(' — ');
}
