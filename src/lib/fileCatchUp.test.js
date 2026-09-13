import { describe, it, expect } from 'vitest';
import { catchUpPlan, runCatchUp } from './fileCatchUp.js';
import { CLOUD_MAX } from '../steps/uploadLimits.js';

const mb = n => n * 1024 * 1024;
const entry = (id, size = 1000) => [id, { name: `${id}.pdf`, size, savedAt: 1 }];

describe('catchUpPlan', () => {
  it('names what this device holds and the cloud does not', () => {
    const plan = catchUpPlan([entry('a'), entry('b'), entry('c')], new Set(['b']));
    expect(plan.upload).toEqual(['a', 'c']);
  });

  it('is empty when the cloud already has everything', () => {
    expect(catchUpPlan([entry('a')], new Set(['a'])).upload).toEqual([]);
  });

  it('is everything when nothing was ever uploaded — the pre-sign-in job', () => {
    // Built the bid, priced it, signed in afterwards. This is the common one.
    expect(catchUpPlan([entry('a'), entry('b')], new Set()).upload).toEqual(['a', 'b']);
  });

  it('holds back files over the cloud ceiling instead of failing forever', () => {
    // The upload screen already told him a 90 MB set stays on this device.
    // Retrying it on every single sign-in would burn his data for a refusal
    // the app has already explained.
    const plan = catchUpPlan([entry('big', mb(90)), entry('ok', mb(10))], new Set());
    expect(plan.upload).toEqual(['ok']);
    expect(plan.tooBig).toEqual(['big']);
  });

  it('measures against the real Supabase ceiling', () => {
    expect(catchUpPlan([entry('x', CLOUD_MAX)], new Set()).upload).toEqual(['x']);
    expect(catchUpPlan([entry('x', CLOUD_MAX + 1)], new Set()).tooBig).toEqual(['x']);
  });

  it('takes a plain array as well as a Set', () => {
    expect(catchUpPlan([entry('a'), entry('b')], ['a']).upload).toEqual(['b']);
  });

  it('is empty rather than broken on junk', () => {
    expect(catchUpPlan([], new Set()).upload).toEqual([]);
    expect(catchUpPlan(undefined, undefined).upload).toEqual([]);
    expect(catchUpPlan([['', { size: 1 }]], new Set()).upload).toEqual([]);
  });
});

describe('runCatchUp', () => {
  const ok = async () => ({ ok: true });

  it('uploads each missing file once, from the local copy', async () => {
    const sent = [];
    const r = await runCatchUp({
      cached: [entry('a'), entry('b')],
      inCloud: new Set(),
      load: async id => ({ name: `${id}.pdf`, size: 10 }),
      upload: async (id, f) => { sent.push([id, f.name]); return { ok: true }; },
    });
    expect(sent).toEqual([['a', 'a.pdf'], ['b', 'b.pdf']]);
    expect(r.uploaded).toBe(2);
  });

  it('does NOTHING when the listing failed, rather than guessing', async () => {
    // null is "could not tell what is up there". Treating it as an empty
    // bucket would push a plan set over cell service for no reason.
    let tried = 0;
    const r = await runCatchUp({
      cached: [entry('a')],
      inCloud: null,
      load: async () => ({ name: 'a.pdf' }),
      upload: async () => { tried++; return { ok: true }; },
    });
    expect(tried).toBe(0);
    expect(r).toEqual({ uploaded: 0, failed: 0, tooBig: 0 });
  });

  it('skips a file the device cannot actually produce', async () => {
    // In the index but evicted, or the database threw. There is nothing to
    // send, and that is not a failure to report.
    const r = await runCatchUp({
      cached: [entry('gone'), entry('here')],
      inCloud: new Set(),
      load: async id => (id === 'here' ? { name: 'here.pdf' } : null),
      upload: ok,
    });
    expect(r).toMatchObject({ uploaded: 1, failed: 0 });
  });

  it('counts a refused upload without stopping the rest', async () => {
    const r = await runCatchUp({
      cached: [entry('a'), entry('b'), entry('c')],
      inCloud: new Set(),
      load: async () => ({ name: 'x.pdf' }),
      upload: async id => (id === 'b' ? { ok: false, error: 'quota' } : { ok: true }),
    });
    expect(r).toMatchObject({ uploaded: 2, failed: 1 });
  });

  it('survives an upload that throws outright', async () => {
    const r = await runCatchUp({
      cached: [entry('a')],
      inCloud: new Set(),
      load: async () => ({ name: 'a.pdf' }),
      upload: async () => { throw new Error('offline'); },
    });
    expect(r).toMatchObject({ uploaded: 0, failed: 1 });
  });

  it('survives a load that throws', async () => {
    const r = await runCatchUp({
      cached: [entry('a')],
      inCloud: new Set(),
      load: async () => { throw new Error('idb'); },
      upload: ok,
    });
    expect(r).toMatchObject({ uploaded: 0, failed: 0 });
  });

  it('stops when asked — signed out part-way through', async () => {
    // The next person at this device is not necessarily the last, and a
    // half-finished catch-up must not go on pushing files to an account that
    // just signed out.
    let sent = 0;
    let stop = false;
    await runCatchUp({
      cached: [entry('a'), entry('b'), entry('c')],
      inCloud: new Set(),
      load: async () => ({ name: 'x.pdf' }),
      upload: async () => { sent++; stop = true; return { ok: true }; },
      shouldStop: () => stop,
    });
    expect(sent).toBe(1);
  });

  it('uploads one at a time, not all at once', async () => {
    // A background catch-up competes with an estimator pricing a job on the
    // same connection. Ten parallel plan sets make the app he is using feel
    // broken.
    let inFlight = 0, peak = 0;
    await runCatchUp({
      cached: [entry('a'), entry('b'), entry('c')],
      inCloud: new Set(),
      load: async () => ({ name: 'x.pdf' }),
      upload: async () => {
        inFlight++; peak = Math.max(peak, inFlight);
        await new Promise(r => setTimeout(r, 1));
        inFlight--; return { ok: true };
      },
    });
    expect(peak).toBe(1);
  });

  it('does nothing without the functions it needs', async () => {
    expect(await runCatchUp()).toEqual({ uploaded: 0, failed: 0, tooBig: 0 });
    expect(await runCatchUp({ cached: [entry('a')], inCloud: new Set() }))
      .toEqual({ uploaded: 0, failed: 0, tooBig: 0 });
  });

  it('reports what it held back, so the count is not silently short', async () => {
    const r = await runCatchUp({
      cached: [entry('big', mb(90))],
      inCloud: new Set(),
      load: async () => ({ name: 'big.pdf' }),
      upload: ok,
    });
    expect(r).toMatchObject({ uploaded: 0, tooBig: 1 });
  });
});
