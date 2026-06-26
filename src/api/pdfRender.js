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
} = {}) {
  const lib = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await lib.getDocument({ data: arrayBuffer }).promise;

  const pageCount = Math.min(pdf.numPages, maxPages);
  const results = [];

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
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
      results.push({ pageNum, tileNum: 1, tilesOnPage: 1, base64: canvas.toDataURL('image/jpeg', 0.95).split(',')[1] });
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
        results.push({ pageNum, tileNum, tilesOnPage, base64: tcanvas.toDataURL('image/jpeg', 0.95).split(',')[1] });
      }
    }
  }

  return { pages: results, totalPages: pdf.numPages, truncated: pdf.numPages > maxPages };
}
