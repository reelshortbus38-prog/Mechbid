import { describe, it, expect } from 'vitest';
import {
  LEGAL_FIELDS, LEGAL_PLACEHOLDERS, legalGaps, legalReady,
  termsSections, privacySections, LAST_UPDATED,
} from './legalText.js';

const FILLED = {
  legal_company: 'Acme Refrigeration LLC',
  legal_state: 'Virginia',
  legal_contact: 'support@acmerefrig.com',
  legal_address: '123 Main St, Lynchburg VA 24501',
};
const text = sections => sections.map(([, body]) => body).join(' ');

describe('the four facts only the operator knows', () => {
  it('reports every one that is still blank', () => {
    // Entity and governing law now ship as code defaults (see LEGAL_DEFAULTS),
    // so only the two that genuinely have no value are gaps.
    // All four operator details now ship as code defaults, so nothing is
    // outstanding and the ⚠ on the Terms · Privacy link clears.
    expect(legalGaps({})).toEqual([]);
    expect(legalReady({})).toBe(true);
  });

  it('is ready once all four are filled', () => {
    expect(legalGaps(FILLED)).toEqual([]);
    expect(legalReady(FILLED)).toBe(true);
  });

  it('a whitespace-only profile value falls back to the default, not a blank', () => {
    // A space is not an address. With a default behind it, the document still
    // reads correctly rather than printing nothing.
    expect(legalGaps({ ...FILLED, legal_address: '   ' })).toEqual([]);
    expect(text(privacySections({ legal_address: '   ' }))).toContain('Lexington');
  });

  it('every field has a label and a reason it is needed', () => {
    for (const f of LEGAL_FIELDS) {
      expect(f.label).toBeTruthy();
      expect(f.why).toBeTruthy();
      expect(LEGAL_PLACEHOLDERS[f.k]).toBeTruthy();
    }
  });

  it('substitutes them everywhere once given', () => {
    const all = text(termsSections(FILLED)) + text(privacySections(FILLED));
    expect(all).toMatch(/Acme Refrigeration LLC/);
    expect(all).toMatch(/State of Virginia/);
    expect(all).toMatch(/support@acmerefrig\.com/);
    for (const p of Object.values(LEGAL_PLACEHOLDERS)) expect(all).not.toContain(p);
  });

  it('the SHIPPED documents contain no bracketed placeholder anywhere', () => {
    // The invariant that actually matters now. A published policy reading
    // "[mailing address]" says nobody read it before putting it live.
    const all = text(termsSections({})) + ' ' + text(privacySections({}));
    for (const ph of Object.values(LEGAL_PLACEHOLDERS)) {
      expect(all).not.toContain(ph);
    }
    expect(all).not.toMatch(/\[[^\]]{3,40}\]/);
  });
});

describe('terms cover what a paid SaaS actually needs', () => {
  const t = text(termsSections(FILLED));
  const heads = termsSections(FILLED).map(([h]) => h).join(' | ');

  it('says plainly it is an estimating aid and not professional advice', () => {
    expect(t).toMatch(/not a replacement for one/i);
    expect(t).toMatch(/does not provide engineering, design, or professional advice/i);
  });

  it('puts verification of every figure on the user', () => {
    expect(t).toMatch(/final construction documents/i);
    expect(t).toMatch(/Bids you submit are yours/i);
  });

  it('discloses auto-renewal, cancellation and refunds — what Stripe requires', () => {
    expect(t).toMatch(/RENEW AUTOMATICALLY/);
    expect(t).toMatch(/cancel at any time/i);
    expect(t).toMatch(/non-refundable/i);
    expect(t).toMatch(/30 days’ notice/);
  });

  it('caps liability at fees paid, which is the clause that matters here', () => {
    expect(t).toMatch(/TOTAL LIABILITY .* LIMITED TO THE AMOUNT YOU PAID/s);
    expect(t).toMatch(/LOST BIDS|UNDERBID/);
  });

  it('warns about uploading documents that belong to someone else', () => {
    expect(t).toMatch(/right to upload/i);
    expect(t).toMatch(/confidentiality/i);
  });

  it('states the user keeps ownership and that we do not train on their data', () => {
    expect(t).toMatch(/keep all ownership/i);
    expect(t).toMatch(/do not use your bid documents or pricing to train/i);
  });

  it('names a governing law and a venue', () => {
    expect(t).toMatch(/governed by the laws of the State of Virginia/);
    expect(t).toMatch(/exclusive jurisdiction/);
  });

  it('carries the sections a reader expects to find', () => {
    for (const h of ['Acceptable use', 'Termination', 'Limitation of liability', 'Indemnity', 'Governing law']) {
      expect(heads).toMatch(new RegExp(h, 'i'));
    }
  });
});

