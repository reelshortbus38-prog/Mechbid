// ── THE DRAWINGS, ON EVERY DEVICE ───────────────────────────────────────────
// Jobs already follow the estimator: sign in on a phone and the bids are
// there. The drawings were not, because the bytes lived only in the browser
// that uploaded them. So the takeoff travelled and the sheet it was read from
// did not, which is the half that matters when somebody asks "where did 240
// feet come from."
//
// The manifest was never the problem. state.uploadedFiles — id, name, size,
// type — rides inside the job's `data` and syncs already. The other device
// knows exactly WHICH files the job has. It only lacks their contents. So this
// stores contents, keyed by that same upload id, and the two halves meet.
//
// ── WHAT IT COSTS, HONESTLY ─────────────────────────────────────────────────
// A plan set is 20-50 MB and the free Supabase tier is 1 GB for everything.
// That is roughly twenty to forty jobs' worth of drawings before it is full,
// and uploading a set over cell service from inside a store is not fast. Both
// are real, so nothing here blocks the estimator: the upload runs behind the
// work, the local copy is written first, and a failed upload leaves the app
// exactly as it was with the file still on the device that made it.
//
// ── PRIVACY ─────────────────────────────────────────────────────────────────
// The bucket is PRIVATE. These are customer construction documents. Every path
// begins with the owner's user id and the storage policies check it, so one
// account cannot read another's drawings even knowing the path. A public
// bucket would make every plan set readable by anyone who guessed a URL.

export const BUCKET = 'job-files';

// `${userId}/${uploadId}` — the leading folder is what the storage policies
// match on, and the id is already unique per upload, so no filename is
// involved and nothing can collide.
export function filePath(userId, uploadId) {
  const u = String(userId || '').trim();
  const f = String(uploadId || '').trim();
  if (!u || !f) return '';
  return `${u}/${f}`;
}

// → { ok, error } — never throws. A drawing that fails to upload is a thing to
// report, not a reason to lose the estimator's work.
export async function uploadFile(sb, userId, uploadId, file) {
  const path = filePath(userId, uploadId);
  if (!sb || !path || !file) return { ok: false, error: 'not configured' };
  try {
    const { error } = await sb.storage.from(BUCKET).upload(path, file, {
      // Re-uploading the same id is the same file. Without upsert a retry
      // after a dropped connection fails as a duplicate.
      upsert: true,
      contentType: file.type || 'application/octet-stream',
    });
    if (error) return { ok: false, error: error.message || 'upload failed' };
    return { ok: true, error: '' };
  } catch (e) {
    return { ok: false, error: e?.message || 'upload failed' };
  }
}

// → a Blob, or null. Null means "not there or not reachable" and the caller
// says so rather than pretending.
export async function downloadFile(sb, userId, uploadId) {
  const path = filePath(userId, uploadId);
  if (!sb || !path) return null;
  try {
    const { data, error } = await sb.storage.from(BUCKET).download(path);
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

export async function removeFiles(sb, userId, uploadIds) {
  const paths = (Array.isArray(uploadIds) ? uploadIds : [uploadIds])
    .map(id => filePath(userId, id))
    .filter(Boolean);
  if (!sb || !paths.length) return { ok: false, error: 'not configured' };
  try {
    const { error } = await sb.storage.from(BUCKET).remove(paths);
    if (error) return { ok: false, error: error.message || 'remove failed' };
    return { ok: true, error: '' };
  } catch (e) {
    return { ok: false, error: e?.message || 'remove failed' };
  }
}

// ── WHAT THE ACCOUNT ALREADY HOLDS ──────────────────────────────────────────
// Every object under the owner's folder is named for the upload id that made
// it, so listing the folder IS the set of ids already in the cloud. That is
// what the catch-up pass (lib/fileCatchUp.js) subtracts what this device holds
// from, to find drawings that never went up.
//
// Paged deliberately: the list call caps at 100 by default and an estimator
// with thirty jobs is past that, and a short read here does not fail loudly —
// it silently re-uploads files that were already there.
export async function listCloudFiles(sb, userId, { pageSize = 100, maxPages = 50 } = {}) {
  const owner = String(userId || '').trim();
  const ids = new Set();
  if (!sb || !owner) return ids;
  try {
    for (let page = 0; page < maxPages; page++) {
      const { data, error } = await sb.storage.from(BUCKET)
        .list(owner, { limit: pageSize, offset: page * pageSize });
      // A LISTING THAT FAILED IS NOT AN EMPTY BUCKET. Returning the ids
      // gathered so far would read as "the cloud does not have these" and
      // re-upload a plan set over cell service for nothing. null means "could
      // not tell", and the caller does nothing rather than guess.
      if (error) return null;
      if (!data?.length) break;
      for (const row of data) if (row?.name) ids.add(row.name);
      if (data.length < pageSize) break;
    }
  } catch {
    return null;   // offline, or the bucket is unreachable
  }
  return ids;
}
