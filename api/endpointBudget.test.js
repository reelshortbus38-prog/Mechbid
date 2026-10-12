import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import spendGate from './requireUser.js';

// ── THE CAP IS ONLY REAL IF THE HANDLERS CALL IT ────────────────────────────
// spendCap.test.js proves the rules are right. This proves they are WIRED,
// which in this project is the failure that keeps happening: a pure module
// that is correct, a green suite, and an app that never calls it.
//
// So nothing here greps a source file. Each endpoint is invoked for real, with
// global fetch standing in for Supabase and the providers, and the questions
// asked are the two that matter:
//
//   1. does an over-budget account get refused, and
//   2. is the model left uncalled when it is — because a cap that refuses the
//      request AFTER paying for it is not a cap.
//
// And the other direction, which is the half that is easy to forget: a normal
// request still goes through, and it leaves a row on the ledger. A cap that
// records nothing never trips a second time.

const { DEFAULT_DAILY_TOKENS, DEFAULT_MAX_REQUEST_BYTES } = spendGate;

const USER_ID = '11111111-1111-1111-1111-111111111111';
const SPENDING_ENDPOINTS = ['claude', 'claude-direct', 'parse-excel'];

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

// A real workbook, in a format none of the built-in parsers recognise, with
// enough text on the sheet to send it down the AI path. A workbook the known
// parsers DO handle never calls a provider at all — which is correct, and also
// why a made-up fixture would have proved nothing about the ledger.
async function unknownWorkbook() {
  const XLSX = (await import('xlsx')).default || (await import('xlsx'));
  const rows = [['Equipment Schedule', 'Area', 'Notes']];
  for (let i = 1; i <= 12; i++) {
    rows.push([`Unit ${i}`, 'Back room', `general note text for row ${i} describing scope of work`]);
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }).toString('base64');
}

// A request each endpoint will actually try to serve.
async function bodyFor(name) {
  if (name === 'parse-excel') {
    return { fileData: await unknownWorkbook(), fileName: 'equipment.xlsx' };
  }
  return { messages: [{ role: 'user', content: 'read this sheet' }], max_tokens: 1000 };
}

// Stands in for every outbound call the handlers make. `ledger` is what the
// usage table holds.
function world({ ledger = [] } = {}) {
  const hits = { providers: [], inserts: [], reads: 0 };
  const fetch = vi.fn(async (url, opts = {}) => {
    const u = String(url);

    if (u.includes('/auth/v1/user')) {
      return { ok: true, status: 200, json: async () => ({ id: USER_ID, email: 'pat@example.com' }) };
    }

    if (u.includes('/rest/v1/api_usage')) {
      if ((opts.method || 'GET') === 'POST') {
        hits.inserts.push(JSON.parse(opts.body));
        return { ok: true, status: 201, json: async () => ({}) };
      }
      hits.reads += 1;
      return { ok: true, status: 200, json: async () => ledger };
    }

    if (u.includes('anthropic.com')) {
      hits.providers.push('anthropic');
      return {
        ok: true, status: 200,
        json: async () => ({
          content: [{ type: 'text', text: '{"circuits":[]}' }],
          usage: { input_tokens: 4321, output_tokens: 100 },
        }),
      };
    }

    if (u.includes('openrouter.ai')) {
      hits.providers.push('openrouter');
      return {
        ok: true, status: 200,
        json: async () => ({
          choices: [{ message: { content: '{"circuits":[]}' } }],
          usage: { prompt_tokens: 10, completion_tokens: 2 },
        }),
      };
    }

    throw new Error('unexpected fetch to ' + u);
  });
  return { fetch, hits };
}

const ORIGINAL = {};
const TOUCHED = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'ANTHROPIC_API_KEY', 'OPENROUTER_API_KEY',
  'DAILY_TOKEN_BUDGET', 'MAX_REQUEST_BYTES', 'UNLIMITED_USER_IDS'];

