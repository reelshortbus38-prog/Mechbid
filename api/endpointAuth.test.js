import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// ── THE GATE IS ONLY REAL IF THE HANDLERS ACTUALLY CALL IT ──────────────────
// requireUser.test.js proves the check works. This proves it is WIRED — that
// every endpoint which spends money refuses an anonymous request before it
// reaches a model, a file, or an API key.
//
// A future endpoint added without the gate is exactly the mistake this catches:
// the list below is checked against the directory, so a new handler that nobody
// remembered to protect fails here.

const ORIGINAL = {};
beforeAll(() => {
  for (const k of ['SUPABASE_URL', 'SUPABASE_ANON_KEY']) ORIGINAL[k] = process.env[k];
  process.env.SUPABASE_URL = 'https://proj.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-key';
});
afterAll(() => {
  for (const [k, v] of Object.entries(ORIGINAL)) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

// Every handler under api/ that reaches a paid service.
const SPENDING_ENDPOINTS = ['claude', 'claude-direct', 'parse-doc', 'parse-excel'];

function fakeRes() {
  const out = { code: 0, body: null };
  return {
    out,
    status(c) { out.code = c; return this; },
    json(b) { out.body = b; return this; },
    setHeader() { return this; },
    end() { return this; },
  };
}

describe('no endpoint answers an anonymous caller', () => {
  for (const name of SPENDING_ENDPOINTS) {
    it(`/api/${name} refuses with 401`, async () => {
      const mod = await import(`./${name}.js`);
      const handler = mod.default || mod;
      const res = fakeRes();
      await handler(
        { method: 'POST', headers: {}, body: { messages: [{ role: 'user', content: 'hi' }], fileData: 'x' } },
        res,
      );
      expect(res.out.code, `${name} let an anonymous request through`).toBe(401);
      expect(String(res.out.body && res.out.body.error)).toMatch(/sign in/i);
    });
  }

  it('still refuses non-POST, which was the only check there used to be', async () => {
    const mod = await import('./claude.js');
    const handler = mod.default || mod;
    const res = fakeRes();
    await handler({ method: 'GET', headers: {}, body: {} }, res);
    expect(res.out.code).toBe(405);
  });
});

describe('the list above stays honest', () => {
  it('names every handler in api/ that takes a request', async () => {
    // Pure modules (bprCircuit, sheetSanity…) are required BY handlers and
    // never called directly, so they are not gated and should not be listed.
    // Anything exporting a two-argument handler is.
    const { readdirSync, readFileSync } = await import('node:fs');
    const files = readdirSync(new URL('.', import.meta.url))
      .filter(f => f.endsWith('.js') && !f.endsWith('.test.js'));
    const handlers = files.filter(f => {
      const src = readFileSync(new URL(f, import.meta.url), 'utf8');
      return /function handler\s*\(\s*req\s*,\s*res\s*\)/.test(src);
    }).map(f => f.replace(/\.js$/, ''));
    expect(handlers.sort()).toEqual([...SPENDING_ENDPOINTS].sort());
  });
});
