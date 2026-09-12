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

// Which of this job's files are not yet in the cloud. Used to catch up a job
// that was built before signing in, or while offline — the manifest is the
// list of what SHOULD be there, and anything already local but never uploaded
// is what is missing.
export function pendingUploads(uploadedFiles, uploadedIds) {
  const done = uploadedIds instanceof Set ? uploadedIds : new Set(uploadedIds || []);
  return (uploadedFiles || [])
    .map(f => f?.id)
    .filter(id => id && !done.has(id));
}