beforeEach(() => {
  for (const k of TOUCHED) ORIGINAL[k] = process.env[k];
  process.env.SUPABASE_URL = 'https://proj.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-key';
  process.env.ANTHROPIC_API_KEY = 'sk-test';
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.DAILY_TOKEN_BUDGET;
  delete process.env.MAX_REQUEST_BYTES;
  delete process.env.UNLIMITED_USER_IDS;
});
afterEach(() => {
  for (const k of TOUCHED) {
    if (ORIGINAL[k] === undefined) delete process.env[k]; else process.env[k] = ORIGINAL[k];
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function call(name, { ledger = [], body } = {}) {
  const w = world({ ledger });
  vi.stubGlobal('fetch', w.fetch);
  // ── THE MODULE HAS TO BE LOADED AFTER THE STUB ────────────────────────────
  // parse-excel.js does `const fetch = globalThis.fetch || require('node-fetch')`
  // at module scope, so it keeps whichever fetch existed when it was FIRST
  // imported. Without this reset the second test onwards had its provider
  // calls delivered to the previous test's stub — the request really was
  // served, and this file's own instrument said no provider was reached.
  vi.resetModules();
  const mod = await import(`./${name}.js`);
  const handler = mod.default || mod;
  const res = fakeRes();
  await handler(
    { method: 'POST', headers: { authorization: 'Bearer live-token' }, body: body || await bodyFor(name) },
    res,
  );
  return { res, hits: w.hits };
}

const SPENT_OUT = [{ tokens: DEFAULT_DAILY_TOKENS, at: new Date().toISOString() }];

describe('an account that has spent its budget', () => {
  for (const name of SPENDING_ENDPOINTS) {
    it(`/api/${name} refuses it with a 429`, async () => {
      const { res } = await call(name, { ledger: SPENT_OUT });
      expect(res.out.code, `${name} served an over-budget account`).toBe(429);
      expect(String(res.out.body && res.out.body.error)).toMatch(/budget/i);
    });

    // ── THE ASSERTION THAT MAKES IT A CAP ─────────────────────────────────
    // Refusing after the model has already answered would cost exactly as
    // much as not refusing at all.
    it(`/api/${name} spends nothing doing it`, async () => {
      const { hits } = await call(name, { ledger: SPENT_OUT });
      expect(hits.providers, `${name} called a provider before refusing`).toEqual([]);
      expect(hits.inserts).toEqual([]);
    });
  }
});

describe('an account with budget left', () => {
  for (const name of SPENDING_ENDPOINTS) {
    it(`/api/${name} serves it, and bills it to the ledger`, async () => {
      const { res, hits } = await call(name, { ledger: [] });
      expect(res.out.code, `${name} refused a request it should have served`).toBe(200);
      expect(hits.providers.length, `${name} never reached a provider`).toBeGreaterThan(0);
      // The row is what makes the NEXT request countable. Without it the cap
      // reads zero forever and never trips.
      expect(hits.inserts.length, `${name} served the request without recording it`).toBe(1);
      expect(hits.inserts[0].user_id).toBe(USER_ID);
      expect(hits.inserts[0].endpoint).toBe(name);
    });

    it(`/api/${name} records what the provider said it cost, not a guess`, async () => {
      const { hits } = await call(name, { ledger: [] });
      // 4321 + 100 from the stubbed Anthropic usage block. A size estimate
      // would be some other number entirely.
      expect(hits.inserts[0].tokens).toBe(4421);
    });
  }
});

// ── THE SIZE GUARD, AT THE ENDPOINT ─────────────────────────────────────────
describe('a body too large to analyze', () => {
  for (const name of SPENDING_ENDPOINTS) {
    it(`/api/${name} refuses it with a 413 and never asks Supabase`, async () => {
      const huge = 'x'.repeat(DEFAULT_MAX_REQUEST_BYTES + 5000);
      const body = name === 'parse-excel'
        ? { fileData: huge, fileName: 'big.xlsx' }
        : { messages: [{ role: 'user', content: huge }] };
      const { res, hits } = await call(name, { ledger: [], body });
      expect(res.out.code).toBe(413);
      expect(hits.providers).toEqual([]);
      expect(hits.reads, 'spent a Supabase round trip to deliver a size refusal').toBe(0);
    });
  }
});

// ── A FAILED READ IS NOT A FREE READ ────────────────────────────────────────
// Anthropic can answer, bill for the answer, and still hand back nothing this
// app can use — a response whose content holds no text block. claude-direct
// turns that into a 502.
//
// The tokens were spent. If the 502 path records nothing, then triggering that
// failure over and over is an unmetered way to spend the shop's money, and it
// is the kind of path that gets found by accident: a bad page image produces
// it without anybody trying.
//
// This test was written because breaking that line on purpose changed nothing
// in the suite — the code was already right and nothing was checking it.
describe('a vision read that costs money and returns nothing usable', () => {
  it('still bills the account, then reports the failure', async () => {
    const inserts = [];
    vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
      const u = String(url);
      if (u.includes('/auth/v1/user')) return { ok: true, status: 200, json: async () => ({ id: USER_ID }) };
      if (u.includes('/rest/v1/api_usage')) {
        if ((opts.method || 'GET') === 'POST') { inserts.push(JSON.parse(opts.body)); return { ok: true, status: 201, json: async () => ({}) }; }
        return { ok: true, status: 200, json: async () => [] };
      }
      if (u.includes('anthropic.com')) {
        // Billed, and unusable: a thinking block and no text block.
        return { ok: true, status: 200, json: async () => ({ content: [], usage: { input_tokens: 9000, output_tokens: 12 } }) };
      }
      throw new Error('unexpected fetch to ' + u);
    }));
    vi.resetModules();
    const mod = await import('./claude-direct.js');
    const handler = mod.default || mod;
    const res = fakeRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer live-token' }, body: await bodyFor('claude-direct') }, res);

    expect(res.out.code).toBe(502);
    expect(inserts.length, 'a failed vision read was free').toBe(1);
    expect(inserts[0].tokens).toBe(9012);
  });
});

