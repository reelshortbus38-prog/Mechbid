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
export function mergeJobMaps(local = {}, cloud = {}) {
  const merged = {};
  const toPush = []; // local is newer, or cloud is missing it → write to cloud
  const toLocal = []; // cloud is newer, or local is missing it → write to local
  const ids = new Set([...Object.keys(local), ...Object.keys(cloud)]);
  const t = j => Date.parse(j?.lastEdited || 0) || 0;
  for (const id of ids) {
    const l = local[id], c = cloud[id];
    if (l && !c) { merged[id] = l; toPush.push(id); }
    else if (c && !l) { merged[id] = c; toLocal.push(id); }
    else if (t(l) >= t(c)) { merged[id] = l; if (t(l) > t(c)) toPush.push(id); }
    else { merged[id] = c; toLocal.push(id); }
  }
  return { merged, toPush, toLocal };
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

export async function deleteCloudJob(userId, id) {
  const sb = getSupabase();
  if (!sb || !userId || !id) return false;
  const { error } = await sb.from(TABLE).delete().eq('user_id', userId).eq('id', id);
  if (error) { console.warn('Cloud delete failed:', error.message); return false; }
  return true;
}

// On login (or new device): pull cloud, merge with whatever is local, write the
// merged set back to localStorage, and push everything local-only/newer up.
// Returns the merged job map so the caller can refresh the UI. localGetAll /
// localSetAll are injected so this module doesn't import the store (avoids a
// cycle) and stays unit-testable.
export async function syncOnLogin(userId, localGetAll, localSetAll) {
  const sb = getSupabase();
  if (!sb || !userId) return localGetAll();
  const local = localGetAll();
  const cloud = await pullCloudJobs(userId);
  const { merged, toPush } = mergeJobMaps(local, cloud);
  localSetAll(merged);
  // Push local-only / locally-newer jobs to the cloud (best-effort, in parallel).
  await Promise.all(toPush.map(id => pushCloudJob(userId, merged[id])));
  return merged;
}
