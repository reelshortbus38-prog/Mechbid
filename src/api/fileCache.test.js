import { describe, it, expect, beforeEach } from 'vitest';
import {
  fileIdFor, evictionPlan, rememberFile, hasCachedFile, loadCachedFile,
  forgetFiles, clearFileCache, cacheUsage, _seedIndex, MAX_CACHE_BYTES,
  setCloudFiles, cloudFilesReady, cachedEntries, hydrateFileCache,
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

// ── THE CLOUD FALLBACK ──────────────────────────────────────────────────────
// A phone opening a job that was built on the iPad has the manifest (it rides
// inside the job) and none of the bytes. This is the path it takes.
describe('when a cloud mover is registered', () => {
  const blobFor = name => ({ name, size: 42 });

  it('fetches a file this device has never held', async () => {
    setCloudFiles({ download: async id => (id === 'u1' ? blobFor('M0.1.pdf') : null) });
    expect(await loadCachedFile('u1')).toMatchObject({ name: 'M0.1.pdf' });
  });

  it('keeps what it fetched, so the second look is not another download', async () => {
    let downloads = 0;
    setCloudFiles({ download: async () => { downloads++; return blobFor('a.pdf'); } });
    await loadCachedFile('u1');
    await loadCachedFile('u1');
    expect(downloads).toBe(1);
  });

  it('prefers the device copy and does not go to the network at all', async () => {
    let downloads = 0;
    setCloudFiles({ download: async () => { downloads++; return blobFor('cloud.pdf'); } });
    rememberFile('u1', fakeFile('local.pdf'));
    expect(await loadCachedFile('u1')).toMatchObject({ name: 'local.pdf' });
    expect(downloads).toBe(0);
  });

  it('is null when the account does not have it either', async () => {
    setCloudFiles({ download: async () => null });
    expect(await loadCachedFile('missing')).toBe(null);
  });

  it('is null rather than throwing when the fetch fails', async () => {
    setCloudFiles({ download: async () => { throw new Error('offline'); } });
    expect(await loadCachedFile('u1')).toBe(null);
  });

  it('sends an upload behind the local write', async () => {
    const sent = [];
    setCloudFiles({ download: async () => null, upload: async (id, f) => { sent.push([id, f.name]); } });
    rememberFile('u1', fakeFile('M0.1.pdf'));
    await Promise.resolve();
    expect(sent).toEqual([['u1', 'M0.1.pdf']]);
  });

  it('an upload that fails does not break the local copy', async () => {
    setCloudFiles({ download: async () => null, upload: async () => { throw new Error('quota'); } });
    rememberFile('u1', fakeFile('M0.1.pdf'));
    await Promise.resolve();
    expect(hasCachedFile('u1')).toBe(true);
    expect(await loadCachedFile('u1')).toMatchObject({ name: 'M0.1.pdf' });
  });

  it('says whether fetching is even possible', () => {
    expect(cloudFilesReady()).toBe(false);
    setCloudFiles({ download: async () => null });
    expect(cloudFilesReady()).toBe(true);
  });

  it('signing out stops it reaching for files', async () => {
    // The next person at this device is not necessarily the last.
    setCloudFiles({ download: async () => blobFor('x.pdf') });
    setCloudFiles(null);
    expect(cloudFilesReady()).toBe(false);
    expect(await loadCachedFile('u1')).toBe(null);
  });
});

// ── WHAT THIS DEVICE IS HOLDING ─────────────────────────────────────────────
// The catch-up pass subtracts the bucket's contents from this to find drawings
// that never made it up — uploaded before signing in, or with no signal.
describe('cachedEntries', () => {
  it('lists what is on disk', () => {
    _seedIndex('a', { name: 'a.pdf', size: 100, savedAt: 1 });
    expect(cachedEntries()).toEqual([['a', { name: 'a.pdf', size: 100, savedAt: 1 }]]);
  });

  it('includes files uploaded this session — the pre-sign-in case', () => {
    // Drag the set in, price the job, sign in afterwards. Those files are in
    // the session map and nowhere else, and they are exactly the ones the
    // cloud has never seen.
    rememberFile('u1', fakeFile('M0.1.pdf', 2048));
    const byId = Object.fromEntries(cachedEntries());
    expect(byId.u1).toMatchObject({ name: 'M0.1.pdf', size: 2048 });
  });

  it('does not list a file twice when it is in both', () => {
    _seedIndex('u1', { name: 'M0.1.pdf', size: 2048, savedAt: 5 });
    rememberFile('u1', fakeFile('M0.1.pdf', 2048));
    expect(cachedEntries().filter(([id]) => id === 'u1').length).toBe(1);
  });

  it('is empty rather than broken with nothing stored', () => {
    expect(cachedEntries()).toEqual([]);
  });
});

// ── HYDRATION IS AWAITED, NOT RACED ─────────────────────────────────────────
describe('hydrateFileCache', () => {
  it('hands the same work to a second caller instead of an instant zero', async () => {
    // The catch-up pass mounts in the same tick as hydration. A bare `if
    // (hydrated) return index.size` handed it 0 and it concluded the device
    // was holding nothing — then never looked again.
    const first = hydrateFileCache();
    const second = hydrateFileCache();
    expect(await second).toBe(await first);
  });
});
