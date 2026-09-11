// ── EVERY CALL TO api/ CARRIES WHO IS MAKING IT ─────────────────────────────
// The endpoints under api/ now require a signed-in user, because without that
// they were an open proxy on this shop's AI keys (see api/requireUser.js).
// This is the other half of it: the browser has to send the session.
//
// Supabase already holds the access token once somebody signs in. This reads it
// at call time rather than at import time — a token refreshes while a long
// document analysis is running, and a copy taken when the module loaded would
// be the stale one.
//
// WITH NO SUPABASE AND NO SESSION it sends nothing and lets the server decide.
// A local-only deployment has no accounts to sign in to, and the server lets
// those through on purpose; a deployment that HAS auth will refuse, which is
// the point.
import { getSupabase } from '../lib/supabase.js';

export async function authHeader() {
  const sb = getSupabase();
  if (!sb) return {};
  try {
    const { data } = await sb.auth.getSession();
    const token = data && data.session && data.session.access_token;
    return token ? { Authorization: 'Bearer ' + token } : {};
  } catch {
    // Not signed in, or storage is blocked. The server answers 401 and the
    // caller shows that — better than failing here with a different message.
    return {};
  }
}

// ── AND A REFUSAL THAT READS LIKE ENGLISH ───────────────────────────────────
// Gating the endpoints created a new way to fail, and every caller in ai.js
// turns a bad response into `Error("parse-excel error 401: {\"error\":...")`.
// That is the string an estimator would see after dragging in a set of plans.
// The server already writes a sentence worth reading; this surfaces it instead.
//
// Throwing rather than returning matches what every caller does with a non-ok
// response anyway, so the control flow is unchanged — only the words are.
const AUTH_STATUSES = [401, 503];

export async function apiFetch(path, init = {}) {
  const auth = await authHeader();
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}), ...auth },
  });

  if (AUTH_STATUSES.includes(res.status)) {
    let msg = '';
    try {
      const body = await res.clone().json();
      msg = body && body.error;
    } catch {
      // Non-JSON body from somewhere upstream; the default below covers it.
    }
    throw new Error(msg || 'Sign in to use this.');
  }
  return res;
}
