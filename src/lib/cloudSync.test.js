import { describe, it, expect } from 'vitest';
import { mergeJobMaps, rowToJob, jobToRow } from './cloudSync.js';

// The merge is the load-bearing bit — it decides, when a user's local jobs and
// their cloud jobs disagree, which version each job ends up as and what has to
// be written where. Getting this wrong loses a bid. Pure, no network.

const job = (id, ts, extra = {}) => ({ id, name: id, mode: 'Commercial Refrigeration', lastEdited: ts, data: { projName: id }, ...extra });

describe('mergeJobMaps', () => {
  it('keeps jobs that exist on only one side', () => {
    const local = { a: job('a', '2024-01-01') };
    const cloud = { b: job('b', '2024-01-01') };
    const { merged, toPush, toLocal } = mergeJobMaps(local, cloud);
    expect(Object.keys(merged).sort()).toEqual(['a', 'b']);
    expect(toPush).toEqual(['a']);   // local-only → push up
    expect(toLocal).toEqual(['b']);  // cloud-only → write down
  });

  it('newest lastEdited wins on a conflict', () => {
    const local = { a: job('a', '2024-06-01', { name: 'local-newer' }) };
    const cloud = { a: job('a', '2024-01-01', { name: 'cloud-older' }) };
    const { merged, toPush, toLocal } = mergeJobMaps(local, cloud);
    expect(merged.a.name).toBe('local-newer');
    expect(toPush).toEqual(['a']);
    expect(toLocal).toEqual([]);
  });

  it('cloud wins when it is newer', () => {
    const local = { a: job('a', '2024-01-01') };
    const cloud = { a: job('a', '2024-06-01', { name: 'cloud-newer' }) };
    const { merged, toLocal, toPush } = mergeJobMaps(local, cloud);
    expect(merged.a.name).toBe('cloud-newer');
    expect(toLocal).toEqual(['a']);
    expect(toPush).toEqual([]);
  });

  it('identical timestamps keep local and push nothing', () => {
    const local = { a: job('a', '2024-01-01', { name: 'L' }) };
    const cloud = { a: job('a', '2024-01-01', { name: 'C' }) };
    const { merged, toPush, toLocal } = mergeJobMaps(local, cloud);
    expect(merged.a.name).toBe('L');
    expect(toPush).toEqual([]);
    expect(toLocal).toEqual([]);
  });

  it('handles empty sides', () => {
    expect(mergeJobMaps({}, {}).merged).toEqual({});
    expect(mergeJobMaps({ a: job('a', '2024-01-01') }, {}).toPush).toEqual(['a']);
    expect(mergeJobMaps({}, { a: job('a', '2024-01-01') }).toLocal).toEqual(['a']);
  });
});

describe('row <-> job conversion round-trips', () => {
  it('jobToRow stamps user_id and carries the data', () => {
    const row = jobToRow(job('x', '2024-03-03'), 'user-1');
    expect(row.id).toBe('x');
    expect(row.user_id).toBe('user-1');
    expect(row.data.projName).toBe('x');
    expect(row.updated_at).toBe('2024-03-03');
  });

  it('rowToJob restores the local shape', () => {
    const j = rowToJob({ id: 'x', name: 'Store 47', mode: 'Commercial Refrigeration', data: { projName: 'Store 47' }, updated_at: '2024-03-03' });
    expect(j.id).toBe('x');
    expect(j.lastEdited).toBe('2024-03-03');
    expect(j.data.projName).toBe('Store 47');
  });
});

// ── DELETES HAVE TO STICK ───────────────────────────────────────────────────
// Reported from the field: deleted every old job on the iPad, signed in on a
// phone that still had them, and every one came back — then came back on the
// iPad too. An absence cannot be told apart from a deletion, so a deletion had
// to become something that travels.
describe('mergeJobMaps — tombstones', () => {
  const job = (id, at) => ({ id, name: id, lastEdited: at, data: {} });
  const stone = (id, at) => ({ id, deleted: true, deletedAt: at });

  it('a deletion removes the local copy instead of pushing it back', () => {
    const r = mergeJobMaps(
      { a: job('a', '2026-09-01T00:00:00Z') },
      { a: stone('a', '2026-09-02T00:00:00Z') },
    );
    expect(r.merged.a).toBeUndefined();
    expect(r.toDelete).toEqual(['a']);
    expect(r.toPush).toEqual([]);
  });

  it('does not resurrect a job this device never had', () => {
    const r = mergeJobMaps({}, { a: stone('a', '2026-09-02T00:00:00Z') });
    expect(r.merged.a).toBeUndefined();
    expect(r.toDelete).toEqual([]);
    expect(r.toLocal).toEqual([]);
  });

  it('keeps work done AFTER the delete, rather than throwing it away', () => {
    // Somebody is actively in that job. Losing their afternoon to a delete
    // they never saw is worse than a job reappearing.
    const r = mergeJobMaps(
      { a: job('a', '2026-09-03T00:00:00Z') },
      { a: stone('a', '2026-09-02T00:00:00Z') },
    );
    expect(r.merged.a).toMatchObject({ id: 'a' });
    expect(r.toPush).toEqual(['a']);
    expect(r.toDelete).toEqual([]);
  });

  it('leaves every other job alone', () => {
    const r = mergeJobMaps(
      { a: job('a', '2026-09-01T00:00:00Z'), b: job('b', '2026-09-01T00:00:00Z') },
      { a: stone('a', '2026-09-02T00:00:00Z') },
    );
    expect(Object.keys(r.merged)).toEqual(['b']);
    expect(r.toPush).toEqual(['b']);
  });

  it('still merges normally when nothing is deleted', () => {
    const r = mergeJobMaps(
      { a: job('a', '2026-09-01T00:00:00Z') },
      { b: job('b', '2026-09-01T00:00:00Z') },
    );
    expect(Object.keys(r.merged).sort()).toEqual(['a', 'b']);
    expect(r.toPush).toEqual(['a']);
    expect(r.toLocal).toEqual(['b']);
    expect(r.toDelete).toEqual([]);
  });
});

describe('rowToJob — a soft-deleted row is not a job', () => {
  it('reads it as a tombstone carrying no data', () => {
    const t = rowToJob({ id: 'a', deleted_at: '2026-09-02T00:00:00Z', data: { secret: 1 } });
    expect(t).toEqual({ id: 'a', deletedAt: '2026-09-02T00:00:00Z', deleted: true });
  });

  it('reads an ordinary row as a job', () => {
    const j = rowToJob({ id: 'a', name: 'Food Lion', updated_at: '2026-09-01T00:00:00Z', data: { x: 1 } });
    expect(j).toMatchObject({ id: 'a', name: 'Food Lion', data: { x: 1 } });
    expect(j.deleted).toBeFalsy();
  });
});
