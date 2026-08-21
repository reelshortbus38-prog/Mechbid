// ── CARRYING BROWSER DATA THROUGH THE RENAME ─────────────────────────────────
// Everything this app saves lives in the browser under a prefixed key, and the
// prefix was the old product name. Renaming those keys without moving what is
// under them makes every saved job, every tuned price and the whole company
// profile disappear — the data is still there, but nothing is looking where it
// sits any more.
//
// This runs once at startup: for each key, if the new one is empty and the old
// one has something in it, copy it across. The old key is LEFT ALONE rather
// than deleted, so a mistake here is recoverable by hand and nothing is
// destroyed on the strength of a rename.
//
// It is deliberately quiet. Success is invisible, and a browser that blocks
// storage entirely must not take the app down over a migration that had nothing
// to move.

export const KEY_MIGRATIONS = [
  ['mechbid_jobs_v2', 'coldgauge_jobs_v2'],
  ['mechbid_company_v1', 'coldgauge_company_v1'],
  ['mechbid_pricebook_v1', 'coldgauge_pricebook_v1'],
  ['mechbid_pricebook', 'coldgauge_pricebook'],
  ['mechbid_default_supplier_v1', 'coldgauge_default_supplier_v1'],
  ['mechbid_extraction_reports_v1', 'coldgauge_extraction_reports_v1'],
];

// store is injected so this is testable without a browser.
export function migrateStorageKeys(store, pairs = KEY_MIGRATIONS) {
  const moved = [];
  for (const [from, to] of pairs) {
    try {
      const existing = store.getItem(to);
      // Never overwrite. If the new key already holds something, this browser
      // has been used since the rename and its current data wins.
      if (existing !== null && existing !== '') continue;
      const old = store.getItem(from);
      if (old === null || old === '') continue;
      store.setItem(to, old);
      moved.push(to);
    } catch {
      // A browser with storage disabled throws on access. Nothing to migrate
      // and nothing to report — carry on to the next key.
    }
  }
  return moved;
}

export function runStorageMigration() {
  try {
    if (typeof localStorage === 'undefined') return [];
    return migrateStorageKeys(localStorage);
  } catch {
    return [];
  }
}