describe('privacy covers what this app actually does', () => {
  const p = text(privacySections(FILLED));

  it('leads with the disclosure that matters — documents go to AI providers', () => {
    expect(p).toMatch(/transmitted to third-party AI providers/i);
    expect(p).toMatch(/Anthropic/);
    expect(p).toMatch(/OpenRouter/);
  });

  it('names every sub-processor, not just the AI ones', () => {
    for (const name of ['Vercel', 'Supabase', 'Stripe']) expect(p).toMatch(new RegExp(name));
  });

  it('is honest that job data lives in browser storage and can be lost', () => {
    expect(p).toMatch(/local storage/i);
    expect(p).toMatch(/private window|clearing site data/i);
  });

  it('states plainly what is NOT done with the data', () => {
    expect(p).toMatch(/do not sell or rent/i);
    expect(p).toMatch(/do not use your uploaded documents or job data to train/i);
    expect(p).toMatch(/do not use your data to bid against you/i);
  });

  it('gives a retention period and a deletion route', () => {
    expect(p).toMatch(/within 30 days/i);
    expect(p).toMatch(/delete your account/i);
  });

  it('does not claim perfect security', () => {
    expect(p).toMatch(/No service can promise perfect security/i);
    expect(p).toMatch(/without undue delay/i);
  });

  it('never says the full card number is stored', () => {
    expect(p).toMatch(/never the full number/i);
  });
});

describe('housekeeping', () => {
  it('carries a last-updated date, which a policy without one cannot be trusted on', () => {
    expect(LAST_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('every section has a heading and a body of real length', () => {
    for (const sections of [termsSections(FILLED), privacySections(FILLED)]) {
      for (const [head, body] of sections) {
        expect(head.length).toBeGreaterThan(3);
        expect(body.length).toBeGreaterThan(40);
      }
    }
  });
});

// ── OPERATOR DETAILS ─────────────────────────────────────────────────────────
// The entity operating this service is the same for every user, so it lives in
// code rather than in a per-user profile field nobody would fill in.
describe('the operator is baked in', () => {
  it('the documents name the real entity with no profile set', () => {
    const terms = termsSections({}).map(([, body]) => body).join(' ');
    expect(terms).toContain('Coldgauge LLC');
    expect(terms).not.toContain('[Legal entity name');
  });

  it('governing law is Virginia with no profile set', () => {
    const terms = termsSections({}).map(([h, body]) => h + ' ' + body).join(' ');
    expect(terms).toContain('Virginia');
    expect(terms).not.toContain('[State]');
  });

  it('the privacy policy names the entity too', () => {
    const priv = privacySections({}).map(([, body]) => body).join(' ');
    expect(priv).toContain('Coldgauge LLC');
  });

  it('a profile value still overrides, for a self-hosted install', () => {
    const terms = termsSections({ legal_company: 'Acme Refrigeration LLC' })
      .map(([, body]) => body).join(' ');
    expect(terms).toContain('Acme Refrigeration LLC');
    expect(terms).not.toContain('Coldgauge LLC');
  });

  it('entity and state no longer count as gaps', () => {
    expect(legalGaps({})).not.toContain('company');
    expect(legalGaps({})).not.toContain('state');
  });

  it('the contact address is the live forwarding address', () => {
    const terms = termsSections({}).map(([, b]) => b).join(' ');
    expect(terms).toContain('support@coldgauge.com');
  });

  it('the mailing address is published in both documents', () => {
    const all = termsSections({}).map(([, b]) => b).join(' ')
      + ' ' + privacySections({}).map(([, b]) => b).join(' ');
    expect(all).toContain('Lexington, VA 24450');
  });

  it('the gap warning is gone — nothing is outstanding', () => {
    expect(legalGaps({})).toEqual([]);
    expect(legalReady({})).toBe(true);
  });

  it('an operator can still override every one of them', () => {
    const p = {
      legal_company: 'Acme LLC', legal_state: 'Texas',
      legal_contact: 'a@b.com', legal_address: '9 Elm St, Austin, TX 78701',
    };
    const all = text(termsSections(p)) + ' ' + text(privacySections(p));
    expect(all).toContain('Acme LLC');
    expect(all).toContain('Texas');
    expect(all).not.toContain('Coldgauge LLC');
    expect(all).not.toContain('Lexington');
  });
});
