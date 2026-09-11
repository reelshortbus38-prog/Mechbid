import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// requireUser reads env at module load, so each case loads it fresh with the
// env it is describing.
async function load(env) {
  for (const k of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) {
    delete process.env[k];
  }
  Object.assign(process.env, env);
  const mod = await import('./requireUser.js?t=' + Math.random());
  return mod.default || mod;
}

const CONFIGURED = { SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_ANON_KEY: 'anon-key' };
const req = (auth) => ({ headers: auth ? { authorization: auth } : {} });
const okUser = () => ({ ok: true, json: async () => ({ id: 'user-1', email: 'a@b.c' }) });
const refuse = () => ({ ok: false, status: 401, json: async () => ({}) });

describe('requireUser — the endpoints were open to anybody', () => {
  it('refuses a request with no token', async () => {
    const { requireUser } = await load(CONFIGURED);
    const r = await requireUser(req(), { fetch: okUser });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(401);
  });

  it('refuses a token Supabase does not recognise', async () => {
    const { requireUser } = await load(CONFIGURED);
    const r = await requireUser(req('Bearer forged'), { fetch: refuse });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(401);
  });

  it('refuses a malformed Authorization header', async () => {
    const { requireUser } = await load(CONFIGURED);
    for (const h of ['forged', 'Basic abc', 'Bearer', 'bearer x']) {
      const r = await requireUser(req(h), { fetch: okUser });
      expect(r.ok, h).toBe(false);
    }
  });

  it('lets a real session through', async () => {
    const { requireUser } = await load(CONFIGURED);
    const r = await requireUser(req('Bearer good-token'), { fetch: okUser });
    expect(r.ok).toBe(true);
    expect(r.user.id).toBe('user-1');
  });

  it('sends the token to Supabase, not just checks it looks like one', async () => {
    const { requireUser } = await load(CONFIGURED);
    let seen = null;
    await requireUser(req('Bearer abc123'), {
      fetch: (url, opts) => { seen = { url, opts }; return okUser(); },
    });
    expect(seen.url).toBe('https://proj.supabase.co/auth/v1/user');
    expect(seen.opts.headers.Authorization).toBe('Bearer abc123');
    expect(seen.opts.headers.apikey).toBe('anon-key');
  });

  it('fails CLOSED when Supabase cannot be reached', async () => {
    // An auth check that opens the door whenever it cannot run is not an auth
    // check. A network blip must not become a free pass to the API keys.
    const { requireUser } = await load(CONFIGURED);
    const r = await requireUser(req('Bearer good'), {
      fetch: () => { throw new Error('ECONNREFUSED'); },
    });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(503);
  });

  it('refuses a 200 that carries no user', async () => {
    const { requireUser } = await load(CONFIGURED);
    const r = await requireUser(req('Bearer good'), { fetch: () => ({ ok: true, json: async () => ({}) }) });
    expect(r.ok).toBe(false);
  });

  it('reads the VITE_ names too, which is what Vercel actually has set', async () => {
    const { authConfigured } = await load({
      VITE_SUPABASE_URL: 'https://p.supabase.co', VITE_SUPABASE_ANON_KEY: 'k',
    });
    expect(authConfigured()).toBe(true);
  });
});

describe('a deployment with no accounts at all', () => {
  it('is let through, deliberately', async () => {
    // The app runs fully local-only with no Supabase. There is nothing to sign
    // in to, so there is nothing to check — and such a deployment is as open as
    // this one used to be, which is why `configured` comes back false.
    const { requireUser } = await load({});
    const r = await requireUser(req(), { fetch: okUser });
    expect(r.ok).toBe(true);
    expect(r.configured).toBe(false);
  });
});

describe('cappedMaxTokens — the caller used to pick the bill', () => {
  it('caps an outsized ask', async () => {
    const { cappedMaxTokens, MAX_OUTPUT_TOKENS } = await load(CONFIGURED);
    expect(cappedMaxTokens(10_000_000)).toBe(MAX_OUTPUT_TOKENS);
  });

  it('leaves the app\'s own asks alone', async () => {
    const { cappedMaxTokens } = await load(CONFIGURED);
    expect(cappedMaxTokens(4000)).toBe(4000);
    expect(cappedMaxTokens(8000)).toBe(8000);
  });

  it('falls back on junk rather than sending NaN to the model', async () => {
    const { cappedMaxTokens } = await load(CONFIGURED);
    for (const junk of [undefined, null, '', 'lots', -5, 0, {}]) {
      expect(cappedMaxTokens(junk), String(junk)).toBe(4000);
    }
  });
});
