import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolveFile, missingFileNote } from './fileResolve.js';

// ── "File not found — please re-upload" ──────────────────────────────────────
// Analyze looked for the File object in a React ref, and a ref does not
// survive a reload. Upload a plan set, get called away, come back to a
// reloaded tab, press Analyze — every sheet reports itself missing. The blobs
// were on the device the whole time, put there at upload.

const META = { id: 'u1', name: 'M0.1.pdf', type: 'pdf' };
const bytes = () => new Blob(['%PDF-1.4 ...'], { type: 'application/pdf' });

describe('finding the file', () => {
  it('uses the live one when the session still has it', async () => {
    const live = new File(['x'], 'M0.1.pdf');
    let asked = false;
    const got = await resolveFile(META, live, async () => { asked = true; return bytes(); });
    expect(got).toBe(live);
    expect(asked, 'went to the cache with the file already in hand').toBe(false);
  });

  // ── THE FIX ───────────────────────────────────────────────────────────────
  it('falls back to the device cache after a reload', async () => {
    const got = await resolveFile(META, null, async id => (id === 'u1' ? bytes() : null));
    expect(got).toBeTruthy();
    expect(got.size).toBeGreaterThan(0);
  });

  it('gives it back the name the analyzers read', async () => {
    // A Blob has no .name. Handing one to a vision prompt loses the sheet
    // number the flags are keyed on.
    const got = await resolveFile(META, null, async () => bytes());
    expect(got.name).toBe('M0.1.pdf');
    expect(got.type).toBe('application/pdf');
  });

  it('keeps a File the cache already handed back as-is', async () => {
    const cached = new File(['x'], 'M0.1.pdf', { type: 'application/pdf' });
    expect(await resolveFile(META, null, async () => cached)).toBe(cached);
  });
});

describe('when it really is gone', () => {
  it('reports nothing rather than an empty file', async () => {
    // An empty File would analyze to nothing and read as a blank drawing.
    expect(await resolveFile(META, null, async () => null)).toBeNull();
  });

  it('survives a cache that throws, without taking the batch down', async () => {
    // One unreadable file out of twenty should cost that file, not the run.
    expect(await resolveFile(META, null, async () => { throw new Error('QuotaExceeded'); })).toBeNull();
  });

  it('asks nothing for the pasted-text entry, which has no file', async () => {
    let asked = false;
    const got = await resolveFile({ id: 'PASTED', type: 'pastedText' }, null, async () => { asked = true; });
    expect(got).toBeNull();
    expect(asked).toBe(false);
  });

  it('survives no loader at all', async () => {
    expect(await resolveFile(META, null, undefined)).toBeNull();
    expect(await resolveFile(null, null, async () => bytes())).toBeNull();
  });
});

// ── AND THE MESSAGE BLAMED THE WRONG THING ───────────────────────────────────
describe('what it says when the file is gone', () => {
  it('does not tell somebody their upload failed', () => {
    // After a reload the upload was fine. "Please re-upload" reads as "that
    // did not work", and sends an estimator hunting for a problem with the
    // file instead of understanding where drawings live.
    const note = missingFileNote('M0.1.pdf');
    expect(note).toMatch(/not on this device any more/);
    expect(note).toMatch(/held on the device, not in the saved job/);
  });
});

// ── BOTH CALLERS HAVE TO ASK ─────────────────────────────────────────────────
// The per-file loop reported "File not found — please re-upload". The grouped
// HVAC read had the SAME hole and failed worse: it filtered the group down to
// nothing, so the combined read silently did not happen and each screenshot
// went through the per-file loop, which ADDS the counts where two shots of one
// sheet overlap. A missing file announces itself; that one hands back a
// takeoff that is quietly too big.
describe('the Setup step asks the cache on both paths', () => {
  const src = readFileSync(new URL('../steps/Step1_Setup.jsx', import.meta.url), 'utf8');

  it('resolves through the cache rather than reading the ref directly', () => {
    expect((src.match(/resolveFile\(/g) || []).length)
      .toBeGreaterThanOrEqual(2);
    expect(src).toMatch(/loadCachedFile/);
  });

  it('no longer filters the HVAC group straight off the ref', () => {
    expect(src, 'the grouped read is back to ref-only and will silently split after a reload')
      .not.toMatch(/\.map\(f => \(\{ meta: f, file: fileObjects\.current\[f\.id\] \}\)\)/);
  });

  it('puts what it found back in the ref, so a second pass stays off the disk', () => {
    expect((src.match(/if \(file && !fileObjects\.current\[[^\]]+\]\) fileObjects\.current\[[^\]]+\] = file;/g) || []).length)
      .toBeGreaterThanOrEqual(1);
  });

  it('stopped blaming the upload', () => {
    expect(src).toMatch(/missingFileNote\(fileMeta\.name\)/);
    expect(src).not.toMatch(/File not found — please re-upload/);
  });
});