// ── THE TWO ACCOUNTS THAT MUST NEVER BE STOPPED ─────────────────────────────
describe('an exempt account', () => {
  it('is served even sitting on a ledger far past the budget', async () => {
    process.env.UNLIMITED_USER_IDS = USER_ID;
    const { res } = await call('claude', {
      ledger: [{ tokens: DEFAULT_DAILY_TOKENS * 50, at: new Date().toISOString() }],
    });
    expect(res.out.code).toBe(200);
  });
});

// ── AND IT STILL WORKS WITH NO LEDGER TABLE ─────────────────────────────────
// Until the migration is run the cap is inert. That has to mean "the app keeps
// working", not "every request fails", because the alternative is an estimator
// mid-bid refused by a limit that cannot find its own table.
describe('before the migration has been run', () => {
  it('serves the request and warns to the server log', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const hits = { providers: [] };
    vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
      const u = String(url);
      if (u.includes('/auth/v1/user')) {
        return { ok: true, status: 200, json: async () => ({ id: USER_ID }) };
      }
      if (u.includes('/rest/v1/api_usage')) {
        // What PostgREST actually answers for a table that is not there.
        return { ok: false, status: 404, json: async () => ({ message: 'relation "public.api_usage" does not exist' }) };
      }
      if (u.includes('anthropic.com')) {
        hits.providers.push('anthropic');
        return { ok: true, status: 200, json: async () => ({ content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 5, output_tokens: 1 } }) };
      }
      throw new Error('unexpected fetch to ' + u);
    }));
    vi.resetModules();
    const mod = await import('./claude.js');
    const handler = mod.default || mod;
    const res = fakeRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer live-token' }, body: await bodyFor('claude') }, res);

    expect(res.out.code).toBe(200);
    expect(hits.providers).toEqual(['anthropic']);
    // The warning is the only thing that will ever tell anybody the cap is
    // off, so it names the file to run.
    const said = warn.mock.calls.map(c => c.join(' ')).join('\n');
    expect(said).toMatch(/SPEND CAP IS NOT ACTIVE/);
    expect(said).toMatch(/supabase\/schema\.sql/);
  });
});

// ── THE LIST STAYS HONEST ───────────────────────────────────────────────────
describe('every endpoint that can spend money is in the list above', () => {
  it('is exactly the handlers that call a provider', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const files = readdirSync(new URL('.', import.meta.url))
      .filter(f => f.endsWith('.js') && !f.endsWith('.test.js'));
    const spenders = files.filter(f => {
      const src = readFileSync(new URL(f, import.meta.url), 'utf8');
      const isHandler = /function handler\s*\(\s*req\s*,\s*res\s*\)/.test(src);
      return isHandler && /api\.anthropic\.com|openrouter\.ai/.test(src);
    }).map(f => f.replace(/\.js$/, ''));
    // parse-doc is deliberately absent: it extracts text locally and calls no
    // provider, so metering it against an AI budget would refuse a free
    // operation to somebody who had merely run out of analysis.
    expect(spenders.sort()).toEqual([...SPENDING_ENDPOINTS].sort());
  });
});
