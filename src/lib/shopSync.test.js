import { describe, it, expect } from 'vitest';
import {
  SHOP_KEYS, TOUCH_KEY, touchShopKey, readLocalShop, writeLocalShop, mergeShopSettings,
} from './shopSync.js';

function fakeStore(initial = {}, { blockWrite = null } = {}) {
  const data = { ...initial };
  return {
    data,
    getItem(k) { return k in data ? data[k] : null; },
    setItem(k, v) { if (blockWrite && blockWrite(k)) throw new Error('blocked'); data[k] = v; },
  };
}

const PRICEBOOK = 'coldgauge_pricebook_v1';
const COMPANY = 'coldgauge_company_v1';
const SUPPLIERS = 'coldgauge_custom_suppliers_v1';

const entry = (value, at) => ({ value, at });

describe('what counts as a shop setting', () => {
  it('covers the price book, which is the expensive one', () => {
    // A job can be re-entered from the drawings. A tuned price book cannot.
    expect(SHOP_KEYS).toContain(PRICEBOOK);
  });

  it('covers the company profile, default supplier and custom suppliers', () => {
    expect(SHOP_KEYS).toContain(COMPANY);
    expect(SHOP_KEYS).toContain('coldgauge_default_supplier_v1');
    expect(SHOP_KEYS).toContain(SUPPLIERS);
  });

  it('does NOT sync jobs — cloudSync owns those', () => {
    expect(SHOP_KEYS).not.toContain('coldgauge_jobs_v2');
  });
});

describe('recording when a setting changed', () => {
  it('stores a timestamp for a known key', () => {
    const s = fakeStore();
    expect(touchShopKey(s, PRICEBOOK, new Date('2026-08-27T10:00:00Z'))).toBe(true);
    expect(JSON.parse(s.data[TOUCH_KEY])[PRICEBOOK]).toBe('2026-08-27T10:00:00.000Z');
  });

  it('ignores a key that is not a shop setting', () => {
    const s = fakeStore();
    expect(touchShopKey(s, 'coldgauge_jobs_v2')).toBe(false);
    expect(s.data[TOUCH_KEY]).toBeUndefined();
  });

  it('does not throw when storage is blocked', () => {
    // A price edit must not fail because bookkeeping could not be written.
    const s = fakeStore({}, { blockWrite: () => true });
    expect(() => touchShopKey(s, PRICEBOOK)).not.toThrow();
    expect(touchShopKey(s, PRICEBOOK)).toBe(false);
  });

  it('survives a corrupt sidecar and rewrites it', () => {
    const s = fakeStore({ [TOUCH_KEY]: '{not json' });
    expect(touchShopKey(s, PRICEBOOK)).toBe(true);
    expect(JSON.parse(s.data[TOUCH_KEY])[PRICEBOOK]).toBeTruthy();
  });

  it('keeps other keys when touching one', () => {
    const s = fakeStore();
    touchShopKey(s, PRICEBOOK, new Date('2026-01-01T00:00:00Z'));
    touchShopKey(s, COMPANY, new Date('2026-02-01T00:00:00Z'));
    const m = JSON.parse(s.data[TOUCH_KEY]);
    expect(m[PRICEBOOK]).toContain('2026-01-01');
    expect(m[COMPANY]).toContain('2026-02-01');
  });
});

describe('reading the local shop settings', () => {
  it('reads a stored key with its recorded time', () => {
    const s = fakeStore({
      [PRICEBOOK]: '[{"desc":"1/2 valve"}]',
      [TOUCH_KEY]: JSON.stringify({ [PRICEBOOK]: '2026-08-27T10:00:00.000Z' }),
    });
    expect(readLocalShop(s)[PRICEBOOK]).toEqual({
      value: '[{"desc":"1/2 valve"}]', at: '2026-08-27T10:00:00.000Z',
    });
  });

  it('OMITS an absent key rather than storing null', () => {
    // "no custom suppliers" and "never synced" are different states.
    expect(readLocalShop(fakeStore())).toEqual({});
  });

  it('omits an empty string, which is not a setting', () => {
    expect(readLocalShop(fakeStore({ [PRICEBOOK]: '' }))).toEqual({});
  });

  it('falls back to epoch for a key written before touch tracking existed', () => {
    const s = fakeStore({ [PRICEBOOK]: '[]' });
    expect(readLocalShop(s)[PRICEBOOK].at).toBe(new Date(0).toISOString());
  });
});

