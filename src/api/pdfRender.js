// ── PDF → IMAGE RENDERING ──────────────────────────────────────────────────────
// Redline drawings, blueprints, and scanned plans arrive as PDFs with no
// extractable schedule table — the only way to read them reliably is to render
// each page to an image and run it through vision, same as a photo upload.
//
// Uses pdfjs-dist (Mozilla's PDF.js), loaded dynamically so it doesn't bloat the
// initial bundle for users who never upload a PDF.

let pdfjsLib = null;

async function loadPdfJs() {
  if (pdfjsLib) return pdfjsLib;
  pdfjsLib = await import('pdfjs-dist/build/pdf.mjs');
  // pdf.js needs its worker script. Use the CDN build matching the installed
  // version so we don't have to hand-manage a worker file in the Vite build.
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  return pdfjsLib;
}

// ── PDF TEXT LAYER ──────────────────────────────────────────────────────────────
// Many refrigeration plans are vector PDFs (CAD/Bluebeam exports), not scans —
// the callout boxes are real, selectable text. Reading that text layer is exact
// (a circuit ID can never be misread as a different one the way it can from a
// downscaled raster), so we try it BEFORE falling back to rendering + vision.
// Returns one { pageNum, text, lineCount } per page; pages with no real text
// layer (true scans) come back with little/no text and route to vision instead.
export async function extractPdfPagesText(file, { maxPages = 12 } = {}) {
  const lib = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await lib.getDocument({ data: arrayBuffer }).promise;
  const pageCount = Math.min(pdf.numPages, maxPages);
  const pages = [];

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const tc = await page.getTextContent();
    // Reconstruct reading order from glyph positions: top-to-bottom by Y
    // (PDF Y grows upward), left-to-right by X within a line.
    const items = tc.items
      .filter(i => i.str && i.str.trim())
      .map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5] }))
      .sort((a, b) => Math.abs(a.y - b.y) > 3 ? b.y - a.y : a.x - b.x);

    let raw = '', lastY = null;
    for (const it of items) {
      if (lastY !== null && Math.abs(it.y - lastY) > 3) raw += '\n';
      raw += it.s + ' ';
      lastY = it.y;
    }

    // Strip PDF-editor watermark noise (scattered single letters, "Click to buy
    // now", "PDF-XChange") so it doesn't pollute the callout text.
    const lines = raw.split('\n')
      .map(l => l.trim().replace(/\s+/g, ' '))
      .filter(l => {
        if (l.length < 3) return false;
        if (/click to buy now|pdf-?xchange|tracker-?software|^w[\s.]*w[\s.]*w/i.test(l)) return false;
        const tokens = l.split(' ');
        const singleChars = tokens.filter(t => t.length === 1).length;
        if (tokens.length >= 2 && singleChars === tokens.length) return false; // all single-char watermark fragments
        if (tokens.length >= 4 && singleChars / tokens.length > 0.5) return false;
        return true;
      });

    pages.push({ pageNum, text: lines.join('\n'), lineCount: lines.length });
  }

  return { pages, totalPages: pdf.numPages };
}

// ── DRAWING SCALE DETECTION ────────────────────────────────────────────────────
// A CAD-exported PDF preserves true page geometry, and the title block states
// the drawing scale ("SCALE: 1/4\" = 1'-0\"", "1\" = 20'"). Stated scale +
// known page size means we can compute exactly how many FEET one rendered
// pixel represents — which turns "guess the duct length" into "measure it".
// Returns feet-per-paper-inch, or null when no scale (or MORE than one
// distinct scale — plan + details sheets) is found; ambiguity must not
// silently pick a ruler.
export function detectDrawingScale(text) {
  const t = String(text || '').replace(/[”″]/g, '"').replace(/[’′]/g, "'");
  const vals = new Set();
  // Matches architectural ( 1/4" = 1'-0", 3/16"=1', 1 1/2" = 1'-0" ) and
  // engineering ( 1" = 20' ) notations: X" = Y'
  const re = /((?:\d+\s+)?\d+\/\d+|\d+(?:\.\d+)?)\s*"\s*=\s*(\d+)\s*'/g;
  for (const m of t.matchAll(re)) {
    let x = 0;
    for (const part of m[1].trim().split(/\s+/)) {
      if (part.includes('/')) { const [n, d] = part.split('/').map(Number); if (d) x += n / d; }
      else x += Number(part);
    }
    const y = Number(m[2]);
    if (x > 0 && y > 0) vals.add(Math.round((y / x) * 1000) / 1000);
  }
  return vals.size === 1 ? [...vals][0] : null;
}

