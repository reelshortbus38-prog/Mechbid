import { useEffect, useState } from 'react';
import { useStore } from '../state/store.js';
import { colors } from '../styles/theme.js';
import { loadCachedFile, fileIdFor } from '../api/fileCache.js';
import { scheduleView, workbookView } from './scheduleRows.js';

// ── SCHEDULE PEEK ────────────────────────────────────────────────────────────
// SheetPeek's opposite number. That one opens the PRINT at the page a flag is
// about; this one opens the SCHEDULE at the row.
//
// The refrigeration side raised flags off the BPR that named circuits in prose
// — "B11; C6 are marked as changed but have NO new line sizes" — and then left
// the estimator to go and find them. A sixty-row legend, twenty-five columns
// wide, on an iPad. The HVAC flags had a button; these had a sentence.
//
// It is a table rather than a rendering of the spreadsheet, and deliberately:
// what the estimator needs is the row and its header, side by side and legible
// at arm's length. Reproducing the workbook's fonts and merged cells would be
// more faithful and much harder to read.
//
// WHAT IT WILL NOT DO is guess. If the circuit is not on any tab, it says so
// instead of showing the nearest row — see scheduleRows.js for why the match
// is exact.

export function SchedulePeek({ fileName, circuits = [], flagText = '', onClose }) {
  const [state, setState] = useState({ status: 'loading' });
  const { state: job } = useStore();
  const uploadedFiles = job.uploadedFiles || [];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const file = await loadCachedFile(fileIdFor(uploadedFiles, fileName));
      if (!file) {
        setState({ status: 'error', message: 'That file is no longer on this device — re-upload it to view the schedule.' });
        return;
      }
      try {
        // Lazy, same as pdf.js in SheetPeek: nobody who never opens a schedule
        // should pay for SheetJS in the initial bundle.
        const XLSX = await import('xlsx');
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const sheets = wb.SheetNames.map(name => ({
          name,
          grid: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', blankrows: true }),
        }));
        if (cancelled) return;
        // No circuits means the flag is about the sheet, not a row — the
        // workbook opens at the top of its fullest tab with nothing marked.
        const view = circuits.length ? scheduleView(sheets, circuits) : workbookView(sheets);
        setState(view
          ? { status: 'ready', view }
          : {
            status: 'error',
            message: circuits.length
              ? `Could not find ${circuits.join(', ')} in this workbook. The flag names ${circuits.length === 1 ? 'a circuit' : 'circuits'} `
                + 'that is not in the circuit-ID column of any tab — the schedule may have been edited since it was analyzed, '
                + 'or the row is on a file that was not uploaded.'
              : 'That workbook has no readable sheets.',
          });
      } catch (e) {
        if (!cancelled) setState({ status: 'error', message: e?.message || 'Could not open that schedule.' });
      }
    })();
    return () => { cancelled = true; };
  }, [fileName, circuits.join(','), flagText]);

  const view = state.view;
  const rows = [];
  if (view) {
    for (let i = view.from; i <= view.to; i += 1) rows.push(i);
  }
  const cellOf = (r, c) => {
    const v = view.grid[r]?.[c];
    return v === null || v === undefined ? '' : String(v);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.9)', display: 'flex', flexDirection: 'column', padding: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexShrink: 0 }}>
        <div style={{ fontSize: 12, color: colors.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {circuits.length ? circuits.join(', ') : 'Schedule'}
          <span style={{ color: colors.textDim, fontWeight: 400, marginLeft: 8 }}>{fileName}</span>
          {view && (view.wholeSheet ? (
            // Nothing is marked, and that has to be said. A table with no red
            // in it otherwise reads as "checked, nothing wrong" when what it
            // actually means is that this flag has no single row to point at.
            <span style={{ color: colors.yellow, fontWeight: 400, marginLeft: 8 }}>
              · tab “{view.sheetName}” · nothing marked — this flag is about the sheet, not one row
            </span>
          ) : (
            <span style={{ color: '#ff2d55', fontWeight: 400, marginLeft: 8 }}>
              · tab “{view.sheetName}” · {view.hits.length} row{view.hits.length === 1 ? '' : 's'} marked
              {view.missing.length > 0 && (
                <span style={{ color: colors.yellow }}>
                  {' '}· {view.missing.join(', ')} not on this tab
                </span>
              )}
            </span>
          ))}
        </div>
        <button
          onClick={onClose}
          style={{ marginLeft: 'auto', flexShrink: 0, background: colors.green, color: '#000', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >Close</button>
      </div>

      {/* What the flag said, kept on screen. The whole point is checking one
          against the other, and scrolling back to re-read the flag defeats it. */}
      {flagText && (
        <div style={{ flexShrink: 0, fontSize: 11, color: colors.textDim, lineHeight: 1.5, marginBottom: 8, padding: '8px 10px', borderRadius: 6, background: colors.panel, border: `1px solid ${colors.border}` }}>
          {flagText}
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: 8, background: colors.panel, position: 'relative' }}>
        {state.status === 'ready' ? (
          <table style={{ borderCollapse: 'collapse', fontSize: 11, fontFamily: "'DM Mono', monospace", minWidth: '100%' }}>
            {Number.isFinite(view.headerIdx) && view.headerIdx !== null && (
              <thead>
                <tr>
                  <th style={{ ...th, position: 'sticky', left: 0, zIndex: 2, background: colors.card2 }}>#</th>
                  {view.columns.map(c => (
                    <th key={c} style={th}>{cellOf(view.headerIdx, c)}</th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {rows.map(r => {
                const marked = view.hitRows.has(r);
                return (
                  <tr key={r} style={{ background: marked ? 'rgba(255,45,85,0.14)' : 'transparent' }}>
                    {/* The sheet's own row number, so what is on screen can be
                        found again in Excel rather than only here. Rows are
                        1-based there and 0-based in the grid. */}
                    <td style={{
                      ...td, position: 'sticky', left: 0, zIndex: 1,
                      background: marked ? '#3a1520' : colors.panel,
                      color: marked ? '#ff2d55' : colors.textDim, fontWeight: marked ? 700 : 400,
                    }}>{r + 1}</td>
                    {view.columns.map(c => (
                      <td key={c} style={{
                        ...td,
                        color: marked ? colors.text : colors.textDim,
                        fontWeight: marked ? 700 : 400,
                        borderLeft: marked ? `1px solid ${'#ff2d55'}33` : `1px solid ${colors.border}`,
                      }}>{cellOf(r, c)}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, textAlign: 'center', color: state.status === 'error' ? colors.red : colors.textDim, fontSize: 13, lineHeight: 1.6 }}>
            {state.status === 'error' ? state.message : 'Opening the schedule…'}
          </div>
        )}
      </div>
    </div>
  );
}

const th = {
  padding: '6px 10px', textAlign: 'left', whiteSpace: 'nowrap',
  position: 'sticky', top: 0, zIndex: 1,
  background: colors.card2, color: colors.text, fontWeight: 700,
  borderBottom: `1px solid ${colors.border}`,
};

const td = {
  padding: '6px 10px', whiteSpace: 'nowrap',
  borderBottom: `1px solid ${colors.border}`,
};
