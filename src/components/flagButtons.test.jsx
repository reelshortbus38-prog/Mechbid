import { describe, it, expect, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StateProvider } from '../state/StateProvider.jsx';
import { initialState } from '../state/store.js';
import { Flag } from './UI.jsx';
import { _seedIndex, fileIdFor, clearFileCache } from '../api/fileCache.js';

// ── DRAWN IS NOT CONNECTED ───────────────────────────────────────────────────
// scheduleRows.js can be right about every row and still reach nobody: the
// button has to appear on the flag, and only when the workbook is actually on
// the device. Both halves are asserted against the real Flag component.

const FILES = [
  { id: 'f_legend', name: 'Legend 2417.xlsx', type: 'excel' },
  { id: 'f_plans', name: 'Store plan.pdf', type: 'pdf' },
];

const html = flag => renderToStaticMarkup(
  <StateProvider initial={{ ...initialState, uploadedFiles: FILES }}>
    <Flag flag={flag} />
  </StateProvider>,
);

const BPR_FLAG = {
  type: 'warn', source: 'Legend 2417.xlsx',
  text: '2 circuit(s) are marked as changed but have NO new line sizes — Dairy 4-door; Meat Prep.',
  circuits: ['B11', 'C6'],
};

const PAGE_FLAG = {
  type: 'warn', source: 'Store plan.pdf', page: 5,
  text: 'PROVIDE NEW 3/4" COPPER TO CASE END — FIELD VERIFY ROUTING.',
};

beforeEach(() => {
  clearFileCache();
});

describe('a refrigeration schedule flag offers to open the row', () => {
  it('shows the button once the workbook is on the device', () => {
    _seedIndex(fileIdFor(FILES, 'Legend 2417.xlsx'), { name: 'Legend 2417.xlsx' });
    expect(html(BPR_FLAG)).toContain('Show me on the schedule');
  });

  it('shows nothing when the workbook is gone — a button that opens nothing is worse', () => {
    expect(html(BPR_FLAG)).not.toContain('Show me on the schedule');
  });

  it('shows nothing when the flag names no circuits', () => {
    _seedIndex(fileIdFor(FILES, 'Legend 2417.xlsx'), { name: 'Legend 2417.xlsx' });
    const { circuits, ...bare } = BPR_FLAG;
    expect(html(bare)).not.toContain('Show me on the schedule');
  });
});

describe('the print and the schedule are different buttons', () => {
  it('a page flag offers the page, not the schedule', () => {
    _seedIndex(fileIdFor(FILES, 'Store plan.pdf'), { name: 'Store plan.pdf' });
    const out = html(PAGE_FLAG);
    expect(out).toContain('Show me on page 5');
    expect(out).not.toContain('Show me on the schedule');
  });

  it('a row flag offers the schedule, not a page', () => {
    _seedIndex(fileIdFor(FILES, 'Legend 2417.xlsx'), { name: 'Legend 2417.xlsx' });
    const out = html(BPR_FLAG);
    expect(out).toContain('Show me on the schedule');
    expect(out).not.toContain('Show me on page');
  });

  it('a flag that names both gets both', () => {
    _seedIndex(fileIdFor(FILES, 'Store plan.pdf'), { name: 'Store plan.pdf' });
    const out = html({ ...PAGE_FLAG, circuits: ['B11'] });
    expect(out).toContain('Show me on page 5');
    expect(out).toContain('Show me on the schedule');
  });
});

describe('the flag still reads as a flag', () => {
  it('keeps its wording and its source line', () => {
    _seedIndex(fileIdFor(FILES, 'Legend 2417.xlsx'), { name: 'Legend 2417.xlsx' });
    const out = html(BPR_FLAG);
    expect(out).toContain('Legend 2417.xlsx');
    expect(out).toContain('marked as changed but have NO new line sizes');
  });

  it('renders with no cached files at all rather than throwing', () => {
    expect(() => html({ type: 'info', text: 'Nothing to verify', source: 'System' })).not.toThrow();
  });
});

// ── THE FINDINGS WITH NO ROW TO POINT AT ─────────────────────────────────────
// "This BPR uses 3 different highlight colours", "4 rows looked like a circuit
// but had no readable circuit ID". The last one cannot name a row by
// definition. They still say go and check the schedule, and on an iPad that
// still means leaving the app to find the file.
//
// Different button, different word: "Show me on the schedule" promises a row
// and must deliver one; "Open the schedule" promises the document. An estimator
// has to be able to tell which he is about to get, or the specific one stops
// being trusted.

const SHEET_FLAG = {
  type: 'warn', source: 'Legend 2417.xlsx',
  text: 'This BPR uses 2 different highlight colours on the line-size cells. All of them were counted as new work.',
};

describe('a whole-sheet BPR flag opens the workbook', () => {
  beforeEach(() => {
    _seedIndex(fileIdFor(FILES, 'Legend 2417.xlsx'), { name: 'Legend 2417.xlsx' });
  });

  it('offers the document, not a row', () => {
    const out = html(SHEET_FLAG);
    expect(out).toContain('Open the schedule');
    expect(out).not.toContain('Show me on the schedule');
  });

  it('never offers both — two buttons onto one document is a choice nobody wants', () => {
    const out = html(BPR_FLAG);
    expect(out).toContain('Show me on the schedule');
    expect(out).not.toContain('Open the schedule');
  });

  it('stays off an info flag, which is reporting rather than asking', () => {
    expect(html({ ...SHEET_FLAG, type: 'info' })).not.toContain('Open the schedule');
  });

  it('appears on an error as well as a warning', () => {
    expect(html({ ...SHEET_FLAG, type: 'error' })).toContain('Open the schedule');
  });

  it('stays off a PDF — there is no workbook to open', () => {
    _seedIndex(fileIdFor(FILES, 'Store plan.pdf'), { name: 'Store plan.pdf' });
    expect(html({ type: 'warn', source: 'Store plan.pdf', text: 'Sheet is unreadable' }))
      .not.toContain('Open the schedule');
  });
});

describe('a whole-sheet flag with the workbook gone', () => {
  it('offers nothing', () => {
    expect(html(SHEET_FLAG)).not.toContain('Open the schedule');
  });
});