// Stamp a calibrated scale bar (alternating black/white segments, labeled in
// feet, on a boxed white backdrop) onto the bottom-left of a rendered canvas.
// The vision model measures duct runs against it — an exact ruler beats
// inferring lengths from diffuser widths.
function stampScaleBar(ctx, w, h, ftPerPx) {
  const candidates = [1, 2, 5, 10, 20, 25, 50, 100];
  const segFt = candidates.find(f => f / ftPerPx >= 80) || 100;
  const segPx = segFt / ftPerPx;
  let segments = Math.floor((w * 0.4) / segPx);
  segments = Math.max(2, Math.min(6, segments));
  if (segPx * segments > w * 0.8) return; // scale too coarse for this crop — skip
  const barW = segPx * segments;
  const barH = Math.max(12, Math.round(h * 0.01));
  const fontPx = Math.max(16, Math.round(barH * 1.6));
  const margin = Math.round(Math.min(w, h) * 0.02) + fontPx;
  const x0 = margin, y0 = h - margin;

  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.fillRect(x0 - 10, y0 - fontPx - 14, barW + fontPx * 5, barH + fontPx + 24);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.strokeRect(x0 - 10, y0 - fontPx - 14, barW + fontPx * 5, barH + fontPx + 24);
  for (let i = 0; i < segments; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#000' : '#fff';
    ctx.fillRect(x0 + i * segPx, y0, segPx, barH);
  }
  ctx.strokeRect(x0, y0, barW, barH);
  ctx.fillStyle = '#000';
  ctx.font = `bold ${fontPx}px Arial`;
  ctx.fillText('0', x0 - 4, y0 - 6);
  ctx.fillText(`${segFt * segments} FT — SCALE BAR`, x0 + barW + 8, y0 + barH);
  ctx.restore();
}

