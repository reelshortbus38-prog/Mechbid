import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import spendGate from './requireUser.js';

// requireUser.js is CommonJS, because api/ is Vercel's runtime. The test is
// ESM, because that is the only thing vitest loads. The default import is the
// module.exports object.
const {
  checkBudget, noteUsage,
  budgetVerdict, requestBytes, estimateTokens, tokensFrom,
  isUnlimited, windowStartIso, overBudgetMessage,
  readWindowTokens, recordUsage,
  dailyTokenBudget, maxRequestBytes,
  WINDOW_HOURS, DEFAULT_DAILY_TOKENS, DEFAULT_MAX_REQUEST_BYTES, MAX_LEDGER_ROWS,
} = spendGate;

// ── WHAT THIS FILE IS DEFENDING ──────────────────────────────────────────────
// Signing up for Coldgauge is free and email confirmation is off. Reading a
// plan set is the most expensive thing the app does, and it runs on the shop's
// own Anthropic and OpenRouter keys. Before this, a signed-in account could
// call the vision endpoint as many times as it liked with a body as large as
// it liked — so "go live and post the link on Reddit" and "an uncapped spend
// path" were the same sentence.

const USER = { id: '11111111-1111-1111-1111-111111111111' };
const req = (body, token = 'tok') => ({ body, headers: { authorization: 'Bearer ' + token } });

let env;
beforeEach(() => {
  env = { ...process.env };
  process.env.SUPABASE_URL = 'https://proj.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-key';
  delete process.env.DAILY_TOKEN_BUDGET;
  delete process.env.MAX_REQUEST_BYTES;
  delete process.env.UNLIMITED_USER_IDS;
});
afterEach(() => { process.env = env; vi.restoreAllMocks(); });

// A Supabase REST double. `rows` is what the ledger holds.
function supabase({ rows = [], readStatus = 200, writeStatus = 201 } = {}) {
  const inserts = [];
  const fetch = vi.fn(async (url, opts = {}) => {
    if ((opts.method || 'GET') === 'POST') {
      inserts.push(JSON.parse(opts.body));
      return { ok: writeStatus < 300, status: writeStatus, json: async () => ({}) };
    }
    return {
      ok: readStatus < 300, status: readStatus,
      json: async () => rows,
      url,
    };
  });
  return { fetch, inserts, calls: () => fetch.mock.calls };
}

describe('measuring what was sent', () => {
  it('counts the bytes of the actual body', () => {
    expect(requestBytes({ a: 'bc' })).toBe(JSON.stringify({ a: 'bc' }).length);
    expect(requestBytes('hello')).toBe(5);
    expect(requestBytes(null)).toBe(0);
  });

  it('counts multi-byte characters as the bytes they are, not the characters', () => {
    // A plan note with a ½ or a ° in it is more bytes than it is characters,
    // and the body size limit is about bytes.
    expect(requestBytes('½')).toBe(2);
  });

  it('survives a body that cannot be stringified', () => {
    const loop = {}; loop.self = loop;
    expect(requestBytes(loop)).toBe(0);
  });

  it('turns bytes into a rough token count', () => {
    expect(estimateTokens(4000)).toBe(1000);
    expect(estimateTokens(0)).toBe(0);
    expect(estimateTokens(-5)).toBe(0);
    expect(estimateTokens('nonsense')).toBe(0);
  });
});

// ── WHAT A CALL COST ─────────────────────────────────────────────────────────
describe('reading the usage a provider reported', () => {
  it('reads Anthropic’s shape', () => {
    expect(tokensFrom({ input_tokens: 1200, output_tokens: 300 })).toBe(1500);
  });

  it('reads OpenRouter’s OpenAI-shaped one too', () => {
    // Same bill, different field names. Missing this would make the entire
    // fallback path free.
    expect(tokensFrom({ prompt_tokens: 900, completion_tokens: 100 })).toBe(1000);
  });

  it('sums several calls made for one request', () => {
    // The vision endpoint runs a primary and a cross-check in parallel and is
    // billed for both.
    expect(tokensFrom([
      { input_tokens: 1000, output_tokens: 200 },
      { prompt_tokens: 800, completion_tokens: 50 },
    ])).toBe(2050);
  });

  // ── A PATH THAT REPORTS NOTHING MUST NOT BE A FREE PATH ────────────────────
  // This is the hole somebody would actually find: if a response without a
  // usage block records zero, then the cheapest way past the whole cap is to
  // make the provider return one.
  it('falls back to the size estimate when no usage came back', () => {
    expect(tokensFrom(null, 8000)).toBe(2000);
    expect(tokensFrom({}, 8000)).toBe(2000);
    expect(tokensFrom({ input_tokens: 0, output_tokens: 0 }, 8000)).toBe(2000);
    expect(tokensFrom([null, {}], 8000)).toBe(2000);
  });

  it('applies the fallback once for the whole request, not once per call', () => {
    expect(tokensFrom([null, null], 8000)).toBe(2000);
  });

  it('prefers what the provider said over the estimate', () => {
    expect(tokensFrom({ input_tokens: 10, output_tokens: 1 }, 8000)).toBe(11);
  });
});

