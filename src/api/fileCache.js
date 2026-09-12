// ── THE FILES, KEPT ─────────────────────────────────────────────────────────
// To show the estimator the sheet a flag is talking about, the app has to still
// HOLD that sheet. It used to hold it for exactly as long as the tab stayed
// open: the File objects lived in a module-level Map, and a blob URL died with
// the session, so store.js stripped it on save rather than leave a "View"
// button that opened nothing.
//
// That was honest and it was not enough. An estimator works a bid, breaks for
// lunch, comes back — and to look at the drawing he priced from he has to
// upload the whole set again. Same if he wants to re-check a job from last
// week. The old comment in this file said as much: "Making it survive a reload
// means IndexedDB … worth doing if re-checking old jobs turns out to matter."
// It turned out to matter.
//
// ── WHY INDEXEDDB AND NOT THE CLOUD ─────────────────────────────────────────
// A plan set is 20-50 MB. Uploading that over cell service from inside a store
// is slow, and a free Supabase bucket is 1 GB for everything. IndexedDB is on
// the device, free, needs no account, and has room measured in gigabytes
// rather than the 5 MB localStorage allows. It does not follow the estimator
// to another device — that is the real limit here, and the cloud can be
// layered behind this same interface later if it turns out to matter the way
// this did.
//
// ── WHY KEYED BY UPLOAD ID AND NOT BY FILENAME ──────────────────────────────
// The session map was keyed by filename, which was safe only because it died
// every session. Once files persist, two jobs that both contain an "M0.1.pdf"
// collide, and the app shows the estimator a sheet from a different store —
// worse than showing nothing, because it looks right.
//
// Every upload already carries a `uid()` in state.uploadedFiles, and that id is
// saved with the job. So the bytes go under the id, and a lookup that starts
// from a filename resolves through the CURRENT job's file list to get there.
// Nothing from another job is reachable, and a new job that has not been saved
// yet works the same — the id exists at upload, long before a jobId does.
//
// ── AND THE CLOUD, WHEN SOMEBODY IS SIGNED IN ───────────────────────────────
// The device copy answers instantly and costs nothing, so it stays the first
// place looked. But it only exists on the machine that did the upload, and an
// estimator who opens a job on his phone should see the same drawings.
//
// So a cloud mover can be registered (see lib/fileSync.js, wired in Wizard).
// When one is, a miss falls through to it, and what comes back is written to
// the device so the second look is local again. Nothing in this module knows
// what Supabase is — it is handed two functions and that keeps this testable
// without a network.
//
// ── WHEN THERE IS NO INDEXEDDB ──────────────────────────────────────────────
// Private windows, blocked site data, a browser that refuses. Every path here
// degrades to the session-only Map, which is exactly what the app did before
// this file changed. Nothing throws and nothing is claimed that is not true:
// hasCachedFile answers honestly, so the verify button appears only when it
// will work.

const DB_NAME = 'coldgauge_files';
const DB_VERSION = 1;
const STORE = 'files';

// A ceiling, because a plan set is large and a browser that hits its quota
// starts refusing writes with no warning an estimator would ever see. Oldest
// files go first — the bid you are working now matters more than the one from
// March.
export const MAX_CACHE_BYTES = 300 * 1024 * 1024;

// Session-speed layer: id → File. A file just uploaded is served from here
// without touching the database at all.
const session = new Map();

// What is known to be on disk: id → { name, size, savedAt }. Hydrated once at
// startup so `hasCachedFile` can stay synchronous — it is called while
// rendering, to decide whether a verify button should exist, and a render path
// cannot await.
const index = new Map();

let hydrated = false;

// { upload(id, file), download(id) } or null. Registered when a user signs in
// and cleared when they sign out, so a signed-out session cannot reach for
// files that are not its own.
let cloud = null;

export function setCloudFiles(mover) {
  cloud = mover && typeof mover.download === 'function' ? mover : null;
}

// True when a file this job lists could be fetched even if it is not on this
// device. Callers use it to decide whether to offer a "view" at all — the
// button then either opens the drawing or says it could not get it, which is
// more use than no button.
export function cloudFilesReady() {
  return !!cloud;
}

