import { useEffect, useRef, useState } from 'react';
import { colors } from '../styles/theme.js';
import { getCachedFile } from '../api/fileCache.js';
import { searchTerms, findTermBoxes } from '../api/pageMarks.js';
import { ftPerPixel, measureFeet, formatFeet } from '../api/sheetScale.js';

// ── SHEET PEEK ───────────────────────────────────────────────────────────────
// "Duct size 40x0 looks misread — verify on the plan" is half a finding. The
// other half is the plan, and until now checking meant opening the PDF in
// another tab and hunting for page 7 in a forty-sheet set.
//
// Two things the first version got wrong, both reported from an iPad.
//
// BLUR. It rendered at a fixed 2x, which is fine for a letter-size page and
// hopeless for a four-foot mechanical sheet: the same multiplier produces
// wildly different pixel density depending on sheet size. Scale is now derived
// from a target long edge, so an arch-E sheet and a detail sheet come out
// equally legible, and the image is displayed at its natural size inside a
// scrolling frame rather than squeezed to the viewport.
//
// AND IT STILL LEFT YOU SCANNING. Opening the right sheet is most of the job,
// but the thing in question is a half-inch label somewhere on four feet of
// paper. The text layer knows exactly where it is, so the label gets a box
// drawn round it and the view opens scrolled to that box.
//
// The obvious alternative — window.open(blobUrl + '#page=7') — is one line and
// works on desktop Chrome, Edge and Firefox. iOS Safari ignores the fragment
// and lands on page 1 every time, which is worse than no button.

const TARGET_LONG_EDGE = 4200; // rendered px — legible on a retina iPad, safe on memory
const MAX_SCALE = 6;

