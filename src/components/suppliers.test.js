import { describe, it, expect } from 'vitest';
import {
  BUILTIN_SUPPLIERS, MAX_SUPPLIER_NAME, normalizeSupplierName, loadCustomSuppliers,
  allSuppliers, isKnownSupplier, displaySuppliers, addCustomSupplier, removeCustomSupplier,
} from './suppliers.js';

function fakeStore(initial = {}, { readonly = false } = {}) {
  const data = { ...initial };
  return {
    data,
    getItem(k) { return k in data ? data[k] : null; },
    setItem(k, v) { if (readonly) throw new Error('quota'); data[k] = v; },
  };
}

describe('normalizing a name', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeSupplierName('  Coastal   Refrigeration  ')).toBe('Coastal Refrigeration');
  });

  it('PRESERVES case — a supplier name is how they write it', () => {
    expect(normalizeSupplierName('RE Michel')).toBe('RE Michel');
  });

  it('caps a pasted essay so it cannot break the layout', () => {
    expect(normalizeSupplierName('x'.repeat(500))).toHaveLength(MAX_SUPPLIER_NAME);
  });

  it('turns null and undefined into an empty string, not "null"', () => {
    expect(normalizeSupplierName(null)).toBe('');
    expect(normalizeSupplierName(undefined)).toBe('');
  });
});

describe('adding a supplier', () => {
  it('adds one that is not on the list', () => {
    const s = fakeStore();
    const r = addCustomSupplier(s, 'Coastal Refrigeration');
    expect(r.ok).toBe(true);
    expect(r.list).toEqual(['Coastal Refrigeration']);
  });

  it('rejects a blank name instead of adding an empty row', () => {
    const r = addCustomSupplier(fakeStore(), '   ');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Enter a supplier/);
  });

  it('rejects a duplicate of a built-in, whatever the casing', () => {
    // Two "RE Michel" entries in one dropdown is a bug report waiting to happen.
    const r = addCustomSupplier(fakeStore(), 'rE mIcHeL');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/already on the list/);
  });

  it('rejects a duplicate of one already added', () => {
    const s = fakeStore();
    addCustomSupplier(s, 'Coastal Refrigeration');
    const r = addCustomSupplier(s, 'coastal refrigeration');
    expect(r.ok).toBe(false);
  });

  it('returns the UNCHANGED list on failure, so a caller can assign either way', () => {
    const s = fakeStore();
    addCustomSupplier(s, 'Coastal');
    const r = addCustomSupplier(s, '');
    expect(r.list).toEqual(['Coastal']);
  });

  it('reports a storage failure rather than pretending it saved', () => {
    // A supplier that silently vanishes on reload is worse than a visible error.
    const r = addCustomSupplier(fakeStore({}, { readonly: true }), 'Coastal');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Could not save/);
  });

  it('persists across a reload', () => {
    const s = fakeStore();
    addCustomSupplier(s, 'Coastal Refrigeration');
    expect(loadCustomSuppliers(s)).toEqual(['Coastal Refrigeration']);
  });
});

describe('removing a supplier', () => {
  it('removes one that was added', () => {
    const s = fakeStore();
    addCustomSupplier(s, 'Coastal');
    expect(removeCustomSupplier(s, 'Coastal').list).toEqual([]);
  });

  it('refuses to remove a built-in — it is code, and would just come back', () => {
    const s = fakeStore();
    const r = removeCustomSupplier(s, 'RE Michel');
    expect(r.ok).toBe(false);
    expect(allSuppliers(r.list)).toContain('RE Michel');
  });
});

describe('reading a corrupt or hand-edited key', () => {
  it('survives invalid JSON', () => {
    expect(loadCustomSuppliers(fakeStore({ coldgauge_custom_suppliers_v1: '{not json' }))).toEqual([]);
  });

  it('survives a non-array', () => {
    expect(loadCustomSuppliers(fakeStore({ coldgauge_custom_suppliers_v1: '{"a":1}' }))).toEqual([]);
  });

  it('filters nulls and blanks so they cannot reach a dropdown', () => {
    const s = fakeStore({ coldgauge_custom_suppliers_v1: '["Coastal", null, "", "  "]' });
    expect(loadCustomSuppliers(s)).toEqual(['Coastal']);
  });
});

describe('what the picker renders', () => {
  it('offers built-ins plus added ones', () => {
    expect(displaySuppliers(['Coastal'])).toEqual([...BUILTIN_SUPPLIERS, 'Coastal']);
  });

  it('KEEPS a job showing a supplier that is no longer on the list', () => {
    // The bug this prevents: a <select> whose value matches no option renders
    // blank, so the estimator cannot tell what the job was priced against.
    const shown = displaySuppliers([], 'Coastal Refrigeration');
    expect(shown).toContain('Coastal Refrigeration');
  });

  it('does not duplicate the current supplier when it IS on the list', () => {
    const shown = displaySuppliers(['Coastal'], 'Coastal');
    expect(shown.filter(s => s === 'Coastal')).toHaveLength(1);
  });

  it('does not duplicate a built-in that is the current supplier', () => {
    const shown = displaySuppliers([], 'RE Michel');
    expect(shown.filter(s => s === 'RE Michel')).toHaveLength(1);
  });

  it('adds nothing when there is no current supplier', () => {
    expect(displaySuppliers([], '')).toEqual(BUILTIN_SUPPLIERS);
  });
});

describe('isKnownSupplier', () => {
  it('matches a built-in regardless of case', () => {
    expect(isKnownSupplier('ferguson')).toBe(true);
  });

  it('is false for a blank', () => {
    expect(isKnownSupplier('')).toBe(false);
    expect(isKnownSupplier('   ')).toBe(false);
  });
});