// Renders every page of a PDF File to JPEG data URLs (base64, no prefix).
//
// TILING — the key to reading dense blueprints: vision models internally
// downscale any image to roughly 1568px on the long edge before reading it.
// A full E-size architectural sheet (34"×44") sent as one image therefore has
// its small callout text (circuit IDs, line sizes) crushed to sub-pixel, no
// matter how high we render it — which is exactly when the model starts
// guessing. Instead, we render each page at high resolution, then slice it into
// an overlapping grid of tiles, each small enough to survive the model's
// downscale with its text intact. Overlap keeps callouts that straddle a tile
// boundary whole in at least one tile. Small pages (a single schedule photo
// saved as PDF) stay as one tile.
//
// maxPages caps total pages; maxTilesPerPage caps the grid per page so a long
// set doesn't explode the number of vision calls. Returns one entry per tile:
//   { pageNum, tileNum, tilesOnPage, base64 }
export async function renderPdfPagesToImages(file, {
  maxPages = 12,
  scale = 3,
  tile = true,
  tileTargetPx = 2600,  // approx source px per tile edge → ~2×2 on a big sheet
  tileOverlap = 0.12,   // 12% overlap so edge callouts survive in one tile
  maxTilesPerPage = 4,
  maxCanvasPx = 6000,   // clamp source canvas long edge for memory safety
  // { [pageNum]: feetPerPaperInch } from detectDrawingScale — when present
  // for a page, a calibrated scale bar is stamped onto that page's renders
  // (each tile gets its own bar, since tiles crop 1:1 from the source canvas).
  scaleFtPerInchByPage = null,
  // Optional explicit page list — render ONLY these pages (in order), instead
  // of 1..maxPages. Used to vision-read the drawing sheets a mixed set carries
  // (sparse graphics) while its dense spec pages go to the text analyzer.
  pageNums = null,
} = {}) {
  const lib = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await lib.getDocument({ data: arrayBuffer }).promise;

  const selected = (pageNums && pageNums.length)
    ? pageNums.filter(n => n >= 1 && n <= pdf.numPages).slice(0, maxPages)
    : Array.from({ length: Math.min(pdf.numPages, maxPages) }, (_, k) => k + 1);
  const results = [];

  for (const pageNum of selected) {
    const page = await pdf.getPage(pageNum);
    let viewport = page.getViewport({ scale });
    // Clamp the source canvas so a huge sheet at scale 3 doesn't blow up memory.
    const longEdge = Math.max(viewport.width, viewport.height);
    if (longEdge > maxCanvasPx) {
      viewport = page.getViewport({ scale: scale * (maxCanvasPx / longEdge) });
    }

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    // White background — PDF canvases default to transparent, which can render
    // as black depending on how the JPEG encoder handles it.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport }).promise;

    // Feet per rendered pixel: 72 PDF points per paper inch × effective
    // render scale (post-clamp), then the drawing's stated feet-per-inch.
    const ftPerIn = scaleFtPerInchByPage?.[pageNum] || null;
    const effScale = viewport.width / page.getViewport({ scale: 1 }).width;
    const ftPerPx = ftPerIn ? ftPerIn / (72 * effScale) : null;

    // Decide the tile grid for this page.
    let cols = 1, rows = 1;
    if (tile) {
      cols = Math.max(1, Math.round(canvas.width / tileTargetPx));
      rows = Math.max(1, Math.round(canvas.height / tileTargetPx));
      // Trim the grid down to the per-page tile budget, shrinking the longer
      // axis first so tiles stay roughly square.
      while (cols * rows > maxTilesPerPage) {
        if (cols >= rows && cols > 1) cols--;
        else if (rows > 1) rows--;
        else break;
      }
    }

    if (cols === 1 && rows === 1) {
      if (ftPerPx) stampScaleBar(ctx, canvas.width, canvas.height, ftPerPx);
      results.push({ pageNum, tileNum: 1, tilesOnPage: 1, scaled: !!ftPerPx, base64: canvas.toDataURL('image/jpeg', 0.95).split(',')[1] });
      continue;
    }

    const tilesOnPage = cols * rows;
    const tileW = canvas.width / cols;
    const tileH = canvas.height / rows;
    const ovX = tileW * tileOverlap;
    const ovY = tileH * tileOverlap;
    let tileNum = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        tileNum++;
        const sx = Math.max(0, c * tileW - ovX);
        const sy = Math.max(0, r * tileH - ovY);
        const sw = Math.min(canvas.width - sx, tileW + 2 * ovX);
        const sh = Math.min(canvas.height - sy, tileH + 2 * ovY);
        const tcanvas = document.createElement('canvas');
        tcanvas.width = Math.round(sw);
        tcanvas.height = Math.round(sh);
        const tctx = tcanvas.getContext('2d');
        tctx.fillStyle = '#fff';
        tctx.fillRect(0, 0, tcanvas.width, tcanvas.height);
        tctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, tcanvas.width, tcanvas.height);
        // Tiles crop 1:1 from the source canvas, so feet-per-pixel is
        // unchanged — every tile carries its own ruler.
        if (ftPerPx) stampScaleBar(tctx, tcanvas.width, tcanvas.height, ftPerPx);
        results.push({ pageNum, tileNum, tilesOnPage, scaled: !!ftPerPx, base64: tcanvas.toDataURL('image/jpeg', 0.95).split(',')[1] });
      }
    }
  }

  const requested = (pageNums && pageNums.length) ? pageNums.length : pdf.numPages;
  return { pages: results, totalPages: pdf.numPages, truncated: requested > selected.length };
}
