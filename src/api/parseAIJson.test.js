import { describe, it, expect } from 'vitest';
import { parseAIJson } from './ai.js';

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
