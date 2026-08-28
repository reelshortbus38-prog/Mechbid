// ── SHOP SETTINGS SYNC ───────────────────────────────────────────────────────
// Jobs sync. Everything ELSE a shop tunes does not, and the imbalance is
// backwards: a job can be re-entered from the drawings in an afternoon, while a
// price book is months of small corrections that exist nowhere else. Losing the
// iPad loses the expensive half.
//
// Four keys are shop-level rather than per-job, and all four died with the
// device:
//
//   pricebook          every price the estimator has corrected by hand
//   company profile    letterhead, legal details, crew defaults, labor units,
//                      standard exclusions, the rate basis
//   default supplier   which house this shop buys from
//   custom suppliers   the local house that is not in the built-in list
//
// WHY PER-KEY AND NOT ONE BLOB. Edit the price book on the iPad, add a supplier
// on a laptop, and a whole-blob newest-wins would silently drop one of them.
// Each key carries its own timestamp and merges independently, so two devices
// editing different settings both keep their work.
//
// TIMESTAMPS COME FROM A SIDECAR. localStorage does not record when a key was
// written, so every writer calls touchShopKey. A key with no recorded time is
// treated as epoch — which is the safe direction, because on a first sync the
// cloud is empty and "exists on only one side" keeps it regardless.
//
// The merge is pure and unit-tested; the I/O is a no-op when Supabase is
// unconfigured or nobody is signed in, exactly like cloudSync.
import { getSupabase } from './supabase.js';

const TABLE = 'shop_settings';

export const SHOP_KEYS = [
  'coldgauge_pricebook_v1',
  'coldgauge_company_v1',
  'coldgauge_default_supplier_v1',
  'coldgauge_custom_suppliers_v1',
];

export const TOUCH_KEY = 'coldgauge_shop_touched_v1';

// Record that a shop key just changed. Called by every writer of the four keys
// above. Deliberately silent on failure: a browser that blocks storage must not
// take a price edit down over bookkeeping.
export function touchShopKey(store, key, now = new Date()) {
  if (!SHOP_KEYS.includes(key)) return false;
  try {
    let map = {};
    try { map = JSON.parse(store.getItem(TOUCH_KEY) || '{}') || {}; } catch { map = {}; }
    if (typeof map !== 'object' || Array.isArray(map)) map = {};
    map[key] = now.toISOString();
    store.setItem(TOUCH_KEY, JSON.stringify(map));
    return true;
  } catch {
    return false;
  }
}

function touchedMap(store) {
  try {
    const m = JSON.parse(store.getItem(TOUCH_KEY) || '{}');
    return (m && typeof m === 'object' && !Array.isArray(m)) ? m : {};
  } catch {
    return {};
  }
}

// Read the four keys as { key: { value, at } }. Absent keys are omitted rather
// than stored as null — "this shop has no custom suppliers" and "this shop has
// never been synced" are different states and must not be conflated.
export function readLocalShop(store) {
  const touched = touchedMap(store);
  const out = {};
  for (const key of SHOP_KEYS) {
    let raw;
    try { raw = store.getItem(key); } catch { raw = null; }
    if (raw === null || raw === undefined || raw === '') continue;
    out[key] = { value: raw, at: touched[key] || new Date(0).toISOString() };
  }
  return out;
}

// Write merged entries back, and record their times so the next merge is
// correct. Returns the keys actually written.
export function writeLocalShop(store, entries = {}) {
  const written = [];
  const touched = touchedMap(store);
  for (const [key, entry] of Object.entries(entries)) {
    if (!SHOP_KEYS.includes(key) || !entry || typeof entry.value !== 'string') continue;
    try {
      store.setItem(key, entry.value);
      touched[key] = entry.at || new Date().toISOString();
      written.push(key);
    } catch {
      // Out of space or storage blocked — skip this key, keep going.
    }
  }
  try { store.setItem(TOUCH_KEY, JSON.stringify(touched)); } catch { /* bookkeeping only */ }
  return written;
}

const ts = e => Date.parse(e?.at || 0) || 0;

// Newest-wins per key. Returns the merged map plus which side needs writing.
export function mergeShopSettings(local = {}, cloud = {}) {
  const merged = {};
  const toPush = [];   // local newer, or cloud missing it
  const toLocal = [];  // cloud newer, or local missing it
  for (const key of new Set([...Object.keys(local), ...Object.keys(cloud)])) {
    if (!SHOP_KEYS.includes(key)) continue;
    const l = local[key], c = cloud[key];
    if (l && !c) { merged[key] = l; toPush.push(key); }
    else if (c && !l) { merged[key] = c; toLocal.push(key); }
    else if (ts(l) >= ts(c)) { merged[key] = l; if (ts(l) > ts(c)) toPush.push(key); }
    else { merged[key] = c; toLocal.push(key); }
  }
  return { merged, toPush, toLocal };
}

// ── Supabase I/O ─────────────────────────────────────────────────────────────

export async function pullShopSettings(userId) {
  const sb = getSupabase();
  if (!sb || !userId) return {};
  const { data, error } = await sb.from(TABLE).select('data').eq('user_id', userId).maybeSingle();
  if (error) { console.warn('Shop settings pull failed:', error.message); return {}; }
  const d = data?.data;
  return (d && typeof d === 'object' && !Array.isArray(d)) ? d : {};
}

export async function pushShopSettings(userId, entries) {
  const sb = getSupabase();
  if (!sb || !userId || !entries || !Object.keys(entries).length) return false;
  const { error } = await sb.from(TABLE).upsert(
    { user_id: userId, data: entries, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
  if (error) { console.warn('Shop settings push failed:', error.message); return false; }
  return true;
}

// On login or on a new device: pull, merge per key, write back what the cloud
// had newer, push the whole merged set up. Pushing everything (rather than only
// the changed keys) keeps the single cloud row complete — it is one row, so
// there is nothing to be gained by writing a partial one.
export async function syncShopOnLogin(userId, store) {
  const sb = getSupabase();
  if (!sb || !userId) return { merged: {}, applied: [] };
  const local = readLocalShop(store);
  const cloud = await pullShopSettings(userId);
  const { merged, toLocal, toPush } = mergeShopSettings(local, cloud);
  const applied = writeLocalShop(store, Object.fromEntries(toLocal.map(k => [k, merged[k]])));
  if (toPush.length) await pushShopSettings(userId, merged);
  return { merged, applied };
}