describe('the rolling window', () => {
  it('looks back 24 hours from now, not to midnight', () => {
    // A calendar reset lands at 8pm on the east coast, so "resets at midnight"
    // would be false to the person reading it.
    const now = Date.parse('2026-10-12T15:00:00.000Z');
    expect(windowStartIso(now)).toBe('2026-10-11T15:00:00.000Z');
    expect(WINDOW_HOURS).toBe(24);
  });
});

// ── THE DECISION ─────────────────────────────────────────────────────────────
describe('the verdict, with no database in sight', () => {
  const base = { used: 0, limit: 100_000, maxBytes: 1_000_000, bytes: 1000 };

  it('passes a normal request', () => {
    expect(budgetVerdict(base).ok).toBe(true);
  });

  it('refuses a body past the size limit, with a 413 and advice', () => {
    const v = budgetVerdict({ ...base, bytes: 2_000_000 });
    expect(v.ok).toBe(false);
    expect(v.status).toBe(413);
    expect(v.error).toMatch(/too large/i);
    expect(v.error).toMatch(/fewer pages/i);
  });

  it('refuses an account that has spent its budget, with a 429', () => {
    const v = budgetVerdict({ ...base, used: 100_000 });
    expect(v.ok).toBe(false);
    expect(v.status).toBe(429);
  });

  // ── COUNTING THE REQUEST ABOUT TO HAPPEN ──────────────────────────────────
  // Checking only what is already spent lets every account overshoot by one
  // more request — and on this app the one request IS the expensive thing.
  it('counts the request being made, not just the ones already made', () => {
    // 1 byte under the line, with a 40,000-byte body = 10,000 tokens about to
    // be spent. Checking the past alone would wave this through.
    expect(budgetVerdict({ ...base, used: 99_999, bytes: 40_000 }).ok).toBe(false);
    expect(budgetVerdict({ ...base, used: 50_000, bytes: 40_000 }).ok).toBe(true);
  });

  it('says how much is left when it refuses, so the number is checkable', () => {
    expect(budgetVerdict({ ...base, used: 97_000, bytes: 40_000 }).remaining).toBe(3000);
  });

  // ── THE SIZE CHECK DOES NOT DEPEND ON THE BUDGET ──────────────────────────
  it('refuses an oversized body even for an account with budget to spare', () => {
    expect(budgetVerdict({ ...base, used: 0, bytes: 9_000_000 }).status).toBe(413);
  });

  // ── AND AN UNLIMITED ACCOUNT IS STILL SIZE-CAPPED ─────────────────────────
  // The exemption is about metering the two people whose shop this is. It is
  // not a reason to let a 50 MB body through, which would just fail slowly.
  it('exempts a listed account from the budget but not from the size limit', () => {
    expect(budgetVerdict({ ...base, used: 10_000_000, unlimited: true }).ok).toBe(true);
    expect(budgetVerdict({ ...base, bytes: 9_000_000, unlimited: true }).status).toBe(413);
  });
});

describe('the accounts that are never metered', () => {
  it('matches an id in the env list', () => {
    expect(isUnlimited(USER.id, `other,${USER.id}`)).toBe(true);
    expect(isUnlimited(USER.id, ` ${USER.id} , x `)).toBe(true);
  });

  it('does not match anything else, and not an empty list', () => {
    expect(isUnlimited(USER.id, 'someone-else')).toBe(false);
    expect(isUnlimited(USER.id, '')).toBe(false);
    expect(isUnlimited(USER.id, undefined)).toBe(false);
    expect(isUnlimited(null, USER.id)).toBe(false);
    // An empty env var must not become an empty string that matches a
    // missing id — that would exempt unauthenticated callers.
    expect(isUnlimited('', ',,')).toBe(false);
  });
});

describe('what the refusal tells somebody', () => {
  const now = Date.parse('2026-10-12T15:00:00.000Z');

  it('says what happened and that it is temporary', () => {
    const m = overBudgetMessage({ now });
    expect(m).toMatch(/used its AI analysis budget/i);
    expect(m).toMatch(/support@coldgauge\.com/);
  });

  it('says roughly when budget comes back, from the oldest request in the window', () => {
    // Oldest call was 20 hours ago, so 4 hours from now it leaves the window.
    const m = overBudgetMessage({ oldestAt: '2026-10-11T19:00:00.000Z', now });
    expect(m).toMatch(/about 4 hours/);
  });

  it('does not say "0 hours" when it is nearly through', () => {
    const m = overBudgetMessage({ oldestAt: '2026-10-11T15:10:00.000Z', now });
    expect(m).toMatch(/under an hour/);
  });
});

