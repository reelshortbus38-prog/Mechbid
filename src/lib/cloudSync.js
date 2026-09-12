// ── CLOUD JOB SYNC ───────────────────────────────────────────────────────────────
// Offline-first sync between the browser's localStorage jobs and a per-user
// Supabase table. The UI keeps reading/writing localStorage synchronously (no
// rewrite of every call site); this layer mirrors those jobs to the cloud in
// the background and pulls them back on a new device. When Supabase isn't
// configured or nobody's logged in, every function here is a no-op and the app
// behaves exactly as the local-only version did.
//
// Conflict rule: newest wins, by each job's `lastEdited` timestamp. A job that
// exists only on one side is kept. This is safe for a single user across their
// own devices (the whole point); it is NOT multi-user concurrent editing.
import { getSupabase } from './supabase.js';

const TABLE = 'jobs';

// Cloud row  →  local job shape ({ id, name, mode, lastEdited, data }).
export function rowToJob(row) {
  // A soft-deleted row is a TOMBSTONE, not a job. It carries no data — only
  // the fact that somebody deleted it and when.
  if (row?.deleted_at) {
    return { id: row.id, deletedAt: row.deleted_at, deleted: true };
  }
  return {
    id: row.id,
    name: row.name || 'Untitled',
    mode: row.mode || '',
    lastEdited: row.updated_at || row.data?.lastEdited || new Date(0).toISOString(),
    data: row.data || {},
  };
}

// Local job  →  cloud row (user_id stamped by the caller / RLS default).
export function jobToRow(job, userId) {
  return {
    id: job.id,
    user_id: userId,
    name: job.name || job.data?.projName || 'Untitled',
    mode: job.mode || job.data?.mode || '',
    data: job.data || {},
    updated_at: job.lastEdited || new Date().toISOString(),
  };
}

// Merge two job maps ({id: job}) newest-wins. Returns the merged map plus the
// ids that changed on each side, so the caller knows what to write where.
// Pure — unit-tested without any network.
// ── WHY DELETES NEED A TOMBSTONE ────────────────────────────────────────────
// This used to read "cloud has it, local does not" as "this device is behind,
// copy it down" — and the mirror case as "the cloud is behind, push it up."
// Neither can tell an absence apart from a DELETION, and that broke exactly as
// it had to: delete every old job on the iPad, open the app on a phone that
// still had them, and the phone pushed all of them back up as local-only work.
// The iPad then pulled them down again. A delete could not survive any other
// device that still held the job.
//
// So a deletion is now a FACT that travels, not an absence to be guessed at.
// The cloud row is soft-deleted — it keeps its id and gains a deleted_at — and
// that beats a local copy last edited before it.
//
// The one case where a tombstone does NOT win is a job edited AFTER it was
// deleted elsewhere. That is somebody actively working on it, and losing their
// afternoon to a delete they never saw is worse than a job reappearing.
export function mergeJobMaps(local = {}, cloud = {}) {
  const merged = {};
  const toPush = [];   // local is newer, or cloud is missing it → write to cloud
  const toLocal = [];  // cloud is newer, or local is missing it → write to local
  const toDelete = []; // deleted elsewhere → drop it here too
  const ids = new Set([...Object.keys(local), ...Object.keys(cloud)]);
  const t = j => Date.parse(j?.lastEdited || 0) || 0;
  const d = j => Date.parse(j?.deletedAt || 0) || 0;

  for (const id of ids) {
    const l = local[id], c = cloud[id];

    if (c?.deleted) {
      // Edited after the deletion: the work is newer than the delete, so it
      // stands and goes back up.
      if (l && t(l) > d(c)) { merged[id] = l; toPush.push(id); continue; }
      if (l) toDelete.push(id);
      continue;   // and it is not in `merged` — that is the deletion landing
    }

    if (l && !c) { merged[id] = l; toPush.push(id); }
    else if (c && !l) { merged[id] = c; toLocal.push(id); }
    else if (t(l) >= t(c)) { merged[id] = l; if (t(l) > t(c)) toPush.push(id); }
    else { merged[id] = c; toLocal.push(id); }
  }
  return { merged, toPush, toLocal, toDelete };
}

// ── Supabase I/O (no-ops when unconfigured / logged out) ─────────────────────

export async function pullCloudJobs(userId) {
  const sb = getSupabase();
  if (!sb || !userId) return {};
  const { data, error } = await sb.from(TABLE).select('*').eq('user_id', userId);
  if (error) { console.warn('Cloud pull failed:', error.message); return {}; }
  const map = {};
  for (const row of data || []) map[row.id] = rowToJob(row);
  return map;
}

export async function pushCloudJob(userId, job) {
  const sb = getSupabase();
  if (!sb || !userId || !job?.id) return false;
  // Conflict target must match the table's primary key (user_id, id) — there is
  // no unique index on id alone, so onConflict:'id' would error on every push.
  const { error } = await sb.from(TABLE).upsert(jobToRow(job, userId), { onConflict: 'user_id,id' });
  if (error) { console.warn('Cloud push failed:', error.message); return false; }
  return true;
}

// Soft delete. A removed ROW is an absence, and an absence is exactly what
// every other device reads as "I am behind, let me push my copy back up."
// Stamping deleted_at leaves something for them to find.
//
// The data is cleared at the same time: a deleted job should not go on
// occupying a row with a customer's bid inside it.
export async function deleteCloudJob(userId, id) {
  const sb = getSupabase();
  if (!sb || !userId || !id) return false;
  const { error } = await sb.from(TABLE)
    .update({ deleted_at: new Date().toISOString(), data: {}, name: '' })
    .eq('user_id', userId).eq('id', id);
  if (error) { console.warn('Cloud delete failed:', error.message); return false; }
  return true;
}

// On login (or new device): pull cloud, merge with whatever is local, write the
// merged set back to localStorage, and push everything local-only/newer up.
// Returns the merged job map so the caller can refresh the UI. localGetAll /
// localSetAll are injected so this module doesn't import the store (avoids a
// cycle) and stays unit-testable.
export async function syncOnLogin(userId, localGetAll, localSetAll, onDeleted) {
  const sb = getSupabase();
  if (!sb || !userId) return localGetAll();
  const local = localGetAll();
  const cloud = await pullCloudJobs(userId);
  const { merged, toPush, toDelete } = mergeJobMaps(local, cloud);
  localSetAll(merged);
  // Anything deleted on another device goes here too, drawings and all — the
  // merged map no longer contains it, so this only reports what happened.
  if (toDelete.length && typeof onDeleted === 'function') {
    try { onDeleted(toDelete, local); } catch { /* reporting must not break sync */ }
  }
  // Push local-only / locally-newer jobs to the cloud (best-effort, in parallel).
  await Promise.all(toPush.map(id => pushCloudJob(userId, merged[id])));
  return merged;
}