export function SheetPeek({ fileName, page, flagText = '', onClose }) {
  const [state, setState] = useState({ status: 'loading' });
  // Opening centred on the mark at full resolution is right for reading the
  // label, and it leaves you with no idea WHERE on a four-foot sheet you are.
  // "Fit sheet" pulls back to the whole drawing so the mark can be placed in
  // context, then back in to read it.
  const [fit, setFit] = useState(false);
  // Measuring. An estimator without a paper print has no architect's scale,
  // and the app kept telling them to "verify by scaling the plan" — work it
  // was asking for and not providing. The drawing's stated scale is already
  // parsed for the vision pass, so the sheet can measure itself.
  const [measuring, setMeasuring] = useState(false);
  const [pts, setPts] = useState([]);
  const frameRef = useRef(null);
  const markRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const file = getCachedFile(fileName);
      if (!file) {
        setState({ status: 'error', message: 'That file is no longer loaded — re-upload it to view the sheet.' });
        return;
      }
      try {
        // Imported lazily so the pdf.js bundle stays out of the initial load
        // for anyone who never opens a sheet.
        const pdfjs = await import('pdfjs-dist/build/pdf.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc =
          `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
        const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
        const pg = await doc.getPage(Math.min(page, doc.numPages));

        // Scale from the sheet's own size, not a fixed multiplier — that is
        // what made a big sheet unreadable.
        const base = pg.getViewport({ scale: 1 });
        const scale = Math.min(MAX_SCALE, TARGET_LONG_EDGE / Math.max(base.width, base.height));
        const viewport = pg.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await pg.render({ canvasContext: ctx, viewport }).promise;
        if (cancelled) return;

        // Mark what the flag is about, if the text layer can place it.
        let first = null;
        let ftPerPx = null;
        try {
          const tc = await pg.getTextContent();
          ftPerPx = ftPerPixel(tc.items.map(i => i.str).join(' '), scale);
          const boxes = findTermBoxes(tc.items, searchTerms(flagText), base.height);
          boxes.slice(0, 6).forEach((b, i) => {
            const x = b.x * scale, y = b.y * scale, w = Math.max(b.w * scale, 24), h = Math.max(b.h * scale, 14);
            const pad = Math.max(6, h * 0.45);
            // Two marks. The tight box is precise; the outer ring is sized off
            // the SHEET rather than the label so it stays findable when the
            // whole drawing is fitted to the screen — at that zoom a box drawn
            // round a half-inch label is a couple of pixels.
            const ring = Math.max(w, h) * 3 + canvas.width * 0.012;
            ctx.strokeStyle = 'rgba(255,45,85,0.45)';
            ctx.lineWidth = Math.max(4, canvas.width * 0.002);
            ctx.strokeRect(x + w / 2 - ring, y + h / 2 - ring, ring * 2, ring * 2);
            ctx.strokeStyle = '#ff2d55';
            ctx.lineWidth = Math.max(3, h * 0.14);
            ctx.strokeRect(x - pad, y - pad, w + pad * 2, h + pad * 2);
            if (i === 0) first = { x: x - pad, y: y - pad, w: w + pad * 2, h: h + pad * 2 };
          });
        } catch { /* no text layer (a scan) — the sheet still opens, unmarked */ }

        setState({
          status: 'ready',
          src: canvas.toDataURL('image/jpeg', 0.92),
          width: canvas.width,
          height: canvas.height,
          mark: first,
          ftPerPx,
        });
      } catch (e) {
        if (!cancelled) setState({ status: 'error', message: e?.message || 'Could not open that sheet.' });
      }
    })();
    return () => { cancelled = true; };
  }, [fileName, page, flagText]);

  // Open scrolled to the marked label rather than at the top-left corner of a
  // four-foot sheet.
  useEffect(() => {
    if (fit || state.status !== 'ready' || !state.mark || !frameRef.current) return;
    const el = frameRef.current;
    el.scrollLeft = Math.max(0, state.mark.x + state.mark.w / 2 - el.clientWidth / 2);
    el.scrollTop = Math.max(0, state.mark.y + state.mark.h / 2 - el.clientHeight / 2);
  }, [state, fit]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.9)', display: 'flex', flexDirection: 'column', padding: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexShrink: 0 }}>
        <div style={{ fontSize: 12, color: colors.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Page {page}
          <span style={{ color: colors.textDim, fontWeight: 400, marginLeft: 8 }}>{fileName}</span>
          {state.status === 'ready' && (
            <span style={{ color: state.mark ? '#ff2d55' : colors.textDim, fontWeight: 400, marginLeft: 8 }}>
              {state.mark ? '· marked in red' : '· label not found in the text layer'}
              {!state.ftPerPx && ' · no stated scale on this sheet, so it cannot be measured'}
            </span>
          )}
        </div>
        {state.status === 'ready' && state.ftPerPx && (
          <button
            onClick={() => { setMeasuring(m => !m); setPts([]); }}
            style={{ marginLeft: 'auto', flexShrink: 0, background: measuring ? colors.green : 'transparent', color: measuring ? '#000' : colors.green, border: `1px solid ${colors.green}66`, borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >📏 {measuring ? (pts.length === 2 ? formatFeet(measureFeet(pts[0], pts[1], state.ftPerPx)) : 'Tap two points') : 'Measure'}</button>
        )}
        {state.status === 'ready' && (
          <button
            onClick={() => setFit(f => !f)}
            style={{ marginLeft: state.ftPerPx ? 8 : 'auto', flexShrink: 0, background: 'transparent', color: colors.blue, border: `1px solid ${colors.blue}66`, borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >{fit ? '🔍 Zoom to mark' : '🗺️ Fit sheet'}</button>
        )}
        <button
          onClick={onClose}
          style={{ marginLeft: state.status === 'ready' ? 8 : 'auto', flexShrink: 0, background: colors.green, color: '#000', border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
        >Close</button>
      </div>
      {/* Natural size inside a scrolling frame: a drawing squeezed to fit a
          tablet is unreadable, so it pans and pinches instead. */}
      <div
        ref={frameRef}
        style={{ flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: 8, background: '#fff' }}
      >
        {state.status === 'ready'
          ? <div style={{ position: 'relative', width: fit ? '100%' : state.width, height: fit ? 'auto' : state.height }}>
            <img
              ref={markRef}
              src={state.src}
              alt={`Page ${page}`}
              onClick={e => {
                if (!measuring) { setFit(f => !f); return; }
                // Clicks arrive in DISPLAYED pixels; the measurement lives in
                // the rendered image's own pixels, so scale across.
                const r = e.currentTarget.getBoundingClientRect();
                const k = state.width / r.width;
                const p = { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k };
                setPts(prev => (prev.length >= 2 ? [p] : [...prev, p]));
              }}
              style={fit
                ? { display: 'block', width: '100%', height: 'auto', cursor: 'zoom-in' }
                : { display: 'block', width: state.width, height: state.height, maxWidth: 'none', cursor: 'zoom-out' }}
            />
            {measuring && pts.length > 0 && (
              <svg
                viewBox={`0 0 ${state.width} ${state.height}`}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
              >
                {pts.length === 2 && (
                  <line x1={pts[0].x} y1={pts[0].y} x2={pts[1].x} y2={pts[1].y}
                    stroke="#0a84ff" strokeWidth={state.width * 0.0022} />
                )}
                {pts.map((p, i) => (
                  <circle key={i} cx={p.x} cy={p.y} r={state.width * 0.004} fill="#0a84ff" />
                ))}
                {pts.length === 2 && (
                  <text
                    x={(pts[0].x + pts[1].x) / 2} y={(pts[0].y + pts[1].y) / 2 - state.width * 0.008}
                    fill="#0a84ff" fontSize={state.width * 0.016} fontWeight="700" textAnchor="middle"
                    stroke="#fff" strokeWidth={state.width * 0.004} paintOrder="stroke"
                  >{formatFeet(measureFeet(pts[0], pts[1], state.ftPerPx))}</text>
                )}
              </svg>
            )}
          </div>
          : (
            <div style={{ padding: 40, textAlign: 'center', color: state.status === 'error' ? colors.red : colors.textDim, fontSize: 13, background: colors.panel, height: '100%' }}>
              {state.status === 'error' ? state.message : `Rendering page ${page}…`}
            </div>
          )}
      </div>
    </div>
  );
}
