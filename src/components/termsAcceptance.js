// ── RECORDING THAT THE TERMS WERE ACCEPTED ───────────────────────────────────
// Until now the terms were reachable from a link in the corner. That pattern
// has a name — BROWSEWRAP — and courts have repeatedly declined to enforce it,
// because a link nobody was required to look at is not evidence that anyone
// agreed to anything. The pattern that does hold up is CLICKWRAP: the user
// takes a deliberate action, with the terms in front of them, and the app
// records what they accepted and when.
//
// WHY IT MATTERS MORE FOR THIS APP THAN FOR MOST. Coldgauge produces the
// numbers somebody bids work on. The two clauses standing between the operator
// and a bad bid are the estimating disclaimer and the liability cap, and both
// only do their job if the contractor agreed to them. On browsewrap, whether
// they agreed is the first thing an opposing lawyer contests. On clickwrap with
// a stored timestamp, it is not a question.
//
// SO THE GATE SHOWS THE DISCLAIMER ITSELF, not just a link to it. What is being
// agreed to is that this tool produces ESTIMATES and the estimator verifies
// them. Burying that behind "I agree to the Terms" would be the same mistake in
// a different shape.
//
// RE-ACCEPTANCE is keyed to the terms' own date. Bump LAST_UPDATED only for a
// MATERIAL change — the clock exists so a real change gets a real re-agreement,
// and re-prompting for a typo fix trains people to tap through without reading,
// which is the whole failure this is meant to prevent.
//
// Pure — store injected, no React.

export const ACCEPTANCE_KEY = 'coldgauge_terms_accepted_v1';

export function loadAcceptance(store) {
  try {
    const raw = store?.getItem(ACCEPTANCE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const version = typeof parsed.version === 'string' ? parsed.version : '';
    const at = typeof parsed.at === 'string' ? parsed.at : '';
    if (!version || !at) return null;
    return { version, at };
  } catch {
    return null;
  }
}

export function recordAcceptance(store, version, now = new Date()) {
  const v = String(version || '').trim();
  if (!v) return false;
  try {
    store.setItem(ACCEPTANCE_KEY, JSON.stringify({ version: v, at: now.toISOString() }));
    return true;
  } catch {
    return false;
  }
}

// The gate is shown when nothing has been accepted, or when what was accepted
// is a different version from the one now in force.
export function needsAcceptance(accepted, currentVersion) {
  const v = String(currentVersion || '').trim();
  if (!v) return false;                 // no version to agree to — never block
  if (!accepted || !accepted.version) return true;
  return accepted.version !== v;
}

// Whether this is a first acceptance or a re-acceptance after a change. The
// wording differs: someone who already agreed once is owed an explanation of
// what changed, not the same screen again with no acknowledgement.
export function acceptanceKind(accepted, currentVersion) {
  if (!needsAcceptance(accepted, currentVersion)) return 'none';
  return accepted && accepted.version ? 'updated' : 'first';
}

// For display: "accepted 2026-08-27". Returns '' when nothing is recorded, so
// the caller never prints "accepted Invalid Date".
export function acceptedOn(accepted) {
  if (!accepted || !accepted.at) return '';
  const d = new Date(accepted.at);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}
