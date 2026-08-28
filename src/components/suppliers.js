// ── SUPPLIER LIST ────────────────────────────────────────────────────────────
// The built-in list is the national houses most refrigeration and HVAC shops
// buy from. It is not, and cannot be, complete: most regions have a local house
// that outsells all of them locally, and a bid priced against the wrong supplier
// is priced against the wrong numbers.
//
// So the list is BUILT-IN PLUS WHATEVER THE SHOP ADDS, kept in localStorage
// alongside the price book and the default supplier — shop-level, not per-job,
// because a shop that buys from Coastal Refrigeration buys from them on every
// job.
//
// The rule that matters here: NEVER silently drop a supplier name. A job saved
// against "Coastal Refrigeration" must keep showing Coastal Refrigeration even
// if that name was later removed from the list, because the alternative is a
// select box that renders blank and an estimator who cannot tell what the job
// was priced against. displaySuppliers() exists for exactly that.
//
// Pure — no React, store injected so it is testable without a browser.
import { touchShopKey } from '../lib/shopSync.js';

export const BUILTIN_SUPPLIERS = [
  'RE Michel', 'URI', 'Johnstone', 'Ferguson', 'Wesco',
  'Southern Refrigeration', 'Baker Distributing', 'Gustave A. Larson', 'Carrier Enterprise',
];

export const CUSTOM_SUPPLIER_KEY = 'coldgauge_custom_suppliers_v1';
export const MAX_SUPPLIER_NAME = 60;

// Trim and collapse internal whitespace. Case is PRESERVED — a supplier's name
// is how they write it on the invoice, and "RE Michel" should not become
// "Re michel" because a normalizer felt strongly about it.
export function normalizeSupplierName(name) {
  return String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_SUPPLIER_NAME);
}

const foldCase = s => normalizeSupplierName(s).toLowerCase();

export function loadCustomSuppliers(store) {
  try {
    const raw = store?.getItem(CUSTOM_SUPPLIER_KEY);
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) return [];
    // Filter junk on the way out: a hand-edited or half-written key must not
    // put `null` into a dropdown.
    return parsed.map(normalizeSupplierName).filter(Boolean);
  } catch {
    return [];
  }
}

export function saveCustomSuppliers(store, list) {
  try {
    store.setItem(CUSTOM_SUPPLIER_KEY, JSON.stringify(list));
    touchShopKey(store, CUSTOM_SUPPLIER_KEY);
    return true;
  } catch {
    return false;
  }
}

// Every supplier the picker should offer, built-ins first.
export function allSuppliers(custom = []) {
  return [...BUILTIN_SUPPLIERS, ...custom];
}

export function isKnownSupplier(name, custom = []) {
  const f = foldCase(name);
  return !!f && allSuppliers(custom).some(s => foldCase(s) === f);
}

// What the picker should actually render. If the job is priced against a name
// that is no longer in the list — removed, or saved on another device — it is
// appended so the job still reads correctly.
export function displaySuppliers(custom = [], current = '') {
  const list = allSuppliers(custom);
  const c = normalizeSupplierName(current);
  if (c && !isKnownSupplier(c, custom)) return [...list, c];
  return list;
}

// Returns { ok, list, error }. `list` is the new custom list on success and the
// unchanged one on failure, so a caller can assign it either way.
export function addCustomSupplier(store, name, { custom = null } = {}) {
  const existing = custom || loadCustomSuppliers(store);
  const clean = normalizeSupplierName(name);
  if (!clean) return { ok: false, list: existing, error: 'Enter a supplier name.' };
  if (isKnownSupplier(clean, existing)) {
    return { ok: false, list: existing, error: `${clean} is already on the list.` };
  }
  const list = [...existing, clean];
  const saved = saveCustomSuppliers(store, list);
  if (!saved) return { ok: false, list: existing, error: 'Could not save — browser storage is full or blocked.' };
  return { ok: true, list, error: '' };
}

// Built-ins cannot be removed: they are code, not data, and would reappear on
// the next load anyway. Removing one would look like a bug.
export function removeCustomSupplier(store, name, { custom = null } = {}) {
  const existing = custom || loadCustomSuppliers(store);
  const f = foldCase(name);
  const list = existing.filter(s => foldCase(s) !== f);
  if (list.length === existing.length) return { ok: false, list: existing, error: 'Not a supplier you added.' };
  const saved = saveCustomSuppliers(store, list);
  if (!saved) return { ok: false, list: existing, error: 'Could not save.' };
  return { ok: true, list, error: '' };
}
