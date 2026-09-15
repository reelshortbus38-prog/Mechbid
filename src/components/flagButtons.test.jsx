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
  { id: 'f_legend', name: 'Legend 2417.xlsx' },
  { id: 'f_plans', name: 'Store plan.pdf' },
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