// ── THE DATABASE ────────────────────────────────────────────────────────────
function openDb() {
  return new Promise(resolve => {
    let idb;
    try {
      idb = typeof indexedDB === 'undefined' ? null : indexedDB;
    } catch {
      idb = null;   // Safari with site data blocked throws on the reference
    }
    if (!idb) { resolve(null); return; }

    let req;
    try { req = idb.open(DB_NAME, DB_VERSION); } catch { resolve(null); return; }

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

// → whatever `fn` produced, or null if the transaction did not complete.
// A read hands back a promise for its result and is awaited here; a write
// returns nothing and resolves `true`, so every caller can test one thing:
// null means it did not happen.
function tx(db, mode, fn) {
  return new Promise(resolve => {
    let t;
    try { t = db.transaction(STORE, mode); } catch { resolve(null); return; }
    let out;
    try { out = fn(t.objectStore(STORE)); } catch { resolve(null); return; }
    t.oncomplete = () => {
      if (out && typeof out.then === 'function') out.then(resolve, () => resolve(null));
      else resolve(out === undefined ? true : out);
    };
    t.onerror = () => resolve(null);
    t.onabort = () => resolve(null);
  });
}

const asPromise = req => new Promise(resolve => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => resolve(null);
});

// ── NAME → ID, WITHIN THIS JOB ──────────────────────────────────────────────
// The only bridge between a flag (which knows a filename) and the bytes (which
// are keyed by upload id). Scoped to the job's own file list, which is what
// stops one job reaching another's drawings.
export function fileIdFor(uploadedFiles, name) {
  const wanted = String(name || '').trim().toLowerCase();
  if (!wanted) return '';
  const hit = (uploadedFiles || []).find(f => String(f?.name || '').trim().toLowerCase() === wanted);
  return hit?.id || '';
}

// ── WRITING ─────────────────────────────────────────────────────────────────
// Returns immediately: the session map is what the next few minutes need, and
// waiting on a 40 MB disk write before the upload looks finished would be felt.
// The persist runs behind it and is allowed to fail quietly — failing means
// the app behaves exactly as it did before this file existed.
export function rememberFile(id, file) {
  const key = String(id || '');
  if (!key || !file) return;
  session.set(key, file);
  persist(key, file);
  pushToCloud(key, file);
}

async function persist(id, file) {
  const db = await openDb();
  if (!db) return;
  const record = {
    id,
    name: file.name || '',
    type: file.type || '',
    size: Number(file.size) || 0,
    savedAt: Date.now(),
    blob: file,
  };
  const ok = await tx(db, 'readwrite', store => { store.put(record); });
  if (ok !== null) index.set(id, { name: record.name, size: record.size, savedAt: record.savedAt });
  db.close();
  // Only after a successful write is there anything new to prune.
  if (ok !== null) pruneFileCache().catch(() => {});
}

// Behind the estimator's work, always. A 40 MB set over cell service from
// inside a store takes as long as it takes, and none of it should be in the
// way of pricing the job. A failure leaves the file on this device and the app
// exactly as it was before any of this existed.
function pushToCloud(id, file) {
  if (!cloud || typeof cloud.upload !== 'function') return;
  Promise.resolve(cloud.upload(id, file)).catch(() => {});
}

// ── READING ─────────────────────────────────────────────────────────────────
// Synchronous, because it is called while rendering to decide whether the
// verify button should be there at all.
export function hasCachedFile(id) {
  const key = String(id || '');
  return !!key && (session.has(key) || index.has(key));
}

export async function loadCachedFile(id) {
  const key = String(id || '');
  if (!key) return null;
  const live = session.get(key);
  if (live) return live;

  const db = await openDb();
  // No database here — a private window, or a phone that has never held this
  // file. The cloud is the only place left to look.
  if (!db) return pullFromCloud(key);
  const rec = await tx(db, 'readonly', store => asPromise(store.get(key)));
  db.close();
  const blob = rec && rec.blob ? rec.blob : null;
  if (blob) {
    // Put it back in the session map: a sheet peek re-renders and would
    // otherwise hit the disk on every page turn.
    session.set(key, blob);
    return blob;
  }
  return pullFromCloud(key);
}

// Not on this device. If somebody is signed in, the drawing may still be
// theirs to fetch — this is the path a phone takes on a job built on the iPad.
// What comes back is written to the device, so the second look is local.
async function pullFromCloud(id) {
  if (!cloud) return null;
  let blob = null;
  try { blob = await cloud.download(id); } catch { blob = null; }
  if (!blob) return null;
  session.set(id, blob);
  persist(id, blob).catch(() => {});
  return blob;
}

// ── STARTUP ─────────────────────────────────────────────────────────────────
// One pass to learn what is on disk. Only the metadata is read — the blobs
// stay where they are until something actually asks for one.
export async function hydrateFileCache() {
  if (hydrated) return index.size;
  hydrated = true;
  const db = await openDb();
  if (!db) return 0;
  const all = await tx(db, 'readonly', store => asPromise(store.getAll()));
  db.close();
  for (const rec of all || []) {
    if (rec?.id) index.set(rec.id, { name: rec.name, size: rec.size || 0, savedAt: rec.savedAt || 0 });
  }
  return index.size;
}

// ── HOUSEKEEPING ────────────────────────────────────────────────────────────
export function cacheUsage() {
  let bytes = 0;
  for (const meta of index.values()) bytes += meta.size || 0;
  return { files: index.size, bytes };
}

// Which ids have to go to get under the cap, oldest first. Pure, so the policy
// is testable without a database.
export function evictionPlan(entries, maxBytes = MAX_CACHE_BYTES) {
  const rows = [...(entries || [])]
    .filter(([, m]) => m)
    .sort((a, b) => (a[1].savedAt || 0) - (b[1].savedAt || 0));
  let total = rows.reduce((s, [, m]) => s + (m.size || 0), 0);
  const doomed = [];
  for (const [id, meta] of rows) {
    if (total <= maxBytes) break;
    doomed.push(id);
    total -= meta.size || 0;
  }
  return doomed;
}

export async function pruneFileCache(maxBytes = MAX_CACHE_BYTES) {
  const doomed = evictionPlan([...index.entries()], maxBytes);
  if (!doomed.length) return [];
  await forgetFiles(doomed);
  return doomed;
}

export async function forgetFiles(ids) {
  const list = (Array.isArray(ids) ? ids : [ids]).map(String).filter(Boolean);
  if (!list.length) return;
  for (const id of list) { session.delete(id); index.delete(id); }
  const db = await openDb();
  if (!db) return;
  await tx(db, 'readwrite', store => { for (const id of list) store.delete(id); });
  db.close();
}

// Only for tests and for clearing between jobs.
export function clearFileCache() {
  session.clear();
  index.clear();
  hydrated = false;
  cloud = null;
}

// Test seam: lets the eviction and lookup policy be exercised without a
// database, which node does not have.
export function _seedIndex(id, meta) {
  index.set(String(id), meta);
}
