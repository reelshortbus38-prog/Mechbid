import { describe, it, expect } from 'vitest';
import bpr from './bprFormat.js';

const { formatFromSignals } = bpr;

describe('store 701, the case that was broken', () => {
  // FL_0701_WR_BPR1.xlsx has four sheets: "Remote Hdr 1 (1173)",
  // "Remote Hdr 2 (1155)", "Rack A " and "RACK D". Both signals fire.
  const SEVEN_OH_ONE = { remoteHdrSheet: true, bprText: true, kysorText: true };

  it('routes a W&R BPR to the BPR parser even though it has Rack sheets', () => {
    // The old rule was `isBPR && !isKysor`, which was false here — so a real
    // BPR went to the Kysor parser and produced no circuits at all.
    expect(formatFromSignals(SEVEN_OH_ONE)).toBe('bpr');
  });

  it('the Rack sheets alone must not be able to veto it', () => {
    expect(formatFromSignals({ remoteHdrSheet: true, kysorText: true })).toBe('bpr');
  });
});

describe('the signals in priority order', () => {
  it('a Remote Hdr sheet name is decisive', () => {
    expect(formatFromSignals({ remoteHdrSheet: true })).toBe('bpr');
    expect(formatFromSignals({ remoteHdrSheet: true, hvacText: true })).toBe('bpr');
  });

  it('a genuine Kysor workbook still routes to Kysor', () => {
    // No sheet is named "Remote Hdr", so nothing overrides it.
    expect(formatFromSignals({ bprText: true, kysorText: true })).toBe('kysor');
    expect(formatFromSignals({ kysorText: true })).toBe('kysor');
  });

  it('BPR wording with no rack sheets is still a BPR', () => {
    expect(formatFromSignals({ bprText: true })).toBe('bpr');
  });

  it('HVAC only wins when no refrigeration signal fired', () => {
    expect(formatFromSignals({ hvacText: true })).toBe('hvac');
    expect(formatFromSignals({ kysorText: true, hvacText: true })).toBe('kysor');
  });

  it('nothing recognised is unknown, not a guess', () => {
    expect(formatFromSignals({})).toBe('unknown');
    expect(formatFromSignals()).toBe('unknown');
  });
});
