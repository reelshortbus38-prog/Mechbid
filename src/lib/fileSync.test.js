import { describe, it, expect } from 'vitest';
import { filePath, uploadFile, downloadFile, removeFiles, listCloudFiles, BUCKET } from './fileSync.js';

// A stand-in for the Supabase client's storage surface. Records what it was
// asked to do, so the PATH — which is what the storage policies match on — can
// be asserted rather than assumed.
function fakeSb(behaviour = {}) {
  const calls = [];
  return {
    calls,
    storage: {
      from(bucket) {
        return {
          upload: async (path, file, opts) => {
            calls.push({ op: 'upload', bucket, path, opts, size: file?.size });
            return behaviour.upload || { error: null };
          },
          download: async path => {
            calls.push({ op: 'download', bucket, path });
            return behaviour.download || { data: { size: 10 }, error: null };
          },
          remove: async paths => {
            calls.push({ op: 'remove', bucket, paths });
            return behaviour.remove || { error: null };
          },
        };
      },
    },
  };
}

const file = { name: 'M0.1.pdf', size: 2048, type: 'application/pdf' };

describe('filePath — the policies match on this', () => {
  it('puts the owner first, because that is what storage checks', () => {
    // Every policy compares (storage.foldername(name))[1] to auth.uid(). If
    // the user id is not the first segment, one account can read another's
    // drawings.
    expect(filePath('user-1', 'up-9')).toBe('user-1/up-9');
  });

  it('uses the upload id, so no filename is involved', () => {
    // Two jobs each with an M0.1.pdf must not collide, and a filename with a
    // slash or a space in it must not shape the path.
    expect(filePath('u', 'abc123')).toBe('u/abc123');
  });

  it('is empty rather than malformed when something is missing', () => {
    expect(filePath('', 'up-9')).toBe('');
    expect(filePath('user-1', '')).toBe('');
    expect(filePath(null, undefined)).toBe('');
  });
});

describe('uploadFile', () => {
  it('writes to the private bucket at the owner-scoped path', async () => {
    const sb = fakeSb();
    const r = await uploadFile(sb, 'user-1', 'up-9', file);
    expect(r.ok).toBe(true);
    expect(sb.calls[0]).toMatchObject({ op: 'upload', bucket: BUCKET, path: 'user-1/up-9' });
  });

  it('upserts, so a retry after a dropped connection is not a duplicate', async () => {
    const sb = fakeSb();
    await uploadFile(sb, 'user-1', 'up-9', file);
    expect(sb.calls[0].opts.upsert).toBe(true);
    expect(sb.calls[0].opts.contentType).toBe('application/pdf');
  });

  it('reports a failure instead of throwing', async () => {
    // A drawing that fails to upload is a thing to report, never a reason to
    // lose the estimator's work.
    const sb = fakeSb({ upload: { error: { message: 'quota exceeded' } } });
    expect(await uploadFile(sb, 'u', 'f', file)).toEqual({ ok: false, error: 'quota exceeded' });
  });

  it('survives the client throwing outright', async () => {
    const sb = { storage: { from() { throw new Error('offline'); } } };
    expect((await uploadFile(sb, 'u', 'f', file)).ok).toBe(false);
  });

  it('does nothing without a client, a user or a file', async () => {
    expect((await uploadFile(null, 'u', 'f', file)).ok).toBe(false);
    expect((await uploadFile(fakeSb(), '', 'f', file)).ok).toBe(false);
    expect((await uploadFile(fakeSb(), 'u', 'f', null)).ok).toBe(false);
  });
});

