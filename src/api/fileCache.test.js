import { describe, it, expect, beforeEach } from 'vitest';
import {
  fileIdFor, evictionPlan, rememberFile, hasCachedFile, loadCachedFile,
  forgetFiles, clearFileCache, cacheUsage, _seedIndex, MAX_CACHE_BYTES,
} from './fileCache.js';

// Node has no IndexedDB, which is the same state as a private window or a
// browser with site data blocked. Everything below therefore exercises the
// degraded path as well as the policy — and the degraded path has to behave
// exactly as this app did before files persisted at all.
beforeEach(() => clearFileCache());

const fakeFile = (name, size = 1000) => ({ name, size, type: 'application/pdf' });

// ── THE COLLISION THIS KEYING EXISTS TO PREVENT ─────────────────────────────
describe('fileIdFor', () => {
  const files = [
    { id: 'u1', name: 'M0.1.pdf' },
    { id: 'u2', name: 'SOW.pdf' },
  ];

  it('finds the upload id for a filename in this job', () => {
    expect(fileIdFor(files, 'M0.1.pdf')).toBe('u1');
    expect(fileIdFor(files, 'SOW.pdf')).toBe('u2');
  });

  it('does not care about case or stray spaces', () => {
    expect(fileIdFor(files, ' m0.1.PDF ')).toBe('u1');
  });

  it('finds nothing for a file this job does not have', () => {
    // The whole point. Another job's M0.1.pdf is in the same database, and
    // going through THIS job's list is what makes it unreachable — showing an
    // estimator a sheet from a different store is worse than showing none,
    // because it looks right.
    expect(fileIdFor(files, 'M2.1.pdf')).toBe('');
    expect(fileIdFor([], 'M0.1.pdf')).toBe('');
    expect(fileIdFor(undefined, 'M0.1.pdf')).toBe('');
  });

  it('is empty rather than broken on junk', () => {
    expect(fileIdFor(files, '')).toBe('');
    expect(fileIdFor(files, null)).toBe('');
    expect(fileIdFor([null, { name: 'x' }], 'x')).toBe('');  // no id on the row
  });
});

// ── THE SESSION LAYER STILL WORKS WITHOUT A DATABASE ────────────────────────
describe('with no IndexedDB — a private window, or node', () => {
  it('still serves a file uploaded this session', async () => {
    rememberFile('u1', fakeFile('M0.1.pdf'));
    expect(hasCachedFile('u1')).toBe(true);
    expect(await loadCachedFile('u1')).toMatchObject({ name: 'M0.1.pdf' });
  });

  it('says no for a file it does not have, rather than guessing', async () => {
    // hasCachedFile decides whether a "view the sheet" button is drawn. A
    // wrong yes is a button that does nothing.
    expect(hasCachedFile('nope')).toBe(false);
    expect(await loadCachedFile('nope')).toBe(null);
  });

  it('ignores an empty id or a missing file', async () => {
    rememberFile('', fakeFile('x.pdf'));
    rememberFile('u9', null);
    expect(hasCachedFile('')).toBe(false);
    expect(hasCachedFile('u9')).toBe(false);
    expect(await loadCachedFile('')).toBe(null);
  });

  it('forgets on request', async () => {
    rememberFile('u1', fakeFile('a.pdf'));
    rememberFile('u2', fakeFile('b.pdf'));
    await forgetFiles(['u1']);
    expect(hasCachedFile('u1')).toBe(false);
    expect(hasCachedFile('u2')).toBe(true);
  });

  it('takes a single id as well as a list', async () => {
    rememberFile('u1', fakeFile('a.pdf'));
    await forgetFiles('u1');
    expect(hasCachedFile('u1')).toBe(false);
  });

  it('does nothing rather than throwing on an empty forget', async () => {
    await expect(forgetFiles([])).resolves.toBeUndefined();
    await expect(forgetFiles(undefined)).resolves.toBeUndefined();
  });
});

// ── THE CEILING ─────────────────────────────────────────────────────────────
// A browser that hits its storage quota starts refusing writes with no warning
// an estimator would ever see. Oldest goes first: the bid being worked now
// matters more than the one from March.
describe('evictionPlan', () => {
  const mb = n => n * 1024 * 1024;
  const entries = [
    ['old', { size: mb(100), savedAt: 1000 }],
    ['mid', { size: mb(100), savedAt: 2000 }],
    ['new', { size: mb(100), savedAt: 3000 }],
  ];

  it('evicts nothing when there is room', () => {
    expect(evictionPlan(entries, mb(500))).toEqual([]);
  });

  it('evicts the oldest first, and only as many as it must', () => {
    expect(evictionPlan(entries, mb(250))).toEqual(['old']);
    expect(evictionPlan(entries, mb(150))).toEqual(['old', 'mid']);
  });

  it('does not keep evicting once it is under the cap', () => {
    const plan = evictionPlan(entries, mb(200));
    expect(plan).toEqual(['old']);
    expect(plan).not.toContain('new');
  });

  it('is empty rather than broken with nothing stored', () => {
    expect(evictionPlan([], mb(10))).toEqual([]);
    expect(evictionPlan(undefined, mb(10))).toEqual([]);
  });

  it('has a ceiling big enough for real plan sets', () => {
    // A set runs 20-50 MB. A cap that fits only one would evict the drawings
    // an estimator is actively working from.
    expect(MAX_CACHE_BYTES).toBeGreaterThanOrEqual(200 * 1024 * 1024);
  });
});

describe('cacheUsage', () => {
  it('adds up what is on disk', () => {
    _seedIndex('a', { name: 'a.pdf', size: 100, savedAt: 1 });
    _seedIndex('b', { name: 'b.pdf', size: 250, savedAt: 2 });
    expect(cacheUsage()).toEqual({ files: 2, bytes: 350 });
  });

  it('is zero rather than broken when nothing is stored', () => {
    expect(cacheUsage()).toEqual({ files: 0, bytes: 0 });
  });
});
