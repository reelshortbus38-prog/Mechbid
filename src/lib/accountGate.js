// ── THE ACCOUNT WALL ─────────────────────────────────────────────────────────
// You need an account to use Coldgauge, and the reason is storage, not access
// control.
//
// Signed out, a bid lives in this browser's localStorage and nowhere else. That
// sounds like a reasonable trade until you look at what the browser does with
// it. In Safari's private browsing, localStorage is discarded when the tab
// closes. In ordinary iPad Safari, script-writable storage for a site is purged
// after roughly a week of not visiting. Neither warns anybody, neither is
// recoverable, and both land on an estimator who spent an afternoon on a
// takeoff. Signed in, the same job is pushed to the user's row the moment it is
// saved, and comes back on any device they sign in from.
//
// So the wall is not there to keep people out. It is there to stop somebody
// doing hours of work into a container the operating system is going to empty.
//
// ── WHY THIS DEFAULTS ON, WHERE THE INVITE GATE IT REPLACED DEFAULTED OFF ────
// The gate before this one was sign-in ONLY — deliberately no sign-up form,
// because admission was controlled by hand in Supabase. A wall like that is
// impassable to anyone without an account already, so it defaulted OFF and a
// misspelt env var could never take the site down.
//
// This wall has a sign-up form on it. Anybody who meets it can get through in
// about fifteen seconds, including the owner. That inverts which direction is
// dangerous: a wall accidentally UP costs a visitor one form, while a wall
// accidentally DOWN means silent local-only work that Safari deletes later. So
// this one is on unless something explicitly says otherwise, and the explicit
// thing is VITE_OPEN_ACCESS. A typo in THAT leaves the wall standing, which is
// the harmless direction.
//
// ── THE TWO RULES THAT STOP IT LOCKING EVERYONE OUT ─────────────────────────
//
//   1. NEVER GATE WHEN SUPABASE IS UNCONFIGURED. The only ways through are
//      signing in and signing up, and both need Supabase. Gating without it is
//      a door with no handle on either side — and the app is designed to run
//      local-only with no accounts at all, so this is a real deployment, not a
//      hypothetical one.
//
//   2. NEVER GATE WHILE AUTH IS STILL LOADING. Supabase restores a session
//      asynchronously. Gating during that window flashes a sign-up screen at
//      somebody who is already signed in, which reads as having been logged
//      out — and the natural response to that is to create a second account.
//
// Pure — no React.

const TRUTHY = new Set(['true', '1', 'yes', 'on']);

// The escape hatch, named so the grep in Vercel finds it.
export const OPEN_ACCESS_VAR = 'VITE_OPEN_ACCESS';

export function parseFlag(value) {
  return TRUTHY.has(String(value ?? '').trim().toLowerCase());
}

// Should the wall be shown right now?
export function shouldGate({ openAccess, configured, loading, user } = {}) {
  if (!configured) return false;          // rule 1
  if (loading) return false;              // rule 2
  if (parseFlag(openAccess)) return false; // deliberately opened
  return !user;
}

// ── HOW LONG A PASSWORD HAS TO BE ────────────────────────────────────────────
// Supabase is the authority on this, not the app: Authentication → Sign In /
// Providers → Email → "Minimum password length". Whatever is set there is what
// actually decides, and the number on this screen is a courtesy.
//
// A courtesy that disagrees with the authority is worse than no courtesy at
// all. The screen said "At least 6 characters" while the project required 10,
// so an 8-character password passed the app's own check, went to Supabase, and
// came back refused — leaving somebody looking at a rule they had followed and
// an error saying they had not.
//
// So the number lives here once, and both the hint and the check read it. They
// cannot drift from each other. They can still drift from SUPABASE, which no
// amount of client code can prevent — hence the env var, so the deployment can
// be corrected without a code change, and hence the rule that Supabase's own
// refusal is shown through unedited when they do disagree.
export const DEFAULT_MIN_PASSWORD = 10;
export const MIN_PASSWORD_VAR = 'VITE_MIN_PASSWORD_LENGTH';

export function minPasswordLength(raw) {
  const n = Number(String(raw ?? '').trim());
  // Supabase's own floor is 6; anything below it, or unreadable, is a
  // misconfiguration, and falling back to the stricter default is the safe
  // direction — a hint that asks for MORE than required annoys somebody, a
  // hint that asks for less refuses them after they have typed it.
  if (!Number.isFinite(n) || n < 6) return DEFAULT_MIN_PASSWORD;
  return Math.floor(n);
}

// What is wrong with the form as typed, or '' if nothing is. Sign-in does NOT
// apply the minimum: an account made before the rule changed still has its old
// password, and refusing to even attempt it would lock that person out of an
// account that works.
export function formProblem({ email, password, min, signingUp } = {}) {
  if (!String(email || '').trim() || !password) return 'Enter your email and a password.';
  if (signingUp && password.length < min) return `Passwords need at least ${min} characters.`;
  return '';
}

// ── WHAT THE SCREEN DOES WITH WHAT CAME BACK ─────────────────────────────────
// Kept out of the component so it can be tested without a browser. Two of the
// three branches below are ones a person only meets when something has already
// gone slightly wrong, which is exactly when a wall must not become a dead end.

export const ALREADY_REGISTERED = /already registered|already exists|already been registered/i;

export const ALREADY_NOTE = 'You already have an account on that email — sign in instead.';
export const CONFIRM_NOTE = 'Account created. Check your email for the confirmation link, then sign in.';
export const UNKNOWN_ERROR = 'Something went wrong. Try again, or email support@coldgauge.com.';

export function authOutcome(result, { signingUp = false } = {}) {
  const error = result?.error || '';

  // Not an error the visitor can act on — it is the answer to a question they
  // asked the wrong way round. Move them across rather than making them read
  // Supabase's wording and work out that they already have an account.
  if (error && signingUp && ALREADY_REGISTERED.test(error)) {
    return { mode: 'signin', clearPassword: true, note: ALREADY_NOTE, error: '' };
  }

  if (error) return { mode: null, clearPassword: false, note: '', error };

  // Only reachable with "Confirm email" turned on in Supabase: the account now
  // exists but carries no session, so there is nothing to let them into yet.
  // Landing them on a wall with no explanation would read as the signup having
  // failed, and the obvious next move — signing up again — fails too.
  if (result?.needsConfirm) {
    return { mode: 'signin', clearPassword: true, note: CONFIRM_NOTE, error: '' };
  }

  // ── AN ABSENCE IS NOT A SUCCESS ────────────────────────────────────────────
  // Found by writing the test for it. Everything below the error branches used
  // to be "no error, therefore signed in", and a result that carried neither —
  // a request that never resolved into one, a caller that returned nothing —
  // fell straight through to `done`. The component reads `done` for nothing:
  // what it actually does is set the error to '' and the note to '', so the
  // wall would sit there wiped clean, with no session behind it and no reason
  // on the screen. A wall that answers a tapped button by going blank is the
  // dead end this whole function exists to prevent.
  //
  // Both real callers resolve to an object carrying `data`, so its absence
  // means we cannot tell what happened — and we must not spend that doubt on
  // the optimistic side.
  if (!result || !('data' in result)) {
    return { mode: null, clearPassword: false, note: '', error: UNKNOWN_ERROR };
  }

  // Signed in. The auth listener flips `user` and the wall unmounts.
  return { mode: null, clearPassword: false, note: '', error: '', done: true };
}
