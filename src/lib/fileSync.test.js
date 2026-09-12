import { describe, it, expect } from 'vitest';
import { filePath, uploadFile, downloadFile, removeFiles, pendingUploads, BUCKET } from './fileSync.js';

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

describe('pendingUploads — catching up a job built before signing in', () => {
  const manifest = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('names what the account does not have yet', () => {
    expect(pendingUploads(manifest, ['a'])).toEqual(['b', 'c']);
    expect(pendingUploads(manifest, new Set(['a', 'c']))).toEqual(['b']);
  });

  it('is everything when nothing has been uploaded', () => {
    expect(pendingUploads(manifest, [])).toEqual(['a', 'b', 'c']);
  });

  it('is empty when the account already has it all', () => {
    expect(pendingUploads(manifest, ['a', 'b', 'c'])).toEqual([]);
  });

  it('ignores rows with no id rather than uploading nothing under a blank path', () => {
    expect(pendingUploads([{ id: '' }, null, { id: 'z' }], [])).toEqual(['z']);
  });

  it('is empty rather than broken on a job with no files', () => {
    expect(pendingUploads([], [])).toEqual([]);
    expect(pendingUploads(undefined, undefined)).toEqual([]);
  });
});
