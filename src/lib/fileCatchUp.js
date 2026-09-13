// ── THE DRAWINGS THAT NEVER WENT UP ─────────────────────────────────────────
// A file reaches the cloud exactly once: at the moment it is uploaded, if a
// cloud mover happens to be registered right then (fileCache.pushToCloud). If
// one is not, nothing ever tries again. Three ordinary ways that happens:
//
//   · The job was built before signing in. Very common — open the app, drag
//     the set in, start pricing, sign in later to save. Those drawings are on
//     this device only, forever.
//   · The signal died in the middle of a store. The push failed and the error
//     was swallowed on purpose, because a failed upload must never be allowed
//     to interrupt the estimator's work.
//   · The app was signed out on purpose for a while.
//
// In every one of them the JOB still syncs — the manifest rides inside the job
// data, so the phone knows the bid has an M0.1.pdf and confidently offers a
// View button for a file the bucket has never held. That is the "no preview"
// the field reported, in its remaining form.
//
// `pendingUploads` in fileSync.js was written for exactly this and then never
// called from anywhere. This is the pass that calls it.
//
// ── WHAT IT WILL NOT DO ─────────────────────────────────────────────────────
// It cannot upload bytes this device does not have. A file uploaded on the
// iPad before signing in is caught up BY THE IPAD, next time it is opened
// signed in — the phone has no copy to contribute. That is fine: the pass runs
// on every device and each one puts up what it holds.
//
// It also skips anything over the cloud's per-file ceiling. Those are already
// marked "this device only" on the upload screen, and retrying a 90 MB file on
// every sign-in would burn an estimator's data for a failure the app has
// already explained.

import { CLOUD_MAX } from '../steps/uploadLimits.js';

// → { upload: [id], tooBig: [id] }
// Pure. `cached` is [id, { size }] from fileCache.cachedEntries(); `inCloud`
// is the Set from fileSync.listCloudFiles().
export function catchUpPlan(cached = [], inCloud = new Set(), maxBytes = CLOUD_MAX) {
  const have = inCloud instanceof Set ? inCloud : new Set(inCloud || []);
  const upload = [];
  const tooBig = [];
  for (const [rawId, meta] of cached || []) {
    const id = String(rawId || '');
    if (!id || have.has(id)) continue;
    if ((Number(meta?.size) || 0) > maxBytes) tooBig.push(id);
    else upload.push(id);
  }
  return { upload, tooBig };
}

// Run the plan. Everything it touches is injected, so this is testable without
// a network, a database or a browser.
//
// ONE AT A TIME, ON PURPOSE. This is a background catch-up competing with an
// estimator who is trying to price a job on the same connection, and a plan
// set is tens of megabytes. Ten parallel uploads would make the app he is
// actually using feel broken. Nothing here is urgent — it only has to finish
// before he picks up the phone.
//
// → { uploaded, failed, tooBig } counts, for a console line and nothing more.
// A catch-up that does not finish is not an error to put in front of anybody:
// the next sign-in tries again.
export async function runCatchUp({ cached, inCloud, load, upload, maxBytes = CLOUD_MAX, shouldStop } = {}) {
  // null means the listing failed — "could not tell what is up there". Doing
  // nothing is right; re-uploading everything on a guess is not.
  if (!inCloud || typeof load !== 'function' || typeof upload !== 'function') {
    return { uploaded: 0, failed: 0, tooBig: 0 };
  }
  const { upload: todo, tooBig } = catchUpPlan(cached, inCloud, maxBytes);
  let uploaded = 0, failed = 0;
  for (const id of todo) {
    // Signed out, or the component went away, part-way through.
    if (typeof shouldStop === 'function' && shouldStop()) break;
    let file = null;
    try { file = await load(id); } catch { file = null; }
    // In the index but not readable — evicted, or the database threw. Not a
    // failure worth counting: there is nothing to send.
    if (!file) continue;
    try {
      const r = await upload(id, file);
      if (r && r.ok === false) failed++; else uploaded++;
    } catch {
      failed++;
    }
  }
  return { uploaded, failed, tooBig: tooBig.length };
}
