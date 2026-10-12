// ── WHO IS CALLING THIS ─────────────────────────────────────────────────────
// Every endpoint under api/ checked one thing: that the request was a POST.
// Nothing checked WHO sent it. That made /api/claude an open proxy to
// Anthropic — and to OpenRouter behind it — running on this shop's API keys.
// Anybody who found the URL could post any prompt they liked, on any subject,
// and the bill arrived here. It took `max_tokens` from the caller too, so the
// size of each of those requests was theirs to choose.
//
// The account wall in front of the app does not help. It is a React component
// deciding what to render: it hides the wizard from somebody who loads the
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

// ════════════════════════════════════════════════════════════════════════════
// ── A CEILING ON WHAT ONE ACCOUNT CAN SPEND ─────────────────────────────────
//
// WHY THIS IS IN THIS FILE AND NOT ITS OWN. Vercel turns every .js under api/
// into its own Serverless Function and the Hobby plan allows twelve — see
// api/functionCount.test.js, which caught this as a separate module and was
// right to. A shared helper is not worth a deploy slot the app may need for a
// real endpoint, and this is the same question requireUser already answers one
// scope smaller: cappedMaxTokens bounds one ANSWER, this bounds one ACCOUNT.
// requireUser.js closed the open proxy: you have to be signed in to spend this
// shop's Anthropic and OpenRouter money. cappedMaxTokens closed the other half
// of that hole: no single request can ask for an unbounded ANSWER.
//
// Neither bounds how MANY requests one account makes, or how large the thing
// it sends is. On a private deployment that did not matter — the only accounts
// were a father and a son. The moment a link goes out to strangers it is the
// whole exposure: signing up is free, email confirmation is off, and plan-set
// analysis is the most expensive thing this app does. One account uploading
// the same 300-page set forty times is a bill, and nothing here would have
// slowed it down.
//
// ── WHY THE CALLER'S OWN TOKEN, AND NO NEW SECRET ───────────────────────────
// The obvious build is a service-role key that writes a usage table past RLS.
// This does not do that, and deliberately: the service-role key is the one
// credential in this project that must never be anywhere near a request path
// that handles user input.
//
// It is not needed. The ledger is written with the CALLER'S access token,
// which RLS already scopes to their own rows — and the values written are the
// server's, not theirs. The policies grant select and insert and nothing else,
// so an account can read its own ledger and add to it but cannot erase a row
// to buy itself more budget. Append-only is both the safe shape and the useful
// one: it leaves a real record to set the limit from.
//
// ── A ROLLING WINDOW, NOT A CALENDAR DAY ────────────────────────────────────
// "Per day" sounds simpler until you ask whose day. A UTC reset lands at eight
// in the evening on the east coast, so "resets at midnight" would be a lie
// told to the person reading it, and a calendar boundary invites a burst on
// either side of it. The window is the last 24 hours, always, and budget frees
// up gradually as requests age out of it.
//
// ── IT FAILS OPEN, AND THAT IS NOT AN OVERSIGHT ─────────────────────────────
// If the ledger cannot be read, the request proceeds.
//
// That is safe here for one specific reason: requireUser fails CLOSED when
// Supabase is unreachable. Supabase has to be up and the session valid before
// this code runs at all, so "the ledger is unreadable" does not mean "Supabase
// is down" — it almost always means the table is not there yet, because the
// migration in supabase/schema.sql has not been run.
//
// And in that state the right behaviour is to keep working. The alternative is
// an estimator mid-bid getting refused by a spend limit that cannot find its
// own table, which trades a possible bill for a certain outage. It warns to
// the server log instead, loudly, because a cap everybody believes in and that
// is quietly inert is worse than no cap at all.

const WINDOW_HOURS = 24;

// Generous on purpose. This is meant to stop a stranger bulk-uploading plan
// sets, not to meter an estimator having a heavy Tuesday — and the cost of
// being wrong in the strict direction is somebody's real bid stopping halfway.
// Raise or lower it in Vercel without a deploy.
const DEFAULT_DAILY_TOKENS = 2_000_000;

// About 1.5 MB of JSON. The app's own largest send — a page image plus the
// prompt — is well inside this; it only bites on something nobody here sent.
const DEFAULT_MAX_REQUEST_BYTES = 1_500_000;

