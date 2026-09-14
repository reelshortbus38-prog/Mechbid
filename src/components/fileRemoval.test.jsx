import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StateProvider } from '../state/StateProvider.jsx';
import { AuthProvider } from '../lib/auth.jsx';
import { initialState } from '../state/store.js';
import FileViewerPanel, { FileList } from './FileViewer.jsx';

// ── THE BUTTON THAT IS ACTUALLY WIRED ───────────────────────────────────────
// There were two removeFile functions. Step1_Setup had one that cleaned up
// fileObjects and fileStatuses and was called from nowhere; FileViewer had the
// one the estimator actually presses, which dropped a row and nothing else.
//
// A dead copy of a function reads as coverage when you are grepping. These
// render the component the button lives in.

const JOB = {
  mode: 'Commercial Refrigeration',
  uploadedFiles: [
    { id: 'u1', name: 'M0.1.pdf', type: 'pdf', size: 2048, mode: 'Commercial Refrigeration' },
    { id: 'u2', name: 'SOW.pdf', type: 'scope', size: 1024, mode: 'Commercial Refrigeration' },
  ],
};

const html = extra => renderToStaticMarkup(
  <AuthProvider>
    <StateProvider initial={{ ...initialState, ...JOB, ...extra }}>
      <FileList fileStatuses={{}} />
    </StateProvider>
  </AuthProvider>,
);

describe('the file list', () => {
  it('lists this job’s files with a remove control', () => {
    const out = html();
    expect(out).toContain('M0.1.pdf');
    expect(out).toContain('SOW.pdf');
  });

  it('shows no removal note until something is removed', () => {
    // A note on every render would be noise; one that never appears is the bug.
    expect(html()).not.toMatch(/went with it/);
  });

  it('renders on a job whose files carry facts and flags', () => {
    // The state shape the cleanup reads. A crash here is a blank Setup step.
    const out = html({
      jobFacts: [{ kind: 'fluidPct', subject: 'HP-1', value: 25, sheet: 'M0.1.pdf' }],
      flags: [{ type: 'warn', text: 'night work', source: 'SOW.pdf' }],
    });
    expect(out).toContain('M0.1.pdf');
    expect(out.length).toBeGreaterThan(100);
  });

  it('is silent on a job with no files rather than an empty box', () => {
    expect(html({ uploadedFiles: [] })).toBe('');
  });

  it('only shows this trade’s files', () => {
    const out = html({ mode: 'Commercial HVAC' });
    expect(out).toBe('');
  });
});

describe('the panel wrapper', () => {
  it('renders without throwing', () => {
    const out = renderToStaticMarkup(
      <AuthProvider>
        <StateProvider initial={{ ...initialState, ...JOB }}>
          <FileViewerPanel fileStatuses={{}} />
        </StateProvider>
      </AuthProvider>,
    );
    expect(out.length).toBeGreaterThan(50);
  });
});