describe('downloadFile', () => {
  it('fetches from the same path it wrote', async () => {
    const sb = fakeSb();
    const blob = await downloadFile(sb, 'user-1', 'up-9');
    expect(blob).toEqual({ size: 10 });
    expect(sb.calls[0]).toMatchObject({ op: 'download', path: 'user-1/up-9' });
  });

  it('is null when it is not there, rather than pretending', async () => {
    const sb = fakeSb({ download: { data: null, error: { message: 'not found' } } });
    expect(await downloadFile(sb, 'u', 'f')).toBe(null);
  });

  it('is null when offline', async () => {
    const sb = { storage: { from() { throw new Error('network'); } } };
    expect(await downloadFile(sb, 'u', 'f')).toBe(null);
  });

  it('is null without a client or a user', async () => {
    expect(await downloadFile(null, 'u', 'f')).toBe(null);
    expect(await downloadFile(fakeSb(), '', 'f')).toBe(null);
  });
});

describe('removeFiles', () => {
  it('deletes every path under this owner', async () => {
    const sb = fakeSb();
    await removeFiles(sb, 'user-1', ['a', 'b']);
    expect(sb.calls[0].paths).toEqual(['user-1/a', 'user-1/b']);
  });

  it('takes a single id too', async () => {
    const sb = fakeSb();
    await removeFiles(sb, 'user-1', 'a');
    expect(sb.calls[0].paths).toEqual(['user-1/a']);
  });

  it('does nothing on an empty list', async () => {
    const sb = fakeSb();
    expect((await removeFiles(sb, 'user-1', [])).ok).toBe(false);
    expect(sb.calls).toEqual([]);
  });
});

// ── WHAT THE ACCOUNT ALREADY HOLDS ──────────────────────────────────────────
describe('listCloudFiles', () => {
  // A storage client whose list() pages, so pagination is exercised rather
  // than assumed. Names under the owner's folder ARE the upload ids.
  function listing(pages, { failOn = -1 } = {}) {
    const calls = [];
    return {
      calls,
      storage: {
        from: () => ({
          list: async (path, opts) => {
            calls.push({ path, ...opts });
            const page = Math.floor(opts.offset / opts.limit);
            if (page === failOn) return { data: null, error: { message: 'boom' } };
            return { data: (pages[page] || []).map(name => ({ name })), error: null };
          },
        }),
      },
    };
  }

  it('reads the ids out of the owner’s own folder', async () => {
    const sb = listing([['a', 'b']]);
    expect([...await listCloudFiles(sb, 'user-1')]).toEqual(['a', 'b']);
    expect(sb.calls[0].path).toBe('user-1');
  });

  it('pages, because an estimator with thirty jobs is past one page', async () => {
    // A short read does not fail loudly — it silently re-uploads plan sets
    // that were already there.
    const sb = listing([['a', 'b'], ['c']]);
    expect([...await listCloudFiles(sb, 'u', { pageSize: 2 })]).toEqual(['a', 'b', 'c']);
  });

  it('stops at the last full page rather than asking forever', async () => {
    const sb = listing([['a', 'b'], []]);
    await listCloudFiles(sb, 'u', { pageSize: 2 });
    expect(sb.calls.length).toBe(2);
  });

  it('is null — not empty — when the listing fails', async () => {
    // THE DISTINCTION THAT MATTERS. An empty Set means "the cloud has none of
    // these, send them all". A failed read means "I could not tell." Confusing
    // the two pushes a 40 MB set over cell service for nothing.
    expect(await listCloudFiles(listing([[]], { failOn: 0 }), 'u')).toBe(null);
  });

  it('is null when a LATER page fails, not a short list', async () => {
    const sb = listing([['a', 'b'], ['c', 'd']], { failOn: 1 });
    expect(await listCloudFiles(sb, 'u', { pageSize: 2 })).toBe(null);
  });

  it('is null when the client throws outright', async () => {
    expect(await listCloudFiles({ storage: { from() { throw new Error('offline'); } } }, 'u')).toBe(null);
  });

  it('is empty without a client or a user, which is not a failure', async () => {
    // Nobody signed in: there is genuinely nothing up there for this device.
    expect([...await listCloudFiles(null, 'u')]).toEqual([]);
    expect([...await listCloudFiles(listing([[]]), '')]).toEqual([]);
  });
});
