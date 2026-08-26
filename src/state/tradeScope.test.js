import { describe, it, expect } from 'vitest';
import {
  belongsToMode, forMode, stampMode, resultText,
  REFRIGERATION, COMMERCIAL_HVAC,
} from './tradeScope.js';

describe('what belongs to a mode', () => {
  it('keeps a record stamped with the current mode', () => {
    expect(belongsToMode({ mode: COMMERCIAL_HVAC }, COMMERCIAL_HVAC)).toBe(true);
  });

  it('drops a record stamped with the other mode', () => {
    expect(belongsToMode({ mode: REFRIGERATION }, COMMERCIAL_HVAC)).toBe(false);
  });

  it('KEEPS an unstamped record in every mode', () => {
    // The safety rule. Everything saved before trade scoping has no stamp, and
    // hiding an estimator's own line is worse than showing it in both places.
    expect(belongsToMode({ desc: 'Set 4 cases' }, COMMERCIAL_HVAC)).toBe(true);
    expect(belongsToMode({ desc: 'Set 4 cases' }, REFRIGERATION)).toBe(true);
  });

  it('treats an empty-string mode as unstamped rather than as a real mode', () => {
    expect(belongsToMode({ mode: '' }, COMMERCIAL_HVAC)).toBe(true);
  });

  it('keeps legacy log strings, which never had a stamp', () => {
    expect(belongsToMode('📗 sheet.pdf: analyzed', COMMERCIAL_HVAC)).toBe(true);
  });

  it('drops null so a bad row cannot be counted', () => {
    expect(belongsToMode(null, COMMERCIAL_HVAC)).toBe(false);
    expect(belongsToMode(undefined, COMMERCIAL_HVAC)).toBe(false);
  });
});

describe('filtering a list', () => {
  const tasks = [
    { id: 1, desc: 'Case move', mode: REFRIGERATION },
    { id: 2, desc: 'VAV startup', mode: COMMERCIAL_HVAC },
    { id: 3, desc: 'Hand-entered before scoping' },
  ];

  it('an HVAC job does not carry the refrigeration task', () => {
    // This is the money bug: a refrigeration case-move billed into an HVAC bid.
    expect(forMode(tasks, COMMERCIAL_HVAC).map(t => t.id)).toEqual([2, 3]);
  });

  it('a refrigeration job does not carry the HVAC task', () => {
    expect(forMode(tasks, REFRIGERATION).map(t => t.id)).toEqual([1, 3]);
  });

  it('survives an empty or missing list', () => {
    expect(forMode([], REFRIGERATION)).toEqual([]);
    expect(forMode(undefined, REFRIGERATION)).toEqual([]);
  });

  it('never invents or drops a stamped record between the two modes', () => {
    const both = forMode(tasks, REFRIGERATION).length + forMode(tasks, COMMERCIAL_HVAC).length;
    // Each stamped task appears once; the unstamped one appears in both.
    expect(both).toBe(tasks.length + 1);
  });
});

describe('stamping records as they are created', () => {
  it('stamps an object', () => {
    expect(stampMode([{ desc: 'x' }], REFRIGERATION)).toEqual([{ desc: 'x', mode: REFRIGERATION }]);
  });

  it('does not overwrite a stamp already present', () => {
    const out = stampMode([{ desc: 'x', mode: COMMERCIAL_HVAC }], REFRIGERATION);
    expect(out[0].mode).toBe(COMMERCIAL_HVAC);
  });

  it('wraps a bare string into the stamped log shape', () => {
    expect(stampMode(['analyzed'], REFRIGERATION)).toEqual([{ text: 'analyzed', mode: REFRIGERATION }]);
  });

  it('does not mutate the input', () => {
    const src = [{ desc: 'x' }];
    stampMode(src, REFRIGERATION);
    expect(src[0].mode).toBeUndefined();
  });
});

describe('reading the extraction log through both shapes', () => {
  it('reads a legacy string', () => {
    expect(resultText('📗 sheet.pdf: analyzed')).toBe('📗 sheet.pdf: analyzed');
  });

  it('reads a stamped entry', () => {
    expect(resultText({ text: '📗 sheet.pdf', mode: REFRIGERATION })).toBe('📗 sheet.pdf');
  });

  it('returns a string for junk rather than letting an object reach the DOM', () => {
    // React throws on a raw object child; the log must never be able to do that.
    expect(resultText(null)).toBe('');
    expect(resultText({})).toBe('');
  });
});
