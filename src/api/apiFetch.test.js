import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiFetch } from './apiFetch.js';

// No Supabase in the test env, so authHeader contributes nothing and these
// exercise the request shape and the refusal path.
const reply = (status, body) => ({
  status, ok: status < 400,
  clone() { return this; },
  json: async () => body,
  text: async () => JSON.stringify(body),
});

afterEach(() => { vi.unstubAllGlobals(); });

describe('apiFetch', () => {
  it('sends JSON by default and keeps the caller\'s options', async () => {
    let seen = null;
    vi.stubGlobal('fetch', (url, opts) => { seen = { url, opts }; return reply(200, {}); });
    await apiFetch('/api/claude', { method: 'POST', body: '{"a":1}' });
    expect(seen.url).toBe('/api/claude');
    expect(seen.opts.method).toBe('POST');
    expect(seen.opts.headers['Content-Type']).toBe('application/json');
    expect(seen.opts.body).toBe('{"a":1}');
  });

  it('turns a 401 into the server\'s own sentence, not an HTTP code', async () => {
    // What this replaced: Error('parse-excel error 401: {"error":"Sign in...').
    vi.stubGlobal('fetch', () => reply(401, { error: 'Sign in to use this.' }));
    await expect(apiFetch('/api/parse-excel', {})).rejects.toThrow('Sign in to use this.');
  });

  it('surfaces a failed verification too', async () => {
    vi.stubGlobal('fetch', () => reply(503, { error: 'Could not verify your session. Try again.' }));
    await expect(apiFetch('/api/claude', {})).rejects.toThrow(/verify your session/);
  });

  it('still says something useful when the body is not JSON', async () => {
    vi.stubGlobal('fetch', () => ({
      status: 401, ok: false, clone() { return this; },
      json: async () => { throw new Error('not json'); },
    }));
    await expect(apiFetch('/api/claude', {})).rejects.toThrow('Sign in to use this.');
  });

  it('leaves every other response to the caller', async () => {
    // A 500 from the model path is not an auth problem and the callers have
    // their own handling for it.
    vi.stubGlobal('fetch', () => reply(500, { error: 'model exploded' }));
    const res = await apiFetch('/api/claude', {});
    expect(res.status).toBe(500);
  });
});
