import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { privacySections, termsSections } from './legalText.js';

// ── THE POLICY HAS TO BE TRUE OF THE CODE ────────────────────────────────────
// A privacy policy is the one document in this repo that can be wrong without
// anything failing. Nothing throws, no test goes red, no bid comes out short —
// it just quietly says something about the software that is not so, to people
// who are handing over somebody else's confidential drawings on the strength
// of it.
//
// Two real examples found by writing this file. The policy named Stripe as a
// processor and described receiving the last four digits of a card; there is
// no Stripe integration anywhere in the app. The terms went further and
// promised "paid plans are billed in advance through Stripe on a recurring
// basis and RENEW AUTOMATICALLY until cancelled" — a contractor reading that
// would believe he was signing up for auto-renewing billing that does not
// exist.
//
// Neither was a lie anybody told. Both were written for the app as it is meant
// to become. That is exactly how a legal document drifts, and it is why the
// check has to be mechanical.

const ROOT = new URL('../../', import.meta.url).pathname;
const SKIP = new Set(['node_modules', 'dist', '.git', 'docs']);

function sourceFiles(dir = ROOT, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    // Test files are excluded: a test that NAMES a processor in order to guard
    // against it would otherwise read as the app integrating one.
    else if (/\.(jsx?|mjs|cjs)$/.test(p) && !/\.test\.jsx?$/.test(p)
      && !p.includes('legalText') && !p.includes('legalTruth')) {
      out.push({ path: p, text: readFileSync(p, 'utf8') });
    }
  }
  return out;
}

const files = sourceFiles();
const codeMentions = needle => files.filter(f => new RegExp(needle, 'i').test(f.text));

const privacyText = () => privacySections({}).map(([h, b]) => `${h} ${b}`).join('\n');
const termsText = () => termsSections({}).map(([h, b]) => `${h} ${b}`).join('\n');
const bothText = () => `${privacyText()}\n${termsText()}`;

describe('the documents name no processor the app does not use', () => {
  // Each pair: the name as it would appear in the policy, and the string that
  // would appear in code if it were genuinely integrated.
  const PROCESSORS = [
    ['Stripe', 'stripe'],
    ['Google Analytics', 'google-analytics|gtag\\('],
    ['Segment', 'segment\\.com|analytics\\.track'],
    ['Sentry', '@sentry/'],
    ['Mixpanel', 'mixpanel'],
    ['PostHog', 'posthog'],
  ];

  it.each(PROCESSORS)('does not claim to use %s unless the code does', (name, codeNeedle) => {
    const claimed = new RegExp(`\\b${name}\\b`, 'i').test(bothText());
    const used = codeMentions(codeNeedle).length > 0;
    if (claimed && !used) {
      throw new Error(
        `The legal documents name "${name}" as a service provider, but nothing in the codebase integrates it. `
        + 'Either wire it up or take it out of the policy — telling users their data goes to a processor that '
        + 'does not exist is false, and it is the kind of false that makes a reader doubt the rest of the page.',
      );
    }
    expect(true).toBe(true);
  });
});

describe('the documents name every processor the app DOES use', () => {
  // The dangerous direction. A processor in the code and not in the policy is
  // an undisclosed recipient of customer drawings.
  const REQUIRED = [
    ['Anthropic', 'api\\.anthropic\\.com'],
    ['OpenRouter', 'openrouter\\.ai'],
    ['Supabase', 'supabase'],
    ['Vercel', 'vercel'],
  ];

  it.each(REQUIRED)('discloses %s, which the code calls', (name, codeNeedle) => {
    if (!codeMentions(codeNeedle).length) return; // not integrated; nothing to disclose
    expect(bothText(), `${name} is called by the code but never named in the policy`)
      .toMatch(new RegExp(`\\b${name}\\b`, 'i'));
  });
});

