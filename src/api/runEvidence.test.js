import { describe, it, expect } from 'vitest';
import { isPlaceholder, cleanSize, cleanService, hasEvidence, missingSizeNote } from './runEvidence.js';

// "Ductwork — unspecified duct (unknown)" reached a live parts table looking
// like a material line. It came from the model writing the WORD "unspecified"
// into the size field, which walked straight past the empty-size guard.

describe('isPlaceholder', () => {
  it('recognises the ways a model says "I could not read this"', () => {
    ['unspecified', 'Unknown', 'N/A', 'n/a', 'TBD', 'various', 'none', '-', '--', '?', 'illegible', 'not specified']
      .forEach(v => expect(isPlaceholder(v), v).toBe(true));
  });

  it('never mistakes a real size for filler', () => {
    ['24x12', '6"', '3/4"', '12"ø', '40'].forEach(v => expect(isPlaceholder(v), v).toBe(false));
  });
});

describe('cleanSize / cleanService', () => {
  it('turns filler into an empty field so the guard can see it', () => {
    expect(cleanSize('unspecified')).toBe('');
    expect(cleanService('unknown')).toBe('');
    expect(cleanSize('  24x12 ')).toBe('24x12');
    expect(cleanService('exhaust air')).toBe('exhaust air');
  });
});

describe('hasEvidence — was a run actually seen?', () => {
  it('counts measured footage as the strongest signal', () => {
    expect(hasEvidence({ estLengthFt: 20 })).toBe(true);
  });

  it('counts a service, a note or a shape', () => {
    expect(hasEvidence({ service: 'exhaust air' })).toBe(true);
    expect(hasEvidence({ notes: 'main trunk above ceiling' })).toBe(true);
    expect(hasEvidence({ shape: 'round' })).toBe(true);
  });

  it('does not count filler as evidence', () => {
    expect(hasEvidence({ service: 'unknown' })).toBe(false);
  });

  it('rejects an entirely empty row — that is a schema artifact, not a run', () => {
    expect(hasEvidence({})).toBe(false);
    expect(hasEvidence({ estLengthFt: 0, service: '', notes: '', shape: '' })).toBe(false);
  });
});

describe('missingSizeNote — say what is needed, not "unspecified"', () => {
  it('leads with the footage it DID measure', () => {
    const n = missingSizeNote({ estLengthFt: 20, lengthBasis: 'calibrated scale bar' }, 'duct');
    expect(n).toMatch(/~20 LF was measured against calibrated scale bar/);
    expect(n).toMatch(/enter W x H/);
  });

  it('asks for a pipe size on a pipe run', () => {
    expect(missingSizeNote({ estLengthFt: 15 }, 'pipe')).toMatch(/enter the pipe size/);
  });

  it('says so when neither size nor length could be read', () => {
    expect(missingSizeNote({}, 'duct')).toMatch(/neither its size nor its length/);
  });
});
