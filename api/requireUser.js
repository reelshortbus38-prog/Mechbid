// ── WHO IS CALLING THIS ─────────────────────────────────────────────────────
// Every endpoint under api/ checked one thing: that the request was a POST.
// Nothing checked WHO sent it. That made /api/claude an open proxy to
// Anthropic — and to OpenRouter behind it — running on this shop's API keys.
// Anybody who found the URL could post any prompt they liked, on any subject,
// and the bill arrived here. It took `max_tokens` from the caller too, so the
// size of each of those requests was theirs to choose.
//
// The invite gate did not help. VITE_INVITE_ONLY is a browser variable and the
// gate is a React component: it hides the wizard from somebody who loads the
// site, and does nothing whatever about a direct POST to /api/.
//
// So: a valid signed-in user, checked against Supabase, on every endpoint that
// spends money.
//
// HOW THE TOKEN IS CHECKED: by asking Supabase. /auth/v1/user with the caller's
// access token returns the user it belongs to, or refuses. That needs no new
// secret — the anon key is already here and is public by design — and it means
// a revoked or expired session stops working immediately, which is not true of
// verifying a JWT signature locally.
//
// WHEN SUPABASE IS NOT CONFIGURED this lets the request through. That is
// deliberate, not an oversight: the app runs fully local-only with no accounts
// at all, and a deployment with no auth behind it cannot be asked for a login.
// The cost is that such a deployment is as open as this one used to be — so
// `configured` is reported back, and a deployment that spends money on AI
// should have Supabase set up. A deployment that HAS auth now enforces it.

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

function authConfigured() {
  return !!(SUPABASE_URL && SUPABASE_ANON);
}

function bearer(req) {
  const raw = (req && req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  return raw.startsWith('Bearer ') ? raw.slice(7).trim() : '';
}

// → { ok, user, configured, status?, error? }
// A caller that gets ok:false should return the status and error verbatim and
// do nothing else — no model call, no file read.
async function requireUser(req, deps) {
  const doFetch = (deps && deps.fetch) || globalThis.fetch;
  if (!authConfigured()) return { ok: true, user: null, configured: false };

  const token = bearer(req);
  if (!token) {
    return { ok: false, configured: true, status: 401, error: 'Sign in to use this.' };
  }

  let r;
  try {
    r = await doFetch(SUPABASE_URL + '/auth/v1/user', {
      headers: { apikey: SUPABASE_ANON, Authorization: 'Bearer ' + token },
    });
  } catch (e) {
    // Supabase unreachable. Fail CLOSED — an auth check that opens the door
    // whenever it cannot run is not an auth check.
    return { ok: false, configured: true, status: 503, error: 'Could not verify your session. Try again.' };
  }

  if (!r.ok) {
    return { ok: false, configured: true, status: 401, error: 'Session expired — sign in again.' };
  }

  let user = null;
  try { user = await r.json(); } catch (e) { user = null; }
  if (!user || !user.id) {
    return { ok: false, configured: true, status: 401, error: 'Session expired — sign in again.' };
  }
  return { ok: true, user, configured: true };
}

// ── AND A CEILING ON WHAT ONE REQUEST CAN SPEND ─────────────────────────────
// `max_tokens` came straight from the request body with no upper bound, so one
// call could ask for an arbitrarily large answer. The app's own biggest ask is
// well under this; the cap only bites on something nobody here sent.
const MAX_OUTPUT_TOKENS = 16000;

function cappedMaxTokens(requested, fallback = 4000) {
  const n = parseInt(requested, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, MAX_OUTPUT_TOKENS);
}

module.exports = { requireUser, authConfigured, cappedMaxTokens, MAX_OUTPUT_TOKENS };
