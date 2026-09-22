// ── WHERE THE FILE ACTUALLY IS ──────────────────────────────────────────────
// Uploading a file puts the File object in a React ref and the blob in the
// device cache. Analyze only ever looked in the ref:
//
//   const file = fileObjects.current[fileMeta.id];
//   if (!file) { newResults.push(`❌ ${name}: File not found — please
//                                 re-upload`); continue; }
//
// A ref does not survive a reload. So: upload a plan set, get called away,
// come back to a reloaded tab or a restored session, press Analyze — and every
// sheet reports itself missing and asks to be uploaded again. The blobs were
// on the device the whole time, in IndexedDB, put there by rememberFile at
// upload. Nothing asked.
//
// Worse on the iPad than the laptop, because that is where a tab gets evicted
// for being in the background while somebody takes a phone call.
//
// loadCachedFile already looks in the session map, then IndexedDB, then the
// cloud for a signed-in user — the whole ladder was built and this caller
// skipped it.
//
// WHAT COMES BACK IS A BLOB, not a File. Blob has no .name, and the analyzers
// read one, so it is wrapped with the name and type the job already knows from
// the upload record. A File made from a cached blob has to be indistinguishable
// from the original or this fix trades one failure for a stranger one.
//
// Pure apart from the loader, which is injected — so a test can ask what
// happens when the cache is empty, when it holds the file, and when the
// lookup throws.

export async function resolveFile(meta, live, load) {
  if (!meta || meta.type === 'pastedText') return null;
  // Still in this session: the ordinary path, and no reason to touch the disk.
  if (live) return live;
  if (typeof load !== 'function') return null;

  let blob = null;
  // A cache read that throws must read as "not here", not take the whole
  // analyze run down with it — one unreadable file out of twenty should cost
  // that file, not the batch.
  try { blob = await load(meta.id); } catch { blob = null; }
  if (!blob) return null;
  if (typeof File !== 'undefined' && blob instanceof File) return blob;

  const name = meta.name || 'file';
  const type = blob.type || meta.mime || '';
  try {
    return new File([blob], name, { type });
  } catch {
    // Very old browsers have no File constructor. The blob still has the
    // bytes, so hand it over with the name attached rather than refusing.
    try { blob.name = name; } catch { /* frozen — the caller falls back */ }
    return blob;
  }
}

// What to tell somebody when it genuinely is not there. The old wording
// blamed the upload; after a reload the upload was fine and the tab was not.
export function missingFileNote(name) {
  return `${name}: not on this device any more — upload it again. `
    + '(Its contents are held on the device, not in the saved job, so clearing '
    + 'site data or opening the job on a different device loses the file while '
    + 'keeping the takeoff.)';
}
