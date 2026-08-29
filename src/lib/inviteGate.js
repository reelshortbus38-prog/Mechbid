// ── INVITE-ONLY GATE ─────────────────────────────────────────────────────────
// Coldgauge is usable before it is finished, which is a problem: the labor units
// are still unvalidated defaults, and an estimator who does not know that could
// bid work on them. Until they are calibrated against a real completed job, the
// app should only reach people who have been told what is and is not proven.
//
// The gate is CONFIGURATION, not code. VITE_INVITE_ONLY=true in Vercel turns it
// on; removing it turns it off. Opening the app to the public should not require
// a pull request.
//
// THREE RULES, AND ALL THREE EXIST TO STOP THE GATE LOCKING THE OWNER OUT:
//
//   1. OFF BY DEFAULT. A missing, empty, or unparseable flag never gates. A
//      typo in an env var must not take the site down.
//
//   2. NEVER GATE WHEN SUPABASE IS UNCONFIGURED. The only way through the gate
//      is signing in, and signing in requires Supabase. Gating without it locks
//      everyone out of an app that has no door — including whoever set the flag.
//
//   3. NEVER GATE WHILE AUTH IS STILL LOADING. Supabase restores a session
//      asynchronously; gating during that window flashes a sign-in screen at
//      somebody who is already signed in, which reads as being logged out.
//
// Actual admission is controlled in Supabase, not here: turn OFF public
// sign-ups and create accounts by hand for the people you invite. This gate
// only enforces that SOMEBODY is signed in.
//
// Pure — no React.

const TRUTHY = new Set(['true', '1', 'yes', 'on']);

export function parseFlag(value) {
  return TRUTHY.has(String(value ?? '').trim().toLowerCase());
}

// Should the gate be shown right now?
export function shouldGate({ flag, configured, loading, user } = {}) {
  if (!parseFlag(flag)) return false;   // rule 1
  if (!configured) return false;        // rule 2
  if (loading) return false;            // rule 3
  return !user;
}
