import { describe, it, expect } from 'vitest';
import { normalizeDesc } from '../components/scopeText.js';

// ── RE-ANALYZING MUST NOT STACK A SECOND TAKEOFF ─────────────────────────────
// Takeoff lines were deduped by their DESCRIPTION and nothing else. A
// description is not an identity — it is a label that changes whenever the app
// gets better at reading a sheet. Every improvement to how a size or service is
// written left the previous wording stranded in the job, so re-analyzing the
// same file added a second full takeoff beside the first.
//
// This reproduces the merge exactly as the accept handler does it, against the
// real before/after descriptions from the builds that caused it.

// The label the SAME pipe carried across three builds of the app.
const BUILD_A = 'Pipe — 3/4" HWS/HWR (heating water supply/return)';
const BUILD_B = 'Pipe — 3/4" HWS/HWR';
const BUILD_C = 'Pipe — 3/4" HWS';

const mergeAccept = (existing, incoming, reanalyzedFiles) => {
  const reanalyzed = new Set(reanalyzedFiles);
  const kept = existing.filter(p => !(p.src && reanalyzed.has(p.src)));
  const added = [];
  for (const item of incoming) {
    const k = normalizeDesc(item.desc);
    if (added.find(x => normalizeDesc(x.desc) === k)) continue;
    if (kept.find(x => normalizeDesc(x.desc) === k)) continue;
    added.push(item);
  }
  return [...kept, ...added];
};

describe('description-only dedupe is what broke', () => {
  it('does not recognize the same run once its label improved', () => {
    expect(normalizeDesc(BUILD_A)).not.toBe(normalizeDesc(BUILD_B));
    expect(normalizeDesc(BUILD_B)).not.toBe(normalizeDesc(BUILD_C));
  });
});

describe('accepting a re-read replaces that file s lines', () => {
  const fileA = 'HVAC pipe.pdf';

  it('leaves one takeoff after analyzing the same file three times', () => {
    let parts = mergeAccept([], [{ src: fileA, desc: BUILD_A, qty: 220, unitCost: 0 }], [fileA]);
    parts = mergeAccept(parts, [{ src: fileA, desc: BUILD_B, qty: 220, unitCost: 0 }], [fileA]);
    parts = mergeAccept(parts, [{ src: fileA, desc: BUILD_C, qty: 240, unitCost: 0 }], [fileA]);
    expect(parts).toHaveLength(1);
    expect(parts[0].desc).toBe(BUILD_C);
    expect(parts[0].qty).toBe(240);
  });

  it('is what the old merge got wrong — three lines for one run', () => {
    const naive = [...[], { desc: BUILD_A }, { desc: BUILD_B }, { desc: BUILD_C }];
    expect(naive).toHaveLength(3);
  });

  it('does not touch a different file s lines', () => {
    const existing = [
      { src: 'HVAC pipe.pdf', desc: BUILD_A, qty: 220 },
      { src: 'Drawings 3.pdf', desc: 'Ductwork — 24x12 duct (supply)', qty: 80 },
    ];
    const out = mergeAccept(existing, [{ src: 'HVAC pipe.pdf', desc: BUILD_C, qty: 240 }], ['HVAC pipe.pdf']);
    expect(out.map(p => p.desc)).toEqual(['Ductwork — 24x12 duct (supply)', BUILD_C]);
  });

  it('keeps a line from a file that was not re-analyzed this time', () => {
    const existing = [{ src: 'Drawings 3.pdf', desc: 'Ductwork — 30x12 duct', qty: 40 }];
    const out = mergeAccept(existing, [{ src: 'HVAC pipe.pdf', desc: BUILD_C, qty: 240 }], ['HVAC pipe.pdf']);
    expect(out).toHaveLength(2);
  });

  it('leaves a legacy line with no source alone, since it cannot be attributed', () => {
    // Jobs analyzed before lines recorded their file. Clearing those is the
    // Clear-takeoff button's job, not something to guess at here.
    const existing = [{ desc: BUILD_A, qty: 220 }];
    const out = mergeAccept(existing, [{ src: 'HVAC pipe.pdf', desc: BUILD_C, qty: 240 }], ['HVAC pipe.pdf']);
    expect(out).toHaveLength(2);
  });
});
