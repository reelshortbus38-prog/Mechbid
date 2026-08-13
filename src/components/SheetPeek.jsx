import { useEffect, useState } from 'react';
import { colors } from '../styles/theme.js';
import { getCachedFile } from '../api/fileCache.js';

// ── SHEET PEEK ───────────────────────────────────────────────────────────────
// "Duct size 32x0 looks misread — verify on the plan" is only half a finding.
// The other half is the plan, and until now checking meant opening the PDF in
// another tab, finding page 7 in a forty-sheet set, and losing your place in
// the flag list.
//
// The obvious implementation — window.open(blobUrl + '#page=7') — is one line
// and works on desktop Chrome, Edge and Firefox. iOS Safari ignores the
// fragment and lands on page 1 every time, and this app is used on an iPad. A
// button that opens the wrong sheet is worse than no button: tap it twice, get
// the title block twice, and you stop tapping it on the one that mattered.
//
// So the page is rendered in place with pdf.js — the same machinery the vision
// pass already uses — which behaves identically everywhere. Rendering is
// deliberately cheap: one page, no tiling, moderate scale. This is for reading
// a label, not for measuring.

export function SheetPeek({ fileName, page, onClose }) {
  const [img, setImg] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const file = getCachedFile(fileName);
      if (!file) { setError('That file is no longer loaded — re-upload it to view the sheet.'); return; }
      try {
        // Imported lazily so the pdf.js bundle stays out of the initial load
        // for anyone who never opens a sheet.
        const { renderPdfPagesToImages } = await import('../api/pdfRender.js');
        const { pages } = await renderPdfPagesToImages(file, {
          pageNums: [page], maxPages: 1, tile: false, scale: 2,
        });
        if (cancelled) return;
        if (!pages?.length) { setError(`Page ${page} could not be rendered.`); return; }
        setImg(`data:image/jpeg;base64,${pages[0].base64}`);
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Could not open that sheet.');
      }
    })();
    return () => { cancelled = true; };
  }, [fileName, page]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.85)',
        display: 'flex', flexDirection: 'column', padding: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexShrink: 0 }}>
        <div style={{ fontSize: 12, color: colors.text, fontWeight: 600 }}>
          Page {page}
          <span style={{ color: colors.textDim, fontWeight: 400, marginLeft: 8 }}>{fileName}</span>
        </div>
        <button
          onClick={onClose}
          style={{
            marginLeft: 'auto', background: colors.green, color: '#000', border: 'none',
            borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >Close</button>
      </div>
      {/* Scroll and pinch inside the sheet — a drawing is unreadable fitted to
          a phone screen, so it renders at full width and pans. */}
      <div
        onClick={e => e.stopPropagation()}
        style={{ flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: 8, background: '#fff' }}
      >
        {img
          ? <img src={img} alt={`Page ${page}`} style={{ display: 'block', width: '100%', height: 'auto' }} />
          : (
            <div style={{ padding: 40, textAlign: 'center', color: error ? colors.red : colors.textDim, fontSize: 13, background: colors.panel, height: '100%' }}>
              {error || `Rendering page ${page}…`}
            </div>
          )}
      </div>
    </div>
  );
}