describe('merging two devices', () => {
  it('keeps a setting that exists on only one side', () => {
    const r = mergeShopSettings({ [PRICEBOOK]: entry('local', '2026-01-01T00:00:00Z') }, {});
    expect(r.merged[PRICEBOOK].value).toBe('local');
    expect(r.toPush).toEqual([PRICEBOOK]);
  });

  it('pulls down a setting the cloud has and this device does not', () => {
    const r = mergeShopSettings({}, { [PRICEBOOK]: entry('cloud', '2026-01-01T00:00:00Z') });
    expect(r.toLocal).toEqual([PRICEBOOK]);
    expect(r.merged[PRICEBOOK].value).toBe('cloud');
  });

  it('newest wins on the same key', () => {
    const r = mergeShopSettings(
      { [PRICEBOOK]: entry('older', '2026-01-01T00:00:00Z') },
      { [PRICEBOOK]: entry('newer', '2026-06-01T00:00:00Z') },
    );
    expect(r.merged[PRICEBOOK].value).toBe('newer');
    expect(r.toLocal).toEqual([PRICEBOOK]);
  });

  it('KEEPS BOTH when two devices edited DIFFERENT settings', () => {
    // The whole reason this merges per key. A whole-blob newest-wins would
    // silently drop one of these.
    const r = mergeShopSettings(
      { [PRICEBOOK]: entry('iPad price book', '2026-06-02T00:00:00Z') },
      { [SUPPLIERS]: entry('["Coastal"]', '2026-06-01T00:00:00Z') },
    );
    expect(r.merged[PRICEBOOK].value).toBe('iPad price book');
    expect(r.merged[SUPPLIERS].value).toBe('["Coastal"]');
    expect(r.toPush).toEqual([PRICEBOOK]);
    expect(r.toLocal).toEqual([SUPPLIERS]);
  });

  it('a tie writes nothing — equal timestamps are not a change', () => {
    const r = mergeShopSettings(
      { [PRICEBOOK]: entry('same', '2026-06-01T00:00:00Z') },
      { [PRICEBOOK]: entry('same', '2026-06-01T00:00:00Z') },
    );
    expect(r.toPush).toEqual([]);
    expect(r.toLocal).toEqual([]);
  });

  it('ignores an unknown key that somehow reached the cloud row', () => {
    const r = mergeShopSettings({}, { evil_key: entry('x', '2026-06-01T00:00:00Z') });
    expect(r.merged).toEqual({});
  });

  it('an untimestamped local setting still survives when the cloud has nothing', () => {
    // The pre-sync case: everything local is epoch, the cloud is empty, and
    // nothing may be lost.
    const local = readLocalShop(fakeStore({ [PRICEBOOK]: '[]', [COMPANY]: '{}' }));
    const r = mergeShopSettings(local, {});
    expect(Object.keys(r.merged).sort()).toEqual([COMPANY, PRICEBOOK].sort());
    expect(r.toPush.sort()).toEqual([COMPANY, PRICEBOOK].sort());
  });
});

describe('writing merged settings back', () => {
  it('writes the value and records its time', () => {
    const s = fakeStore();
    writeLocalShop(s, { [PRICEBOOK]: entry('[]', '2026-06-01T00:00:00Z') });
    expect(s.data[PRICEBOOK]).toBe('[]');
    expect(JSON.parse(s.data[TOUCH_KEY])[PRICEBOOK]).toBe('2026-06-01T00:00:00Z');
  });

  it('skips a key whose value is not a string', () => {
    const s = fakeStore();
    expect(writeLocalShop(s, { [PRICEBOOK]: { value: { a: 1 }, at: 'x' } })).toEqual([]);
  });

  it('keeps going when ONE key fails to write', () => {
    // Out of space on the price book must not cost the company profile.
    const s = fakeStore({}, { blockWrite: k => k === PRICEBOOK });
    const written = writeLocalShop(s, {
      [PRICEBOOK]: entry('[]', '2026-06-01T00:00:00Z'),
      [COMPANY]: entry('{}', '2026-06-01T00:00:00Z'),
    });
    expect(written).toEqual([COMPANY]);
    expect(s.data[COMPANY]).toBe('{}');
  });

  it('ignores a key that is not a shop setting', () => {
    const s = fakeStore();
    writeLocalShop(s, { coldgauge_jobs_v2: entry('{}', '2026-06-01T00:00:00Z') });
    expect(s.data.coldgauge_jobs_v2).toBeUndefined();
  });
});
