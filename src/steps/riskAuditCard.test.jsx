import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RiskAuditCard } from './Step6_Proposal.jsx';
import { DEFAULT_PROPOSAL_TERMS } from '../components/proposalTerms.js';

// riskAudit.test.js covers the detection. This is the card: that it renders at
// all, that it shows the EVIDENCE rather than only a verdict, and that it stays
// silent on a job with nothing to report.
//
// The flags below are the shape a real job carries — scope lines and plan notes
// the analyzers already pulled out of the documents — including the two that
// must not raise anything.
const FLAGS = [
  { type: 'warn', text: 'All work on the sales floor shall be performed after store closing.', source: 'SOW.pdf' },
  { type: 'warn', text: 'The store will remain open to customers throughout construction.', source: 'SOW.pdf' },
  { type: 'info', text: 'Work shall be completed in three phases per the phasing plan on M0.1.', source: 'Spec 23 00 00.pdf' },
  { type: 'info', text: 'Refrigerant piping shall be K65 copper-iron alloy for the CO2 booster rack.', source: 'Spec 23 00 00.pdf' },
  { type: 'info', text: 'System shall hold a 24 hour standing pressure test with dry nitrogen.', source: 'Spec 23 00 00.pdf' },
  { type: 'info', text: 'Deck height is approximately 24 feet above finished floor.', source: 'M0.1.pdf' },
  // Must produce nothing: an electrical nameplate and a pipe fitting.
  { type: 'info', text: 'Compressor: 208V, 3 phase, 60 Hz.', source: 'Schedule.pdf' },
  { type: 'info', text: 'Provide dielectric union at each connection.', source: 'Spec 23 00 00.pdf' },
];

const html = (flags = FLAGS, terms = DEFAULT_PROPOSAL_TERMS) =>
  renderToStaticMarkup(<RiskAuditCard flags={flags} terms={terms} />);

describe('the risk audit card', () => {
  it('renders the conditions it found', () => {
    const out = html();
    expect(out).toMatch(/Conditions found in the documents/);
    for (const title of [
      'Night or after-hours work', 'Store stays open during the work',
      'Phased or sequenced construction', 'Work above roughly 12 feet',
      'Extended pressure test', 'K65 piping',
    ]) expect(out, title).toContain(title);
  });

  it('shows the sentence, not just the verdict', () => {
    // A label is a claim the estimator has to go and check. The quote is
    // evidence he can read in five seconds and act on or dismiss.
    const out = html();
    expect(out).toContain('All work on the sales floor shall be performed after store closing.');
    expect(out).toContain('SOW.pdf');
  });

  it('says plainly where the bid contradicts itself', () => {
    expect(html()).toMatch(/conditions of bid say this was not included/i);
  });

  it('stops claiming a contradiction once the terms cover it', () => {
    const out = html(FLAGS, ['We price night work, phased work and occupied-store access.']);
    expect(out).not.toMatch(/not included/i);
  });

  it('does not report an electrical nameplate or a pipe fitting', () => {
    const out = html();
    expect(out).not.toContain('Prevailing wage');
    expect(out).not.toContain('208V');
  });

  it('counts what changes the hours', () => {
    expect(html()).toMatch(/4 affect the hours/);
  });

  it('is silent on a job with nothing to report', () => {
    // No card at all, rather than an empty box announcing "no risks found" on
    // every clean bid — which is how a useful warning becomes furniture.
    expect(html([])).toBe('');
    expect(html([{ type: 'info', text: 'Provide 240 feet of copper.', source: 'M1.pdf' }])).toBe('');
  });
});