// ── READING THE LEDGER ───────────────────────────────────────────────────────
describe('reading what an account has spent', () => {
  it('sums the window and reports the oldest row', async () => {
    const db = supabase({ rows: [
      { tokens: 1000, at: '2026-10-11T19:00:00.000Z' },
      { tokens: 500, at: '2026-10-12T01:00:00.000Z' },
    ] });
    const out = await readWindowTokens({ req: req({}), user: USER, fetch: db.fetch });
    expect(out.ok).toBe(true);
    expect(out.tokens).toBe(1500);
    expect(out.oldestAt).toBe('2026-10-11T19:00:00.000Z');
  });

  it('asks only for this user and only inside the window', async () => {
    const db = supabase({ rows: [] });
    const now = Date.parse('2026-10-12T15:00:00.000Z');
    await readWindowTokens({ req: req({}), user: USER, now, fetch: db.fetch });
    const [url, opts] = db.calls()[0];
    expect(url).toContain(`user_id=eq.${USER.id}`);
    expect(url).toContain(encodeURIComponent('2026-10-11T15:00:00.000Z'));
    // The caller's own token, which is what makes RLS the thing enforcing the
    // scope — and what keeps the service-role key out of this path.
    expect(opts.headers.Authorization).toBe('Bearer tok');
    expect(opts.headers.apikey).toBe('anon-key');
  });

  it('treats a full page of rows as over budget rather than as a total', async () => {
    // The read stops at the row cap, so the sum is a floor. Reporting it as
    // the real figure would let a long tail of tiny requests read as under
    // budget forever.
    const rows = Array.from({ length: MAX_LEDGER_ROWS }, () => ({ tokens: 1, at: '2026-10-12T01:00:00.000Z' }));
    const out = await readWindowTokens({ req: req({}), user: USER, fetch: supabase({ rows }).fetch });
    expect(out.tokens).toBeGreaterThan(DEFAULT_DAILY_TOKENS);
  });

  it('ignores junk rows instead of letting one break the sum', async () => {
    const db = supabase({ rows: [{ tokens: 'x' }, { tokens: null }, { tokens: 7, at: 'a' }] });
    expect((await readWindowTokens({ req: req({}), user: USER, fetch: db.fetch })).tokens).toBe(7);
  });

  it('reports "could not tell" rather than throwing, on every kind of failure', async () => {
    const broken = vi.fn(async () => { throw new Error('socket hang up'); });
    expect((await readWindowTokens({ req: req({}), user: USER, fetch: broken })).ok).toBe(false);

    const http500 = supabase({ readStatus: 500 });
    expect((await readWindowTokens({ req: req({}), user: USER, fetch: http500.fetch })).ok).toBe(false);

    const notArray = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ message: 'relation does not exist' }) }));
    expect((await readWindowTokens({ req: req({}), user: USER, fetch: notArray })).ok).toBe(false);
  });

  it('does not even try without a token or a user', async () => {
    const db = supabase({ rows: [] });
    expect((await readWindowTokens({ req: { body: {}, headers: {} }, user: USER, fetch: db.fetch })).ok).toBe(false);
    expect((await readWindowTokens({ req: req({}), user: null, fetch: db.fetch })).ok).toBe(false);
    expect(db.calls().length).toBe(0);
  });
});

describe('writing to the ledger', () => {
  it('records the server’s number against the caller', async () => {
    const db = supabase();
    const ok = await recordUsage({ req: req({}), user: USER, tokens: 1234, endpoint: 'claude', fetch: db.fetch });
    expect(ok).toBe(true);
    expect(db.inserts[0]).toEqual({ user_id: USER.id, tokens: 1234, endpoint: 'claude' });
  });

  it('writes nothing for a call that cost nothing', async () => {
    const db = supabase();
    expect(await recordUsage({ req: req({}), user: USER, tokens: 0, fetch: db.fetch })).toBe(false);
    expect(db.inserts.length).toBe(0);
  });

  it('never throws, whatever the database does', async () => {
    const broken = vi.fn(async () => { throw new Error('nope'); });
    await expect(recordUsage({ req: req({}), user: USER, tokens: 5, fetch: broken })).resolves.toBe(false);
    const refused = supabase({ writeStatus: 403 });
    await expect(recordUsage({ req: req({}), user: USER, tokens: 5, fetch: refused.fetch })).resolves.toBe(false);
  });
});