// Bytes per token, roughly, for English prose and base64 alike. Only used
// where a provider tells us nothing, and only ever to count SOMETHING rather
// than nothing — a path that reports no usage must not be a free one.
const BYTES_PER_TOKEN = 4;

// Reading 5000 ledger rows is already far past any real day's work. Anybody
// with more than that in a window is over budget by any measure, so the read
// stops there and says so rather than paging through it.
const MAX_LEDGER_ROWS = 5000;

const TABLE = 'api_usage';

function envInt(name, fallback) {
  const n = parseInt(process.env[name], 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function dailyTokenBudget() {
  return envInt('DAILY_TOKEN_BUDGET', DEFAULT_DAILY_TOKENS);
}

function maxRequestBytes() {
  return envInt('MAX_REQUEST_BYTES', DEFAULT_MAX_REQUEST_BYTES);
}

// ── THE TWO ACCOUNTS THAT MUST NEVER BE CAPPED ──────────────────────────────
// The point of this file is strangers. The father and son whose shop this is
// should not be metered by a number guessed before anybody had seen a real
// day's usage — the first thing a too-tight guess would do is stop a live bid.
// Set UNLIMITED_USER_IDS in Vercel to their Supabase user ids, comma separated.
function unlimitedIds(raw = process.env.UNLIMITED_USER_IDS) {
  return String(raw || '').split(',').map(s => s.trim()).filter(Boolean);
}

function isUnlimited(userId, raw) {
  if (!userId) return false;
  return unlimitedIds(raw).includes(String(userId));
}

// How big the thing being sent is. JSON.stringify on an already-parsed body is
// not free, but it is microseconds against a model call, and it is the only
// honest measure of what the caller actually sent.
function requestBytes(body) {
  if (body == null) return 0;
  if (typeof body === 'string') return Buffer.byteLength(body, 'utf8');
  try { return Buffer.byteLength(JSON.stringify(body), 'utf8'); } catch (e) { return 0; }
}

function estimateTokens(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.ceil(n / BYTES_PER_TOKEN);
}

// ── WHAT A CALL ACTUALLY COST ───────────────────────────────────────────────
// Anthropic reports { input_tokens, output_tokens }; OpenRouter, being
// OpenAI-shaped, reports { prompt_tokens, completion_tokens }. Both are read,
// because a bill does not care which provider served the request.
//
// A response with no usage block at all falls back to the size estimate. That
// matters more than it looks: without it, any provider or error path that
// omits usage would record a cost of zero, and the cheapest way past this
// whole file would be to find one.
// An ARRAY is one request that made several paid calls — the vision endpoint
// runs a primary and a cross-check in parallel, and both are billed. Summed,
// with the size fallback applied only once if NONE of them reported anything.
function tokensFrom(usage, fallbackBytes = 0) {
  if (Array.isArray(usage)) {
    const sum = usage.reduce((t, u) => t + tokensFrom(u, 0), 0);
    return sum > 0 ? sum : estimateTokens(fallbackBytes);
  }
  const u = usage || {};
  const inTok = Number(u.input_tokens ?? u.prompt_tokens);
  const outTok = Number(u.output_tokens ?? u.completion_tokens);
  const sum = (Number.isFinite(inTok) ? inTok : 0) + (Number.isFinite(outTok) ? outTok : 0);
  if (sum > 0) return Math.round(sum);
  return estimateTokens(fallbackBytes);
}

function windowStartIso(now = Date.now(), hours = WINDOW_HOURS) {
  const t = now instanceof Date ? now.getTime() : Number(now);
  const ms = (Number.isFinite(t) ? t : Date.now()) - hours * 3600_000;
  return new Date(ms).toISOString();
}

function hoursUntil(iso, now = Date.now()) {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return null;
  const t = now instanceof Date ? now.getTime() : Number(now);
  const h = (then - t) / 3600_000;
  return h > 0 ? h : 0;
}

// How the refusal reads. This string goes to the browser and, through
// src/api/ai.js, more or less straight onto the screen — so it says what
// happened, that it is temporary, and roughly when it lifts. "Rate limit
// exceeded" would tell an estimator nothing they can act on.
function overBudgetMessage({ oldestAt, now = Date.now() } = {}) {
  const base = 'This account has used its AI analysis budget for the last 24 hours.';
  const tail = ' Budget frees up as those requests age out'
    + ' — or email support@coldgauge.com if you need more.';
  const h = oldestAt ? hoursUntil(new Date(Date.parse(oldestAt) + WINDOW_HOURS * 3600_000).toISOString(), now) : null;
  if (h == null) return base + tail;
  const when = h < 1 ? 'in under an hour' : `in about ${Math.round(h)} hour${Math.round(h) === 1 ? '' : 's'}`;
  return `${base} Some frees up ${when}.`
    + ' Email support@coldgauge.com if you need more than that.';
}

// ── THE DECISION, WITH NOTHING ATTACHED TO IT ───────────────────────────────
// Pure, so the rules can be tested without a database, a request or a clock.
//
// The size check comes FIRST and does not consult the ledger: an oversized
// body is refused on its own terms whether or not the account has budget left,
// and refusing it costs nothing to work out.
//
// The budget check counts the request that is ABOUT to happen, not just what
// is already spent. Checking only the past lets every account overshoot by one
// unbounded request, which on this app's most expensive call is the entire
// thing being defended against. Output is already capped, so what is left to
// overshoot by is bounded and small.
function budgetVerdict({
  bytes = 0, maxBytes = DEFAULT_MAX_REQUEST_BYTES,
  used = 0, limit = DEFAULT_DAILY_TOKENS,
  unlimited = false, oldestAt = null, now = Date.now(),
} = {}) {
  if (bytes > maxBytes) {
    return {
      ok: false, status: 413,
      error: 'That request is too large to analyze in one go. '
        + 'Split the document and upload fewer pages at a time.',
    };
  }
  if (unlimited) return { ok: true, remaining: Infinity };

  const spent = Number(used) || 0;
  const cap = Number(limit) || DEFAULT_DAILY_TOKENS;
  const about = estimateTokens(bytes);
  if (spent + about > cap) {
    return { ok: false, status: 429, error: overBudgetMessage({ oldestAt, now }), remaining: Math.max(0, cap - spent) };
  }
  return { ok: true, remaining: cap - spent };
}

// Read at call time, not at module load: the test suite sets these per case,
// and requireUser's own constants are captured at load. One accessor each so
// there is a single place the two names are tried.
const usageUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const usageAnon = () => process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

let warnedInert = false;

// Loud once per cold start, not once per request: a warning on every call is a
// warning nobody reads. The wording names the fix, because the only person who
// will ever see it is the one who has to run the migration.
function warnInert(detail) {
  if (warnedInert) return;
  warnedInert = true;
  console.warn(
    '[spendCap] SPEND CAP IS NOT ACTIVE — could not read public.api_usage '
    + `(${detail}). Run supabase/schema.sql in the Supabase SQL editor. `
    + 'Until then every signed-in account can spend without limit.');
}

// → { ok, tokens, oldestAt } — ok:false means "could not tell", and the caller
// proceeds. Never throws.
async function readWindowTokens({ req, user, now = Date.now(), fetch: doFetch } = {}) {
  const f = doFetch || globalThis.fetch;
  const url = usageUrl();
  const anon = usageAnon();
  const token = bearer(req);
  if (!url || !anon || !token || !user || !user.id) return { ok: false, tokens: 0, oldestAt: null };

  const since = windowStartIso(now);
  const q = `${url}/rest/v1/${TABLE}`
    + `?select=tokens,at&user_id=eq.${encodeURIComponent(user.id)}`
    + `&at=gte.${encodeURIComponent(since)}&order=at.asc&limit=${MAX_LEDGER_ROWS}`;

  let r;
  try {
    r = await f(q, { headers: { apikey: anon, Authorization: 'Bearer ' + token } });
  } catch (e) {
    warnInert(e && e.message ? e.message : 'network error');
    return { ok: false, tokens: 0, oldestAt: null };
  }
  if (!r || !r.ok) {
    warnInert(`HTTP ${r ? r.status : '?'}`);
    return { ok: false, tokens: 0, oldestAt: null };
  }

  let rows = null;
  try { rows = await r.json(); } catch (e) { rows = null; }
  if (!Array.isArray(rows)) {
    warnInert('response was not a row array');
    return { ok: false, tokens: 0, oldestAt: null };
  }

  let tokens = 0;
  for (const row of rows) {
    const n = Number(row && row.tokens);
    if (Number.isFinite(n) && n > 0) tokens += n;
  }
  // The read stopped at the row cap, so this total is a floor, not a sum.
  // Reporting it as the real figure would let a very long tail of tiny
  // requests read as under budget forever.
  const capped = rows.length >= MAX_LEDGER_ROWS;
  return {
    ok: true,
    tokens: capped ? Number.MAX_SAFE_INTEGER : tokens,
    oldestAt: rows.length ? (rows[0] && rows[0].at) || null : null,
  };
}

// Best effort, and awaited rather than left dangling: a serverless function
// that has already returned its response may be frozen before a loose promise
// settles, which would silently make the ledger — and therefore the cap —
// record nothing at all.
async function recordUsage({ req, user, tokens, endpoint, fetch: doFetch } = {}) {
  const f = doFetch || globalThis.fetch;
  const url = usageUrl();
  const anon = usageAnon();
  const token = bearer(req);
  const n = Math.round(Number(tokens) || 0);
  if (!url || !anon || !token || !user || !user.id || n <= 0) return false;

  try {
    const r = await f(`${url}/rest/v1/${TABLE}`, {
      method: 'POST',
      headers: {
        apikey: anon,
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ user_id: user.id, tokens: n, endpoint: endpoint || null }),
    });
    if (!r || !r.ok) { warnInert(`insert returned HTTP ${r ? r.status : '?'}`); return false; }
    return true;
  } catch (e) {
    warnInert(e && e.message ? e.message : 'insert failed');
    return false;
  }
}

// ── WHAT A HANDLER CALLS ────────────────────────────────────────────────────
// One line before the model call. A verdict with ok:false is returned to the
// caller verbatim, exactly like requireUser's.
async function checkBudget({ req, user, now = Date.now(), fetch: doFetch } = {}) {
  const bytes = requestBytes(req && req.body);
  const unlimited = isUnlimited(user && user.id);

  // An oversized body never reaches the ledger read. It is refused on size
  // alone, and spending a round trip to Supabase to tell it so would be the
  // one thing a size guard exists to avoid.
  const sizeOnly = budgetVerdict({ bytes, maxBytes: maxRequestBytes(), unlimited: false, used: 0, limit: Infinity });
  if (!sizeOnly.ok) return { ...sizeOnly, bytes };

  if (unlimited) return { ok: true, bytes, unlimited: true };

  const seen = await readWindowTokens({ req, user, now, fetch: doFetch });
  if (!seen.ok) return { ok: true, bytes, inert: true };

  return {
    ...budgetVerdict({
      bytes, maxBytes: maxRequestBytes(), used: seen.tokens,
      limit: dailyTokenBudget(), unlimited: false, oldestAt: seen.oldestAt, now,
    }),
    bytes,
  };
}

// And one line after it. `usage` is whichever provider block came back; bytes
// is the fallback so a response that reports nothing still costs something.
async function noteUsage({ req, user, usage, bytes = 0, endpoint, fetch: doFetch } = {}) {
  if (isUnlimited(user && user.id)) return false;
  return recordUsage({ req, user, tokens: tokensFrom(usage, bytes), endpoint, fetch: doFetch });
}


module.exports = {
  requireUser, authConfigured, cappedMaxTokens, MAX_OUTPUT_TOKENS,
  checkBudget, noteUsage,
  budgetVerdict, requestBytes, estimateTokens, tokensFrom,
  isUnlimited, unlimitedIds, windowStartIso, overBudgetMessage,
  readWindowTokens, recordUsage,
  dailyTokenBudget, maxRequestBytes,
  WINDOW_HOURS, DEFAULT_DAILY_TOKENS, DEFAULT_MAX_REQUEST_BYTES,
  BYTES_PER_TOKEN, MAX_LEDGER_ROWS, TABLE,
};
