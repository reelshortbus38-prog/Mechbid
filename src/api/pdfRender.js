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

// Renders every page of a PDF File to JPEG data URLs (base64, no prefix).
// maxPages caps how many pages get rendered — redline sets can be long, and
// vision calls are not free, so this is a safety valve, not a hard product limit.
// Returns: [{ pageNum, base64 }]
// scale raised from 2 to 3 — same reasoning as the imageToJpeg cap increase
// in ai.js: a full architectural sheet rendered at scale 2 leaves small
// callout text under-resolved, which is what let the model guess at
// illegible text instead of reading it (or correctly flagging it [unclear]).
// Scale 3 roughly triples linear pixel density per page versus the PDF's
// native point size, which is still well under where Claude's vision
// pipeline would downscale the image again on its own end.
export async function renderPdfPagesToImages(file, { maxPages = 12, scale = 3 } = {}) {
  const lib = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await lib.getDocument({ data: arrayBuffer }).promise;

  const pageCount = Math.min(pdf.numPages, maxPages);
  const results = [];

  for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
    const page = await pdf.getPage(pageNum);
    // Scale 2 gives roughly 150-200dpi equivalent for a standard sheet — enough
    // for vision to read callout text without producing an enormous image.
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    // White background — PDF canvases default to transparent, which can render
    // as black depending on how the JPEG encoder handles it.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport }).promise;

    // Quality bumped from 0.88 — at scale 3, compression artifacting around
    // small text edges would otherwise undercut the resolution gain from the
    // higher scale.
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    results.push({ pageNum, base64: dataUrl.split(',')[1] });
  }

  return { pages: results, totalPages: pdf.numPages, truncated: pdf.numPages > maxPages };
}