// ── THE WHOLE THING, AS A HANDLER USES IT ────────────────────────────────────
describe('checkBudget, end to end', () => {
  it('lets a fresh account through', async () => {
    const db = supabase({ rows: [] });
    const out = await checkBudget({ req: req({ messages: [] }), user: USER, fetch: db.fetch });
    expect(out.ok).toBe(true);
  });

  it('refuses the account that is over, with the 429 a handler returns verbatim', async () => {
    const db = supabase({ rows: [{ tokens: DEFAULT_DAILY_TOKENS, at: '2026-10-12T01:00:00.000Z' }] });
    const out = await checkBudget({ req: req({ messages: [] }), user: USER, fetch: db.fetch });
    expect(out.ok).toBe(false);
    expect(out.status).toBe(429);
    expect(out.error).toMatch(/budget/i);
  });

  it('refuses an oversized body WITHOUT asking the database', async () => {
    // A size refusal costs nothing to work out. Spending a Supabase round trip
    // to deliver it is the one thing a size guard is for.
    const db = supabase({ rows: [] });
    const big = { blob: 'x'.repeat(DEFAULT_MAX_REQUEST_BYTES + 1000) };
    const out = await checkBudget({ req: req(big), user: USER, fetch: db.fetch });
    expect(out.status).toBe(413);
    expect(db.calls().length).toBe(0);
  });

  // ── FAILING OPEN, ON PURPOSE ──────────────────────────────────────────────
  // Safe only because requireUser fails CLOSED when Supabase is unreachable:
  // Supabase has to be up and the session valid before this runs at all. So an
  // unreadable ledger nearly always means the migration has not been run — and
  // refusing a live bid over a cap that cannot find its own table trades a
  // possible bill for a certain outage.
  it('lets the request through when the ledger cannot be read, and says so', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = await checkBudget({
      req: req({ messages: [] }), user: USER,
      fetch: vi.fn(async () => { throw new Error('relation "api_usage" does not exist'); }),
    });
    expect(out.ok).toBe(true);
    expect(out.inert).toBe(true);
  });

  it('exempts a listed account without reading the ledger at all', async () => {
    process.env.UNLIMITED_USER_IDS = USER.id;
    const db = supabase({ rows: [{ tokens: 99_000_000, at: '2026-10-12T01:00:00.000Z' }] });
    const out = await checkBudget({ req: req({ messages: [] }), user: USER, fetch: db.fetch });
    expect(out.ok).toBe(true);
    expect(out.unlimited).toBe(true);
    expect(db.calls().length).toBe(0);
  });

  it('still size-caps a listed account', async () => {
    process.env.UNLIMITED_USER_IDS = USER.id;
    const big = { blob: 'x'.repeat(DEFAULT_MAX_REQUEST_BYTES + 1000) };
    expect((await checkBudget({ req: req(big), user: USER, fetch: supabase().fetch })).status).toBe(413);
  });
});

describe('noteUsage, as a handler uses it', () => {
  it('records what the providers reported', async () => {
    const db = supabase();
    await noteUsage({
      req: req({}), user: USER, endpoint: 'claude-direct',
      usage: [{ input_tokens: 1000, output_tokens: 200 }, { prompt_tokens: 50, completion_tokens: 5 }],
      bytes: 400, fetch: db.fetch,
    });
    expect(db.inserts[0].tokens).toBe(1255);
    expect(db.inserts[0].endpoint).toBe('claude-direct');
  });

  it('records the estimate when the providers reported nothing', async () => {
    const db = supabase();
    await noteUsage({ req: req({}), user: USER, usage: null, bytes: 40_000, fetch: db.fetch });
    expect(db.inserts[0].tokens).toBe(10_000);
  });

  it('writes no ledger row for an exempt account', async () => {
    process.env.UNLIMITED_USER_IDS = USER.id;
    const db = supabase();
    await noteUsage({ req: req({}), user: USER, usage: { input_tokens: 500 }, fetch: db.fetch });
    expect(db.inserts.length).toBe(0);
  });
});

describe('the limits are tunable without a deploy', () => {
  it('reads the budget and the size cap from the environment', () => {
    process.env.DAILY_TOKEN_BUDGET = '50000';
    process.env.MAX_REQUEST_BYTES = '2048';
    expect(dailyTokenBudget()).toBe(50_000);
    expect(maxRequestBytes()).toBe(2048);
  });

  it('falls back to the shipped defaults on junk, rather than to zero', () => {
    // A zero or negative limit read literally would refuse every request in
    // the app — an outage caused by a typo in a Vercel field.
    for (const junk of ['0', '-1', 'lots', '']) {
      process.env.DAILY_TOKEN_BUDGET = junk;
      process.env.MAX_REQUEST_BYTES = junk;
      expect(dailyTokenBudget(), junk).toBe(DEFAULT_DAILY_TOKENS);
      expect(maxRequestBytes(), junk).toBe(DEFAULT_MAX_REQUEST_BYTES);
    }
  });

  it('ships a budget generous enough not to stop a real day of estimating', () => {
    expect(DEFAULT_DAILY_TOKENS).toBeGreaterThanOrEqual(1_000_000);
  });
});
