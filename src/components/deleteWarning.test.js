import { describe, it, expect } from 'vitest';
import { deleteWarning } from './deleteWarning.js';

const job = (extra = {}) => ({ id: 'j1', name: 'Food Lion 2417', data: {}, ...extra });

describe('deleteWarning', () => {
  it('names the job, because store numbers look alike in a list', () => {
    expect(deleteWarning(job())).toContain('Food Lion 2417');
  });

  it('falls back to the project name, then to something honest', () => {
    expect(deleteWarning(job({ name: '', data: { projName: 'Store 47' } }))).toContain('Store 47');
    expect(deleteWarning(job({ name: '  ', data: {} }))).toContain('this untitled job');
    expect(deleteWarning(undefined)).toContain('this untitled job');
  });

  it('counts the drawings that go with it', () => {
    const files = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(deleteWarning(job({ data: { uploadedFiles: files } }))).toContain('3 uploaded files');
  });

  it('says file, not files, for one', () => {
    const w = deleteWarning(job({ data: { uploadedFiles: [{ id: 'a' }] } }));
    expect(w).toContain('1 uploaded file goes with it');
    expect(w).not.toContain('files');
  });

  it('does not mention files when there are none', () => {
    expect(deleteWarning(job())).not.toContain('uploaded');
    // A row with no id was never stored anywhere, so it is not a file to lose.
    expect(deleteWarning(job({ data: { uploadedFiles: [{ id: '' }, null] } }))).not.toContain('uploaded');
  });

  it('warns about the other devices only when signed in', () => {
    expect(deleteWarning(job(), { signedIn: true })).toContain('other devices');
  });

  it('does not claim a reach it does not have when signed out', () => {
    const w = deleteWarning(job());
    expect(w).not.toContain('other devices');
    expect(w).toContain('not signed in');
  });

  it('always says it cannot be undone, because there is no trash', () => {
    expect(deleteWarning(job())).toContain('cannot be undone');
    expect(deleteWarning(job(), { signedIn: true })).toContain('cannot be undone');
  });
});
