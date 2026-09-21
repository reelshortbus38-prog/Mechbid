import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { filesToAnalyze, fileStatusOf, isAnalyzed, analyzedFiles } from './analyzeQueue.js';
import { reducer, initialState } from '../state/store.js';

// ── THE BUG, AS REPORTED ─────────────────────────────────────────────────────
// "if you want to go back and upload a file and analyze it it seems to want to
//  analyze all the other files it already did"
//
// The filter was right and the thing it read was wrong. `fileStatuses` was
// useState, so "done" lived exactly as long as the Setup step stayed mounted:
// step over to Circuits and back, reload, reopen tomorrow, open the job on the
// iPad instead of the laptop — and every file was 'ready' again.

const F = (id, extra = {}) => ({ id, name: `${id}.pdf`, mode: 'Commercial Refrigeration', ...extra });
const MODE = 'Commercial Refrigeration';

describe('what still needs analyzing', () => {
  it('skips a file this session already read', () => {
    const files = [F('a'), F('b')];
    expect(filesToAnalyze(files, MODE, { a: 'done' }).map(f => f.id)).toEqual(['b']);
  });

  // ── THE FIX ───────────────────────────────────────────────────────────────
  // The mark is on the FILE, in the job, which is saved and synced. An empty
  // status map is exactly what a remount, a reload, or another device sees.
  it('still skips it when the session has forgotten everything', () => {
    const files = [F('a', { analyzedAt: '2026-09-21T18:00:00Z' }), F('b')];
    expect(filesToAnalyze(files, MODE, {}).map(f => f.id)).toEqual(['b']);
  });

  it('reads NOTHING when a reload follows a completed analysis', () => {
    // The whole report in one assertion: upload two, analyze, come back later,
    // and pressing the button must not put the plan set through vision again.
    const files = [F('a', { analyzedAt: 'x' }), F('b', { analyzedAt: 'y' })];
    expect(filesToAnalyze(files, MODE, {})).toEqual([]);
  });

  it('leaves the other trade alone', () => {
    const files = [F('a'), F('h', { mode: 'Commercial HVAC' })];
    expect(filesToAnalyze(files, MODE, {}).map(f => f.id)).toEqual(['a']);
  });

  it('survives junk in the list', () => {
    expect(filesToAnalyze([null, undefined, F('a')], MODE, {}).map(f => f.id)).toEqual(['a']);
    expect(filesToAnalyze(undefined, MODE, {})).toEqual([]);
  });
});

describe('the status a file shows', () => {
  it('prefers this run, which knows about analyzing and errors', () => {
    // 'analyzing' and 'error' are facts about the run in progress and must not
    // be masked by a stored mark from an earlier one.
    const f = F('a', { analyzedAt: 'x' });
    expect(fileStatusOf(f, { a: 'analyzing' })).toBe('analyzing');
    expect(fileStatusOf(f, { a: 'error' })).toBe('error');
  });

  it('falls back to the stored mark once the run is over', () => {
    expect(fileStatusOf(F('a', { analyzedAt: 'x' }), {})).toBe('done');
    expect(fileStatusOf(F('a'), {})).toBe('ready');
  });

  it('reports what has been read, for telling somebody what a re-run redoes', () => {
    const files = [F('a', { analyzedAt: 'x' }), F('b'), F('c')];
    expect(analyzedFiles(files, MODE, { c: 'done' }).map(f => f.id)).toEqual(['a', 'c']);
    expect(isAnalyzed(F('b'), {})).toBe(false);
  });
});

describe('remembering and forgetting, in the job', () => {
  const start = { ...initialState, uploadedFiles: [F('a'), F('b'), F('h', { mode: 'Commercial HVAC' })] };

  it('marks one file without touching the others', () => {
    const s = reducer(start, { type: 'MARK_FILE_ANALYZED', id: 'a', at: 'T' });
    expect(s.uploadedFiles.find(f => f.id === 'a').analyzedAt).toBe('T');
    expect(s.uploadedFiles.find(f => f.id === 'b').analyzedAt).toBeUndefined();
  });

  it('stamps a time when none is given, so the mark is never a bare true', () => {
    const s = reducer(start, { type: 'MARK_FILE_ANALYZED', id: 'a' });
    expect(Date.parse(s.uploadedFiles.find(f => f.id === 'a').analyzedAt)).not.toBeNaN();
  });

  // ── IT HAS TO STAY RE-RUNNABLE ────────────────────────────────────────────
  // Re-analysis is sometimes the point. The Materials step tells an estimator
  // to switch a job to CO₂ "and re-analyze" in as many words, so a skip that
  // could not be undone would break that instruction.
  it('puts one file back in the queue', () => {
    let s = reducer(start, { type: 'MARK_FILE_ANALYZED', id: 'a' });
    s = reducer(s, { type: 'CLEAR_FILE_ANALYZED', id: 'a' });
    expect(filesToAnalyze(s.uploadedFiles, MODE, {}).map(f => f.id)).toEqual(['a', 'b']);
    expect('analyzedAt' in s.uploadedFiles.find(f => f.id === 'a')).toBe(false);
  });

  it('puts a whole trade back without touching the other one', () => {
    let s = start;
    for (const id of ['a', 'b', 'h']) s = reducer(s, { type: 'MARK_FILE_ANALYZED', id });
    s = reducer(s, { type: 'CLEAR_FILE_ANALYZED', mode: MODE });
    expect(filesToAnalyze(s.uploadedFiles, MODE, {}).map(f => f.id)).toEqual(['a', 'b']);
    expect(filesToAnalyze(s.uploadedFiles, 'Commercial HVAC', {})).toEqual([]);
  });
});

// The queue and the button have to agree. A button that is enabled over a set
// where everything is already done spins and does nothing, which reads as the
// app being broken rather than as the work being finished.
describe('the Setup step uses it', () => {
  const src = readFileSync(new URL('../steps/Step1_Setup.jsx', import.meta.url), 'utf8');

  it('builds the analyze queue from the shared filter', () => {
    expect(src).toMatch(/const modeFiles = filesToAnalyze\(state\.uploadedFiles, state\.mode, fileStatuses\)/);
    expect(src, 'the old session-only filter is back')
      .not.toMatch(/fileStatuses\[f\.id\] !== 'done'\)/);
  });

  it('records the mark when a file is read', () => {
    expect(src).toMatch(/MARK_FILE_ANALYZED/);
  });

  it('gates the button on what is left to read, not on what was uploaded', () => {
    expect(src).toMatch(/const hasFiles = pendingFiles\.length > 0/);
  });

  it('offers a way back', () => {
    expect(src).toMatch(/CLEAR_FILE_ANALYZED/);
    expect(src).toMatch(/Re-analyze everything/);
  });

  it('shows the list the stored status, not only this session\'s', () => {
    expect(src).toMatch(/<FileList fileStatuses=\{shownStatuses\}/);
  });
});
