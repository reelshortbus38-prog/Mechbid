import { describe, it, expect } from 'vitest';
import { parseAIJson, isSpecPage } from './ai.js';

// Per-page routing for mechanical-set PDFs: dense general-notes / spec pages
// go to the text analyzer, sparse drawing sheets go to vision. Mirrors the
// real 5-page mechanical set that was failing (p2 = 5.7k-char notes → text;
// p1/p3/p4/p5 = sparse sheets → vision).
describe('isSpecPage', () => {
  const notes = 'GENERAL MECHANICAL NOTES. ' + Array(30).fill(
    'The contractor shall provide a minimum of insulation per the approved drawings and comply with SMACNA.'
  ).join(' ');

  it('routes a dense general-notes page to text', () => {
    expect(notes.length).toBeGreaterThan(1800);
    expect(isSpecPage(notes)).toBe(true);
  });

  it('routes sparse drawing-sheet label text to vision', () => {
    expect(isSpecPage('CD-1 8" 100 CFM  24x12 duct  RG-1', false)).toBe(false);
    expect(isSpecPage('HVAC SCHEDULE', false)).toBe(false);
    expect(isSpecPage('', false)).toBe(false);
  });

  it('never treats a scaled drawing page as a spec, however dense', () => {
    expect(isSpecPage(notes, true)).toBe(false);
  });

  it('needs real spec verbs, not just length', () => {
    const longButNotSpec = Array(400).fill('duct diffuser grille tag').join(' ');
    expect(longButNotSpec.length).toBeGreaterThan(1800);
    expect(isSpecPage(longButNotSpec)).toBe(false);
  });
});

// Guards the truncated-JSON salvage: a dense scope chunk can overrun the
// output-token cap and get cut off mid-object. Rather than lose every task in
// the chunk, parseAIJson closes the JSON at the last completed element.

describe('parseAIJson', () => {
  it('parses clean JSON, stripping markdown fences', () => {
    expect(parseAIJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseAIJson('prose before {"fieldTasks":[]} prose after')).toEqual({ fieldTasks: [] });
  });

  it('salvages completed array elements when the response is cut off mid-object', () => {
    const truncated = '{"fieldTasks":[{"desc":"remove case A6"},{"desc":"pipe header D"},{"desc":"install evap for produce li';
    const r = parseAIJson(truncated);
    expect(r).not.toBeNull();
    expect(r.fieldTasks).toHaveLength(2);
    expect(r.fieldTasks[1].desc).toBe('pipe header D');
  });

  it('salvages when cut off mid-string inside a value', () => {
    const truncated = '{"rackTasks":[{"rack":"A","desc":"replace oil separator float"},{"rack":"D","desc":"reclaim coil pip';
    const r = parseAIJson(truncated);
    expect(r.rackTasks).toHaveLength(1);
    expect(r.rackTasks[0].rack).toBe('A');
  });

  it('keeps earlier keys when a later array is truncated', () => {
    const truncated = '{"documentType":"scope","fieldTasks":[{"desc":"a"}],"parts":[{"partId":"CPC-1","qty":2},{"partId":"X';
    const r = parseAIJson(truncated);
    expect(r.documentType).toBe('scope');
    expect(r.fieldTasks).toHaveLength(1);
    expect(r.parts).toHaveLength(1);
  });

  it('returns null when nothing usable closed', () => {
    expect(parseAIJson('not json at all')).toBeNull();
    expect(parseAIJson('{"desc":"unterminated')).toBeNull();
  });
});
