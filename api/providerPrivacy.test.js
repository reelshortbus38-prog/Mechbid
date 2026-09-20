import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── NO CUSTOMER DOCUMENT LEAVES ON A DEFAULT ROUTE ───────────────────────────
// OpenRouter's default for `data_collection` is "allow", which its own docs
// define as "allow providers which store user data non-transiently and may
// train on it."
//
// What travels on these calls is the contents of a customer's construction
// drawings. The privacy policy tells contractors "we do not use your uploaded
// documents or job data to train AI models", and a reader takes that to mean
// nobody does.
//
// This is a SOURCE-LEVEL guard rather than a behavioural one on purpose. The
// failure it prevents is somebody adding a fourth OpenRouter call site next
// year and not knowing this rule exists — and that call would work perfectly,
// return good data, and pass every other test in this repo while quietly
// routing a plan set to a provider that may train on it. Nothing observable
// goes wrong. The only place to catch it is the source.

const API_DIR = dirname(fileURLToPath(import.meta.url));
const OR_URL = 'openrouter.ai/api';

const sources = readdirSync(API_DIR)
  .filter(f => f.endsWith('.js') && !f.endsWith('.test.js'))
  .map(f => ({ name: f, text: readFileSync(join(API_DIR, f), 'utf8') }));

const callers = sources.filter(f => f.text.includes(OR_URL));

describe('every OpenRouter call opts out of data collection', () => {
  it('finds the call sites at all — a guard over nothing is not a guard', () => {
    expect(callers.length).toBeGreaterThan(0);
  });

  it.each(callers.map(f => f.name))('%s sends a provider policy', name => {
    const { text } = callers.find(f => f.name === name);
    expect(text, `${name} calls OpenRouter without a provider policy`).toMatch(/provider:\s*OR_PRIVACY/);
  });

  it.each(callers.map(f => f.name))('%s denies data collection and demands zero retention', name => {
    const { text } = callers.find(f => f.name === name);
    const m = /const OR_PRIVACY = \{([^}]*)\}/.exec(text);
    expect(m, `${name} has no OR_PRIVACY definition`).toBeTruthy();
    expect(m[1]).toMatch(/data_collection:\s*'deny'/);
    expect(m[1]).toMatch(/zdr:\s*true/);
  });

  // The values are the whole point. 'allow' is OpenRouter's default and the
  // thing this exists to prevent.
  it.each(callers.map(f => f.name))('%s never asks for allow', name => {
    const { text } = callers.find(f => f.name === name);
    expect(text).not.toMatch(/data_collection:\s*'allow'/);
  });

  it('says why, in the file, so the next person does not undo it', () => {
    // Comment markers and hard wrapping sit between the words, so the prose is
    // flattened before matching. A guard that only fires on one line width is
    // a guard that fires on reformatting instead of on the thing it is for.
    const prose = t => t.replace(/^\s*\/\/ ?/gm, '').replace(/\s+/g, ' ');
    for (const { name, text } of callers) {
      expect(prose(text), `${name} has no explanation`).toMatch(/may train on it/i);
      expect(prose(text), `${name} does not say what is at stake`).toMatch(/construction drawings/i);
    }
  });
});

// The Anthropic API does not train on API traffic, and these calls are direct
// rather than brokered, so there is no equivalent routing knob. Recorded so the
// asymmetry reads as deliberate rather than as an oversight.
describe('the direct Anthropic calls', () => {
  it('go to Anthropic and not through a broker', () => {
    const direct = sources.filter(f => f.text.includes('api.anthropic.com'));
    expect(direct.length).toBeGreaterThan(0);
    for (const f of direct) {
      expect(f.text).toContain('https://api.anthropic.com/v1/messages');
    }
  });
});