describe('what the policy promises about AI training', () => {
  it('claims no training, which is only true because the routing says so', () => {
    expect(privacyText()).toMatch(/do not use your uploaded documents or job data to train/i);
  });

  // The claim above was true of US and silent about the route. OpenRouter's
  // default is data_collection "allow" — "providers which store user data
  // non-transiently and may train on it." Saying "we don't train on it" while
  // routing under that default is a true sentence that leaves a false
  // impression, which on this subject is the same thing.
  it('is backed by an explicit opt-out at every OpenRouter call site', () => {
    const callers = files.filter(f => f.text.includes('openrouter.ai/api'));
    expect(callers.length).toBeGreaterThan(0);
    for (const f of callers) {
      expect(f.text, `${f.path} routes without denying data collection`)
        .toMatch(/data_collection:\s*'deny'/);
    }
  });

  it('tells the reader that is what happens, not just that we do not do it ourselves', () => {
    expect(privacyText()).toMatch(/do not retain or train on what is sent/i);
  });

  it('still tells them the decision is theirs', () => {
    // The app cannot make a promise on a contractor's behalf to an owner or
    // engineer who never agreed to any of this.
    expect(privacyText()).toMatch(/not permitted to disclose/i);
    expect(privacyText()).toMatch(/a promise you made to them/i);
  });
});

describe('what the documents say about money', () => {
  it('does not describe billing while the app takes no payments', () => {
    if (codeMentions('stripe').length) return; // a payment processor exists; skip
    expect(termsText()).not.toMatch(/RENEW AUTOMATICALLY/);
    expect(termsText()).not.toMatch(/billed in advance/i);
    expect(privacyText()).not.toMatch(/last four digits/i);
  });

  // ── THE MISS THIS TEST DID NOT CATCH ──────────────────────────────────────
  // The checks above were written from the phrases I happened to remember —
  // "RENEW AUTOMATICALLY", "billed in advance", "last four digits" — and all
  // three passed while THREE other sentences still described a paying customer
  // base that does not exist:
  //
  //   "to process subscriptions and prevent fraud"        (how we use your data)
  //   "notified to active subscribers by email"           (changes to this policy)
  //   "for active subscribers, notified by email"         (changes to these Terms)
  //
  // Found by the owner reading the rendered page, which is the one review
  // method none of this replaces.
  //
  // The last two were worse than untidy. A promise to notify "active
  // subscribers" of a material privacy change is a promise owed to nobody
  // while nobody subscribes — so every beta tester was told, in writing, that
  // the terms of what happens to their drawings could change without them
  // hearing about it.
  //
  // So the rule is not a list of phrases now. It is: while no payment
  // processor exists, these documents may not address a SUBSCRIBER, because
  // there is no such person. "Subscription" is still allowed — the sentence
  // saying one will never start by itself is worth keeping and says the
  // opposite thing.
  it('addresses no subscriber, because there are none', () => {
    if (codeMentions('stripe').length) return;
    expect(bothText(), 'the documents address a class of user that does not exist')
      .not.toMatch(/subscriber/i);
  });

  it('owes its change notices to everyone with an account', () => {
    if (codeMentions('stripe').length) return;
    // The commitment has to reach the people actually using it.
    expect(privacyText()).toMatch(/emailed to everyone with an account/i);
    expect(termsText()).toMatch(/emailed to\s+'?\s*\+?\s*'?everyone with an account|emailed to everyone with an account/i);
  });

  it('lists no billing purpose among the reasons it holds data', () => {
    if (codeMentions('stripe').length) return;
    expect(privacyText()).not.toMatch(/process subscriptions/i);
  });

  it('says plainly that it is free and nothing renews', () => {
    if (codeMentions('stripe').length) return;
    expect(termsText()).toMatch(/free while it is in testing/i);
    expect(termsText()).toMatch(/nothing renews/i);
    expect(privacyText()).toMatch(/WE TAKE NO PAYMENT DETAILS/);
  });
});

describe('what the policy says about where things are stored', () => {
  it('discloses that documents go to storage, not just the database', () => {
    if (!files.some(f => f.text.includes("storage.from("))) return;
    expect(privacyText()).toMatch(/document storage|storage/i);
  });

  it('warns that local storage can lose a job', () => {
    expect(privacyText()).toMatch(/local storage/i);
    expect(privacyText()).toMatch(/clearing site data|private window/i);
  });
});
