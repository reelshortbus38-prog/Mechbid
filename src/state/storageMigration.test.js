import { describe, it, expect } from 'vitest';
import { migrateStorageKeys, KEY_MIGRATIONS } from './storageMigration.js';

// A localStorage stand-in, so this is testable without a browser.
function fakeStore(initial = {}, { throwOn = null } = {}) {
  const data = { ...initial };
  return {
    data,
    getItem(k) { if (k === throwOn) throw new Error('storage disabled'); return k in data ? data[k] : null; },
    setItem(k, v) { if (k === throwOn) throw new Error('storage disabled'); data[k] = v; },
  };
}

describe('carrying data through the rename', () => {
  it('moves a saved job to the new key', () => {
    const s = fakeStore({ mechbid_jobs_v2: '{"job1":{}}' });
    expect(migrateStorageKeys(s)).toContain('coldgauge_jobs_v2');
    expect(s.data.coldgauge_jobs_v2).toBe('{"job1":{}}');
  });

  it('leaves the old key in place — a rename must not destroy anything', () => {
    const s = fakeStore({ mechbid_jobs_v2: '{"job1":{}}' });
    migrateStorageKeys(s);
    expect(s.data.mechbid_jobs_v2).toBe('{"job1":{}}');
  });

  it('NEVER overwrites data already under the new key', () => {
    // A browser used since the rename has current data, and it wins.
    const s = fakeStore({ mechbid_jobs_v2: '{"old":{}}', coldgauge_jobs_v2: '{"current":{}}' });
    expect(migrateStorageKeys(s)).toEqual([]);
    expect(s.data.coldgauge_jobs_v2).toBe('{"current":{}}');
  });

  it('does nothing on a browser that never used the old name', () => {
    const s = fakeStore({});
    expect(migrateStorageKeys(s)).toEqual([]);
    expect(Object.keys(s.data)).toEqual([]);
  });

  it('treats an empty string as nothing to move', () => {
    const s = fakeStore({ mechbid_jobs_v2: '' });
    expect(migrateStorageKeys(s)).toEqual([]);
  });

  it('moves every key the app writes, not just the jobs', () => {
    const s = fakeStore(Object.fromEntries(KEY_MIGRATIONS.map(([from]) => [from, 'x'])));
    expect(migrateStorageKeys(s).sort()).toEqual(KEY_MIGRATIONS.map(([, to]) => to).sort());
  });

  it('covers the company profile and the price book, which are the expensive ones', () => {
    // Jobs can be re-entered. A tuned price book is months of corrections.
    const keys = KEY_MIGRATIONS.map(([, to]) => to);
    expect(keys).toContain('coldgauge_company_v1');
    expect(keys).toContain('coldgauge_pricebook_v1');
  });

  it('survives a browser with storage disabled instead of taking the app down', () => {
    const s = fakeStore({ mechbid_jobs_v2: 'x' }, { throwOn: 'mechbid_jobs_v2' });
    expect(() => migrateStorageKeys(s)).not.toThrow();
  });

  it('keeps migrating after one key throws', () => {
    const s = fakeStore(
      { mechbid_jobs_v2: 'a', mechbid_company_v1: 'b' },
      { throwOn: 'mechbid_jobs_v2' },
    );
    expect(migrateStorageKeys(s)).toContain('coldgauge_company_v1');
  });

  it('every pair renames only the prefix, so nothing is silently re-keyed', () => {
    for (const [from, to] of KEY_MIGRATIONS) {
      expect(from.replace(/^mechbid_/, '')).toBe(to.replace(/^coldgauge_/, ''));
    }
  });
});
