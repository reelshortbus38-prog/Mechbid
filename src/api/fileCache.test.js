import { describe, it, expect, beforeEach } from 'vitest';
import { rememberFile, getCachedFile, hasCachedFile, clearFileCache } from './fileCache.js';

const fakeFile = name => ({ name, size: 1234 });

describe('fileCache', () => {
  beforeEach(clearFileCache);

  it('holds an uploaded file for the session', () => {
    rememberFile(fakeFile('Drawings_5.pdf'));
    expect(hasCachedFile('Drawings_5.pdf')).toBe(true);
    expect(getCachedFile('Drawings_5.pdf').size).toBe(1234);
  });

  it('reports honestly when a file was never loaded', () => {
    expect(hasCachedFile('nothing.pdf')).toBe(false);
    expect(getCachedFile('nothing.pdf')).toBeNull();
  });

  it('ignores junk rather than storing an unusable entry', () => {
    rememberFile(null);
    rememberFile({});
    expect(hasCachedFile('')).toBe(false);
  });

  it('replaces a re-uploaded file of the same name', () => {
    rememberFile({ name: 'set.pdf', size: 1 });
    rememberFile({ name: 'set.pdf', size: 2 });
    expect(getCachedFile('set.pdf').size).toBe(2);
  });
});
