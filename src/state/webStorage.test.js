import { describe, it, expect, afterEach } from 'vitest';
import { webStorage, storageAvailable } from './webStorage.js';
import { loadCustomSuppliers, addCustomSupplier } from '../components/suppliers.js';

// These tests run in node, where `localStorage` genuinely does not exist, so
// the missing case is the default and needs no faking. To test the harder
// case — storage that is PRESENT but throws on access, which is what Safari
// does with site data blocked — a getter is installed on globalThis.
function withThrowingStorage(fn) {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() { throw new DOMException('The operation is insecure.', 'SecurityError'); },
  });
  try { return fn(); } finally { delete globalThis.localStorage; }
}

function withStorage(store, fn) {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true, value: store, writable: true,
  });
  try { return fn(); } finally { delete globalThis.localStorage; }
}

const memoryStore = () => {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
  };
};

afterEach(() => { delete globalThis.localStorage; });

describe('webStorage', () => {
  it('is null where there is no localStorage at all', () => {
    expect(webStorage()).toBe(null);
  });

  it('does not throw when the reference itself throws', () => {
    // This is the whole point. Safari with cookies and site data blocked
    // raises on ACCESS, before any method is called — so a bare
    // `localStorage` in an argument list takes the screen down.
    withThrowingStorage(() => {
      expect(() => webStorage()).not.toThrow();
      expect(webStorage()).toBe(null);
    });
  });

  it('hands back the real store when there is one', () => {
    const store = memoryStore();
    withStorage(store, () => expect(webStorage()).toBe(store));
  });
});

describe('storageAvailable', () => {
  it('is false with no storage', () => {
    expect(storageAvailable()).toBe(false);
  });

  it('is false when storage is there but refuses writes', () => {
    // A full quota, or private mode. Present, readable, and useless.
    const readOnly = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} };
    withStorage(readOnly, () => expect(storageAvailable()).toBe(false));
  });

  it('is true when a write actually sticks — and leaves nothing behind', () => {
    const store = memoryStore();
    withStorage(store, () => {
      expect(storageAvailable()).toBe(true);
      expect(store.getItem('__cg_probe__')).toBe(null);
    });
  });
});

// ── WHAT THE CALLERS DO WITH null ───────────────────────────────────────────
// A guarded accessor is only worth having if the things it feeds cope with the
// answer. They already did — this pins that they keep doing it.
describe('the consumers survive a null store', () => {
  it('reads come back empty rather than throwing', () => {
    expect(loadCustomSuppliers(null)).toEqual([]);
  });

  it('a write fails honestly instead of pretending', () => {
    // Not "silently dropped" and not "crashed" — refused, with a reason the
    // estimator can act on. Nothing is kept in memory pretending to be saved.
    const r = addCustomSupplier(null, 'Johnstone Supply');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/full or blocked/);
  });
});
