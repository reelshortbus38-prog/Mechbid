// ── AI API CALLS ──────────────────────────────────────────────────────────────
// All AI calls go through /api/claude (OpenRouter) - no Anthropic key needed

export async function callClaude(messages, system = '') {
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system,
      messages,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API error ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  // Handle both OpenRouter and Anthropic response formats
  return data.content?.[0]?.text || data.choices?.[0]?.message?.content || '';
}

// Conversational assistant call — same OpenRouter endpoint, but a non-zero
// temperature so answers read naturally (the extraction calls pin temp 0 for
// determinism, which makes chat answers terse and repetitive). Takes the full
// multi-turn message history so the assistant remembers the conversation.
export async function chatWithAI(messages, system = '') {
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system, messages, temperature: 0.4, max_tokens: 1200 }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Assistant error ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data.content?.[0]?.text || data.choices?.[0]?.message?.content || '';
}

// Vision call - uses /api/claude with image support
export async function callClaudeVision(base64Image, fileName, tile = null) {
  try {
    // When a large photo is split into tiles (to keep small text legible),
    // tell the model it's seeing a crop so it doesn't try to reconstruct a
    // schedule row or callout that's cut off at the edge — another tile (and
    // the full-image pass) covers it, and the merge step dedups the overlap.
    const tileContext = tile && tile.tilesTotal > 1
      ? `\n\nNOTE: This image is section ${tile.tileNum} of ${tile.tilesTotal} cropped from a single larger photo — it shows only part of the document. Read only rows/callouts that are fully legible within this crop; if a schedule row or callout box is cut off at the edge, skip it rather than guessing the missing values.`
      : '';
    const prompt = `You are an expert commercial refrigeration estimating system analyzing construction documents.${tileContext}

Analyze this image carefully. It may be rotated or upside down — read ALL text regardless of orientation.

If this is a BLUEPRINT, FLOOR PLAN, or REDLINE DRAWING:
- Read EVERY orange, red, or colored callout box — these contain RC field tasks
- Extract each callout as a separate fieldTask with the COMPLETE actual text
- Common patterns: "DROP NEW [circuit]", "CONNECT EXISTING [circuit] TO [location]"
- Skip "GC TO..." portions — only extract RC refrigeration work
- Read title block: store name, store number, address, drawing number, date
- CRITICAL: Use EXACT text from callouts, never placeholder words like "circuit" or "location"

If this is a BPR or EQUIPMENT SCHEDULE:
- Extract ALL circuits with run lengths, suction sizes, liquid sizes

Return ONLY valid JSON, no markdown:
{"documentType":"blueprint|fixture_plan|bpr|equipment_schedule|scope_of_work|unknown","storeName":"","storeNumber":"","address":"","drawingNumber":"","circuits":[{"circuitId":"","rack":"","runLength":0,"riserLength":0,"sucHoriz":"","sucRiser":"","liqHoriz":"","tempType":"medium","application":"","isRiserOnly":false,"isNew":true,"notes":""}],"fieldTasks":[{"desc":"actual callout text","circuit":"","location":"","lineSize":"","notes":""}],"rackTasks":[{"desc":"","rack":"","notes":""}],"parts":[{"partId":"","description":"","qty":0}],"rcNotes":[{"text":"","costImpact":false}],"nightWorkRequired":false,"nightWorkDetails":"","flags":[],"summary":""}`;

    // Routed through Anthropic directly (api/claude-direct.js), same as
    // callClaudeVisionRedline — testing whether Claude's lower hallucination
    // rate helps here too (equipment schedule photos, BPR sheets) the way it
    // clearly did for redline extraction. If results aren't meaningfully
    // different from GPT-4o on this document type, switching back to
    // OpenRouter ('/api/claude') is a one-line change.
    const res = await fetch('/api/claude-direct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Image } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.content?.[0]?.text || data.choices?.[0]?.message?.content || null;
  } catch (e) {
    console.warn('Vision error:', e.message);
    return null;
  }
}

// ── REDLINE / CALLOUT-STYLE PDF VISION ─────────────────────────────────────────
// Vision call tuned specifically for redline/callout-style drawings — the kind
// where contractors mark up a floor plan with colored callout boxes giving
// instructions ("DROP NEW B11 IN EXISTING CHASE") rather than a clean equipment
// schedule table. Critically, this prompt does NOT ask the model to invent
// circuit lengths, pipe sizes, or quantities that aren't explicitly stated —
// redlines usually only describe WHAT to do and WHERE, not HOW MUCH. Forcing the
// model to fill in numbers it can't see is how you get confident-sounding wrong
// data, which is exactly what the review screen is supposed to catch — but it's
// better not to generate it in the first place.
export async function callClaudeVisionRedline(base64Image, fileName, pageNum, totalPages, tile = null) {
  try {
    const pageContext = totalPages > 1 ? ` This is page ${pageNum} of ${totalPages} in a multi-sheet drawing set.` : '';
    // When a sheet is sliced into tiles (to keep small callout text legible),
    // tell the model so it doesn't try to reconstruct callouts that are cut off
    // at a tile edge — another tile covers the rest, and the merge step dedups
    // the overlap. This prevents the model from "completing" a partial box with
    // a guess, which is exactly the failure tiling is meant to avoid.
    const tileContext = tile && tile.tilesOnPage > 1
      ? ` This image is section ${tile.tileNum} of ${tile.tilesOnPage} cropped from a single large sheet — it shows only part of the page. Transcribe ONLY callout boxes that are fully legible within this crop. If a box is cut off at the edge of this image, skip it (another section covers it) rather than guessing the missing words.`
      : '';
    const prompt = `You are an expert commercial refrigeration estimator reading a redlined floor plan or piping plan.${pageContext}${tileContext}

This drawing has colored callout boxes (usually orange) with leader lines pointing to specific locations on the floor plan. Each callout box is a SEPARATE, SELF-CONTAINED instruction. Callout boxes are often positioned close together or stacked near the same area of the floor plan — this is the single biggest source of error, so follow this rule strictly:

NEVER combine, blend, or borrow words from one callout box into another. Each callout's text must come ONLY from inside that specific box's border. Before writing out a callout, visually trace its leader line back to confirm which box it belongs to. If two callouts are near each other, re-read each one individually and check that no phrase from box A has leaked into your transcription of box B. A common error is mixing up circuit IDs (e.g. writing "B16" when the box actually says "B6", or "A2" when it says "A8, C8") — read each alphanumeric ID character by character.

ACCURACY OVER COMPLETENESS — this is critical:
- If any word, number, or circuit ID in a callout is blurry, small, cut off, or ambiguous, do NOT guess a plausible-looking replacement. Instead write the parts you ARE sure of and mark the uncertain part with [unclear] in the text, e.g. "DROP NEW [unclear] IN MEAT PREP".
- Do not invent connector words or phrases to make a sentence read smoothly. If the box doesn't clearly say "RECONNECT TO DRAINER AT CASE LINE", don't write that — write only what's actually legible, even if it ends abruptly.
- For the title block (store name, store number, address): if any part is rotated, low-resolution, or you are not highly confident in the exact characters, leave that field as an empty string rather than producing a plausible-sounding guess. A wrong address is worse than a missing one. Only fill a field if you would bet money it's character-for-character correct.

Do NOT invent or estimate, under any circumstance:
- Circuit run lengths (these are almost never given on a redline — omit entirely, never guess a number)
- Pipe sizes, UNLESS a size is explicitly and legibly written inside that specific callout box
- Quantities not stated in the text

For each callout box found, in whatever orientation it's drawn (the page may be rotated):
- Transcribe the COMPLETE text from that box only, verbatim
- Note the circuit ID(s) if stated, reading each character carefully
- Note the location/area if stated (e.g. "Meat Prep", "Deli Closet")
- Skip "GC TO..." portions — extract only RC refrigeration scope. If a box has both GC and RC text, extract only the RC sentence(s).
- Note night work, trench work, demo, or other notable conditions in notes

Read the title block per the accuracy rule above: store name, store number, address, drawing/sheet number, date, drawing title.

Return ONLY valid JSON, no markdown, no commentary:
{"documentType":"redline_callout","storeName":"","storeNumber":"","address":"","drawingNumber":"","sheetTitle":"","fieldTasks":[{"desc":"complete verbatim text from ONE callout box only, [unclear] for ambiguous parts","circuitRef":"","location":"","statedSize":"","notes":""}],"flags":[{"type":"info|warn","text":""}],"summary":"one sentence describing what this page covers"}`;

    // Routed through Anthropic directly (api/claude-direct.js) rather than
    // OpenRouter — this is the call site where hallucination already caused
    // real problems (fabricated address, blended circuit IDs), and Claude's
    // lower hallucination rate on financially-consequential extraction is the
    // most relevant property here. Note the Anthropic-specific image content
    // block shape: {type:"image", source:{type:"base64", media_type, data}},
    // not OpenRouter's {type:"image_url", image_url:{url:"data:..."}}.
    const res = await fetch('/api/claude-direct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Image } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.content?.[0]?.text || data.choices?.[0]?.message?.content || null;
  } catch (e) {
    console.warn('Redline vision error:', e.message);
    return null;
  }
}

// Renders every page of a PDF and runs each through the redline-aware vision
// call, merging results into one combined parsed object. Pages are processed
// sequentially (not in parallel) to avoid hammering the API with a burst of
// large image payloads at once for multi-sheet sets.
// Normalize a callout for dedup: lowercase, drop [unclear] markers, strip
// punctuation, collapse whitespace. Overlapping tiles re-read the same callout
// verbatim, so identical normalized text means the same box — keep one copy.
function normalizeCalloutKey(desc) {
  return String(desc || '')
    .toLowerCase()
    .replace(/\[unclear\]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Callout-instruction verbs that signal a page actually carries RC redline
// scope (vs. a title sheet or a legend) — used to decide whether the text layer
// is rich enough to skip vision for that page.
const REDLINE_CALLOUT_RE = /\b(DROP|CONNECT|RECONNECT|DISCONNECT|REWORK|RELOCAT|EXTEND|PIPE THRU|TOP STUB|FEED)\b/i;

// Deterministic extraction of callouts from an exact PDF text layer — no model,
// so the same drawing always yields the same tasks (the AI step was dropping and
// merging callouts differently every run). One task per callout line: the GC
// portion is stripped, circuit IDs are pulled verbatim, and exact duplicates are
// removed. Over-segmenting is safe (you assign hours per task); the danger is
// dropping a callout, which this never does.
const CALLOUT_START_RE = /^(DROP|CONNECT|RECONNECT|DISCONNECT|REWORK|RELOCAT|INSTALL|ADD)\b/i;
export function extractCalloutTasksFromText(pageText) {
  const lines = String(pageText || '').split('\n').map(l => l.trim()).filter(Boolean);
  const tasks = [];
  const seen = new Set();
  for (const line of lines) {
    if (!REDLINE_CALLOUT_RE.test(line)) continue;
    // Drop the "GC TO ..." tail — that's general-contractor scope, not RC.
    const desc = (line.replace(/\bGC TO\b[\s\S]*$/i, '').trim()) || line;
    const key = desc.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const circuitRef = [...new Set((desc.match(/\b[A-E]\d{1,2}\b/g) || []))].join(', ');
    tasks.push({ desc, circuitRef, location: '', statedSize: '', notes: '' });
  }
  return tasks;
}

export async function analyzeRedlinePdf(file, fileName) {
  const { renderPdfPagesToImages, extractPdfPagesText } = await import('./pdfRender.js');

  const merged = {
    documentType: 'redline_callout',
    storeName: '', storeNumber: '', address: '', drawingNumber: '',
    fieldTasks: [], flags: [], pageSummaries: [],
  };
  const seenTask = new Set();
  const summarizedPages = new Set();

  // Shared merge: fold one parsed page/tile result into `merged`, deduping
  // callouts (text layer + overlapping vision tiles can re-read the same box).
  const absorb = (parsed, pageNum) => {
    if (parsed.storeName && !merged.storeName) merged.storeName = parsed.storeName;
    if (parsed.storeNumber && !merged.storeNumber) merged.storeNumber = parsed.storeNumber;
    if (parsed.address && !merged.address) merged.address = parsed.address;
    if (parsed.drawingNumber && !merged.drawingNumber) merged.drawingNumber = parsed.drawingNumber;
    (parsed.fieldTasks || []).forEach(t => {
      const norm = normalizeCalloutKey(t.desc);
      if (!norm) return;
      const key = `${pageNum}::${norm}`;
      if (seenTask.has(key)) return;
      seenTask.add(key);
      merged.fieldTasks.push({ ...t, pageNum });
    });
    (parsed.flags || []).forEach(f => merged.flags.push(f));
    if (parsed.summary && !summarizedPages.has(pageNum)) {
      summarizedPages.add(pageNum);
      merged.pageSummaries.push(`Page ${pageNum}: ${parsed.summary}`);
    }
  };

  // 1. TEXT LAYER FIRST — exact, no vision needed when the page has real text.
  let textPages = [], totalPages = 0;
  try {
    const res = await extractPdfPagesText(file);
    textPages = res.pages;
    totalPages = res.totalPages;
  } catch (e) {
    // If text extraction throws, fall through to vision for every page.
    merged.flags.push({ type: 'info', text: `Text layer unavailable (${e.message}) — read as scanned image`, source: fileName });
  }

  const visionPageNums = [];
  for (const tp of textPages) {
    if (tp.text.length >= 80 && REDLINE_CALLOUT_RE.test(tp.text)) {
      // Deterministic, exact, free — no model deciding the count.
      const fieldTasks = extractCalloutTasksFromText(tp.text);
      if (fieldTasks.length) {
        absorb({ fieldTasks, summary: `${fieldTasks.length} callout(s) read from the PDF text layer` }, tp.pageNum);
        continue;
      }
    }
    // No usable text layer (scan) or no callouts found → vision fallback.
    visionPageNums.push(tp.pageNum);
  }
  // If text extraction failed entirely, vision must cover everything.
  const visionAll = textPages.length === 0;

  // 2. VISION FALLBACK — render + tile only the pages that need it.
  if (visionAll || visionPageNums.length) {
    const { pages, totalPages: vTotal, truncated } = await renderPdfPagesToImages(file);
    if (!totalPages) totalPages = vTotal;
    for (const { pageNum, tileNum = 1, tilesOnPage = 1, base64 } of pages) {
      if (!visionAll && !visionPageNums.includes(pageNum)) continue;
      const tileLabel = tilesOnPage > 1 ? `Page ${pageNum} (section ${tileNum}/${tilesOnPage})` : `Page ${pageNum}`;
      const raw = await callClaudeVisionRedline(base64, fileName, pageNum, totalPages, { tileNum, tilesOnPage });
      const parsed = raw ? parseAIJson(raw) : null;
      if (!parsed) {
        merged.flags.push({ type: 'warn', text: `${tileLabel}: could not be analyzed`, source: fileName });
        continue;
      }
      absorb(parsed, pageNum);
    }
    if (truncated) {
      merged.flags.push({ type: 'warn', text: `Document has more pages than were analyzed (limit reached) — some sheets may be missing from this extraction`, source: fileName });
    }
  }

  merged.summary = merged.pageSummaries.join(' ');
  return merged;
}

// ── PHOTO / IMAGE TILING ───────────────────────────────────────────────────────
// Same idea as the PDF tiler, for camera/photo uploads of dense paperwork. The
// vision model downscales any image to ~1568px on the long edge, crushing small
// schedule cells and callout text. We send the WHOLE image (preserves table row
// structure and circuit-to-size associations — important for tabular schedules
// where a naive tile split could sever a row) PLUS overlapping high-res tiles
// (recover the fine detail), then merge with dedup. Returns { full, tiles }.
export function imageToTiles(file, {
  maxSize = 5200,
  tileTargetPx = 2600,
  tileOverlap = 0.12,
  maxTiles = 4,
} = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width: w, height: h } = img;
      const longEdge = Math.max(w, h);
      if (longEdge > maxSize) {
        const k = maxSize / longEdge;
        w = Math.round(w * k); h = Math.round(h * k);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      const full = canvas.toDataURL('image/jpeg', 0.95).split(',')[1];

      let cols = Math.max(1, Math.round(w / tileTargetPx));
      let rows = Math.max(1, Math.round(h / tileTargetPx));
      while (cols * rows > maxTiles) {
        if (cols >= rows && cols > 1) cols--;
        else if (rows > 1) rows--;
        else break;
      }

      const tiles = [];
      if (cols > 1 || rows > 1) {
        const tileW = w / cols, tileH = h / rows;
        const ovX = tileW * tileOverlap, ovY = tileH * tileOverlap;
        const tilesTotal = cols * rows;
        let tileNum = 0;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            tileNum++;
            const sx = Math.max(0, c * tileW - ovX);
            const sy = Math.max(0, r * tileH - ovY);
            const sw = Math.min(w - sx, tileW + 2 * ovX);
            const sh = Math.min(h - sy, tileH + 2 * ovY);
            const tc = document.createElement('canvas');
            tc.width = Math.round(sw); tc.height = Math.round(sh);
            const tctx = tc.getContext('2d');
            tctx.fillStyle = '#fff'; tctx.fillRect(0, 0, tc.width, tc.height);
            tctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, tc.width, tc.height);
            tiles.push({ tileNum, tilesTotal, base64: tc.toDataURL('image/jpeg', 0.95).split(',')[1] });
          }
        }
      }
      resolve({ full, tiles });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });
}

const normMergeKey = s => String(s || '').toLowerCase().replace(/\[unclear\]/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

// Runs the full-image pass plus each tile through callClaudeVision, merging
// circuits (deduped by circuit ID, filling empty fields across passes), field
// tasks, rack tasks, and parts (deduped by normalized text). Returns the same
// shape callClaudeVision's JSON produces, so Step1 can consume it unchanged.
export async function analyzeImageDoc(file, fileName) {
  const { full, tiles } = await imageToTiles(file);

  const merged = {
    documentType: '', storeName: '', storeNumber: '', address: '', drawingNumber: '',
    circuits: [], fieldTasks: [], rackTasks: [], parts: [], rcNotes: [], flags: [],
    nightWorkRequired: false, nightWorkDetails: '', summaries: [],
  };
  const circuitIndex = new Map(); // circuitId -> index in merged.circuits
  const seenTask = new Set(), seenRack = new Set(), seenPart = new Set();

  const passes = [
    { base64: full, tile: null },
    ...tiles.map(t => ({ base64: t.base64, tile: { tileNum: t.tileNum, tilesTotal: t.tilesTotal } })),
  ];

  for (const { base64, tile } of passes) {
    const raw = await callClaudeVision(base64, fileName, tile);
    const parsed = raw ? parseAIJson(raw) : null;
    if (!parsed) continue;

    if (parsed.documentType && !merged.documentType) merged.documentType = parsed.documentType;
    if (parsed.storeName && !merged.storeName) merged.storeName = parsed.storeName;
    if (parsed.storeNumber && !merged.storeNumber) merged.storeNumber = parsed.storeNumber;
    if (parsed.address && !merged.address) merged.address = parsed.address;
    if (parsed.drawingNumber && !merged.drawingNumber) merged.drawingNumber = parsed.drawingNumber;
    if (parsed.nightWorkRequired) merged.nightWorkRequired = true;
    if (parsed.nightWorkDetails && !merged.nightWorkDetails) merged.nightWorkDetails = parsed.nightWorkDetails;

    (parsed.circuits || []).forEach(c => {
      const id = String(c.circuitId || '').toUpperCase().trim();
      if (!id) return;
      if (circuitIndex.has(id)) {
        // Fill any empty/zero fields on the existing circuit from this pass —
        // one tile may catch the run length, another the pipe sizes.
        const existing = merged.circuits[circuitIndex.get(id)];
        Object.keys(c).forEach(k => {
          const v = c[k];
          const empty = existing[k] === '' || existing[k] === 0 || existing[k] == null;
          if (empty && v !== '' && v !== 0 && v != null) existing[k] = v;
        });
      } else {
        circuitIndex.set(id, merged.circuits.length);
        merged.circuits.push({ ...c });
      }
    });
    (parsed.fieldTasks || []).forEach(t => {
      const k = normMergeKey(t.desc);
      if (!k || seenTask.has(k)) return;
      seenTask.add(k); merged.fieldTasks.push(t);
    });
    (parsed.rackTasks || []).forEach(t => {
      const k = normMergeKey(t.desc);
      if (!k || seenRack.has(k)) return;
      seenRack.add(k); merged.rackTasks.push(t);
    });
    (parsed.parts || []).forEach(p => {
      const k = normMergeKey(p.partId) + '|' + normMergeKey(p.description);
      if (k === '|' || seenPart.has(k)) return;
      seenPart.add(k); merged.parts.push(p);
    });
    (parsed.rcNotes || []).forEach(n => merged.rcNotes.push(n));
    (parsed.flags || []).forEach(f => merged.flags.push(f));
    if (parsed.summary) merged.summaries.push(parsed.summary);
  }

  merged.summary = merged.summaries.join(' ');
  return merged;
}

// ── HVAC MECHANICAL DRAWING VISION ─────────────────────────────────────────────
// Mechanical sheets (ductwork plans like "M2.1 NEW MECHANICAL PLAN", hydronic
// piping plans like "M2.2 NEW MECHANICAL PIPING PLAN", or equipment schedules)
// are a completely different document type from the refrigeration redline/BPR
// the standard vision prompt targets. Here the priced takeoff is: equipment
// units (AHU/FCU/VAV/EF/RTU/CU…), air devices (diffusers/grilles with neck size
// + CFM + "TYP." counts), duct runs (rectangular WxH and round ⌀ sizes), and —
// on a piping sheet — hydronic/refrigerant pipe runs (size + service). Duct/pipe
// LENGTH is almost never labeled on these plans (it's scaled off the drawing),
// so the prompt is told NOT to invent lengths — sizes, counts and CFM are what's
// actually on the page.
const HVAC_VISION_PROMPT = `You are an expert commercial HVAC estimator reading a mechanical drawing sheet — a ductwork plan, a hydronic/refrigerant piping plan, or an equipment schedule. The image may be rotated; read ALL text regardless of orientation.

Extract the following EXACTLY as written — never round, simplify, or invent:

1) TITLE BLOCK: drawing number (e.g. "M2.1"), drawing title (e.g. "NEW MECHANICAL PLAN"), project name, and date if shown.

2) EQUIPMENT — units shown as TAGS, either inside hexagons/ovals/boxes OR as plain text labels next to the unit (e.g. "AHU-1 ON ROOF", "ASHP-1 ON ROOF", "ERV-2"). Capture each distinct tag ONCE. Common prefixes and what they mean: RTU=rooftop unit, AHU=air handling unit, FCU=fan coil unit, VAV=variable air volume box, CU=condensing unit, AC=AC/condenser unit, EF=exhaust fan, TF=transfer fan, MAU=make-up air unit, ERV/HRV=energy/heat recovery ventilator, ASHP/HP=heat pump (air-source), CU/CH=condensing unit/chiller, P=pump, B=boiler, FF=force-flow/cabinet/unit heater, HC=heating coil, UH=unit heater, MB=mixing box, BH/FH=baseboard/finned-tube heater. Return {tag, type, notes}; infer type from the prefix. If the same tag appears repeatedly it is still ONE entry — say so in notes.

3) AIR DEVICES — supply diffusers, return/exhaust grilles, registers. They read as TYPE-NUMBER with a neck size and a CFM, e.g. "CD-1 8\"⌀ 100" = ceiling diffuser CD-1, 8 inch round neck, 100 CFM. They MAY also carry a face/grille size before the tag, e.g. "24x24 CD-1 8\"⌀ NECK 200 CFM" = 24x24 face, 8" neck, 200 CFM — capture that face size too. Prefixes: CD=ceiling/supply diffuser, SG=supply grille, RG=return grille, EG or ED=exhaust grille/diffuser, TG=transfer grille, LD=linear diffuser. A "(TYP. n)" note means n identical devices — put n in qty. Return {tag, deviceType, faceSize, neckSize, cfm, qty}.

4) DUCT RUNS — duct segments labeled with a size on the run. Rectangular ducts are "WxH" (e.g. "24x16", "60x24"). Round ducts use a diameter mark (e.g. "8\"⌀", "12 DIA", "10∅"). Capture every distinct size you can read. Note "UP THRU ROOF" or the service (supply/return/exhaust/outside air) when indicated. Return {shape:"rect"|"round", size, service, notes}. Do NOT report duct LENGTH unless a length with ft or ' is explicitly written on the run — these plans scale length off the drawing, so guessing it is wrong.

5) PIPE RUNS — on a piping plan, hydronic/refrigerant lines labeled with size + service, e.g. "4\" CHWS&R" (chilled water supply & return), "2½\" HWS&R" (hot water S&R), "1\" HWR". Return {size, service, notes}.

6) RADIANT / HYDRONIC HEATING ZONES — many hydronic jobs tag heating zones as "ZONE n" with a heating load in MBH or BTUH (e.g. "ZONE 10  35.1 MBH", "ZONE 1  24.5 MBH"). A "RADIANT FLOOR HEATING SUMMARY" table may also list, per zone: manifold no., room, area (sq ft), number of loops, capacity (BTUH), flow (GPM), and tube spacing. Capture each zone as {zone, room, loadMBH, area, loops, notes} — pull whatever of those is shown; loadMBH is the MBH number (convert BTUH to MBH by dividing by 1000 if only BTUH is given).

7) COST-AFFECTING GENERAL NOTES — capture as flags (type "warn") any standing note that changes the price of the work, verbatim. Common ones: duct lining/insulation requirements ("ALL SUPPLY AND RETURN DUCTWORK SHALL BE PROVIDED WITH 1.5\" THICK LINING"), flex connections at diffusers, double-wall duct, welded fittings, seismic bracing, or anything that says it "shall be" provided/installed a certain way. These drive material and labor cost even though they aren't a tag.

If you cannot actually read a value, leave it empty — do not guess tags, sizes, CFM, loads, or counts.

Return ONLY valid JSON, no markdown:
{"documentType":"mechanical_plan|piping_plan|equipment_schedule|unknown","drawingNumber":"","drawingTitle":"","projectName":"","date":"","equipment":[{"tag":"","type":"","notes":""}],"airDevices":[{"tag":"","deviceType":"","faceSize":"","neckSize":"","cfm":0,"qty":1}],"ductRuns":[{"shape":"","size":"","service":"","notes":""}],"pipeRuns":[{"size":"","service":"","notes":""}],"hydronicZones":[{"zone":"","room":"","loadMBH":0,"area":0,"loops":0,"notes":""}],"flags":[{"type":"info|warn","text":""}],"summary":"one sentence describing the sheet"}`;

export async function callClaudeVisionHVAC(base64Image, fileName, tile = null) {
  try {
    const tileContext = tile && tile.tilesTotal > 1
      ? `\n\nNOTE: This image is section ${tile.tileNum} of ${tile.tilesTotal} cropped from a single larger sheet — read only tags/labels fully legible within this crop; another tile and the full-sheet pass cover the rest, and the merge dedups overlap.`
      : '';
    const res = await fetch('/api/claude-direct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Image } },
            { type: 'text', text: HVAC_VISION_PROMPT + tileContext }
          ]
        }]
      })
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.content?.[0]?.text || data.choices?.[0]?.message?.content || null;
  } catch (e) {
    console.warn('HVAC vision error:', e.message);
    return null;
  }
}

// Fresh, empty HVAC takeoff accumulator + the dedupe keys used to merge passes.
function newHvacMerged() {
  return {
    documentType: '', drawingNumber: '', drawingTitle: '', projectName: '', date: '',
    equipment: [], airDevices: [], ductRuns: [], pipeRuns: [], hydronicZones: [], flags: [], summaries: [],
  };
}
function absorbHvac(merged, parsed, seen) {
  if (!parsed) return;
  if (parsed.documentType && !merged.documentType) merged.documentType = parsed.documentType;
  if (parsed.drawingNumber && !merged.drawingNumber) merged.drawingNumber = parsed.drawingNumber;
  if (parsed.drawingTitle && !merged.drawingTitle) merged.drawingTitle = parsed.drawingTitle;
  if (parsed.projectName && !merged.projectName) merged.projectName = parsed.projectName;
  if (parsed.date && !merged.date) merged.date = parsed.date;
  (parsed.equipment || []).forEach(e => {
    const tag = String(e.tag || '').toUpperCase().trim();
    if (!tag) return;
    const k = 'eq|' + tag;
    if (seen.has(k)) return; seen.add(k);
    merged.equipment.push({ ...e, tag });
  });
  (parsed.airDevices || []).forEach(d => {
    const tag = String(d.tag || '').toUpperCase().trim();
    const k = 'ad|' + tag + '|' + (d.neckSize || '') + '|' + (d.cfm || '');
    if (!tag && !d.cfm) return;
    if (seen.has(k)) return; seen.add(k);
    merged.airDevices.push({ ...d, tag, qty: d.qty || 1 });
  });
  (parsed.ductRuns || []).forEach(r => {
    const size = String(r.size || '').trim();
    if (!size) return;
    const k = 'dr|' + (r.shape || '') + '|' + size.toLowerCase() + '|' + (r.service || '');
    if (seen.has(k)) return; seen.add(k);
    merged.ductRuns.push({ ...r, size });
  });
  (parsed.pipeRuns || []).forEach(r => {
    const size = String(r.size || '').trim();
    if (!size) return;
    const k = 'pr|' + size.toLowerCase() + '|' + (r.service || '').toLowerCase();
    if (seen.has(k)) return; seen.add(k);
    merged.pipeRuns.push({ ...r, size });
  });
  (parsed.hydronicZones || []).forEach(z => {
    const zone = String(z.zone || '').toUpperCase().trim();
    if (!zone && !z.loadMBH) return;
    const k = 'hz|' + zone + '|' + (z.room || '');
    if (seen.has(k)) return; seen.add(k);
    merged.hydronicZones.push({ ...z, zone });
  });
  (parsed.flags || []).forEach(f => merged.flags.push(f));
  if (parsed.summary) merged.summaries.push(parsed.summary);
}
function finishHvac(merged) {
  merged.summary = merged.summaries.join(' ');
  delete merged.summaries;
  return merged;
}

// Image upload of an HVAC sheet (photo or screenshot): full image + tiles.
export async function analyzeHvacPlanImage(file, fileName) {
  const { full, tiles } = await imageToTiles(file);
  const merged = newHvacMerged();
  const seen = new Set();
  const passes = [{ base64: full, tile: null }, ...tiles.map(t => ({ base64: t.base64, tile: { tileNum: t.tileNum, tilesTotal: t.tilesTotal } }))];
  for (const { base64, tile } of passes) {
    const raw = await callClaudeVisionHVAC(base64, fileName, tile);
    absorbHvac(merged, raw ? parseAIJson(raw) : null, seen);
  }
  return finishHvac(merged);
}

// PDF upload of an HVAC sheet (CAD/Bluebeam export, usually a flattened raster):
// render each page + tiles to images and read via the HVAC vision prompt. These
// sheets are graphics, not a text layer, so there's no deterministic shortcut.
export async function analyzeHvacPlanPdf(file, fileName) {
  const { renderPdfPagesToImages } = await import('./pdfRender.js');
  const merged = newHvacMerged();
  const seen = new Set();
  const { pages, truncated } = await renderPdfPagesToImages(file);
  for (const { pageNum, tileNum = 1, tilesOnPage = 1, base64 } of pages) {
    const raw = await callClaudeVisionHVAC(base64, fileName, { tileNum, tilesTotal: tilesOnPage });
    const parsed = raw ? parseAIJson(raw) : null;
    if (!parsed) {
      merged.flags.push({ type: 'warn', text: `Page ${pageNum}${tilesOnPage > 1 ? ` (section ${tileNum}/${tilesOnPage})` : ''}: could not be analyzed`, source: fileName });
      continue;
    }
    absorbHvac(merged, parsed, seen);
  }
  if (truncated) merged.flags.push({ type: 'warn', text: 'Document has more pages than were analyzed (limit reached) — some sheets may be missing', source: fileName });
  return finishHvac(merged);
}

export function parseAIJson(text) {
  try {
    let clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const first = clean.indexOf('{');
    const last = clean.lastIndexOf('}');
    if (first >= 0 && last > first) clean = clean.slice(first, last + 1);
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

export async function parseDocFile(base64, fileName) {
  const res = await fetch('/api/parse-doc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileData: base64, fileName }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`parse-doc error ${res.status}: ${text.slice(0, 100)}`);
  }
  return res.json();
}

export async function parseExcelFile(base64, fileName) {
  const res = await fetch('/api/parse-excel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileData: base64, fileName }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`parse-excel error ${res.status}: ${text.slice(0, 100)}`);
  }
  return res.json();
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string' && result.includes(',')) {
        resolve(result.split(',')[1]);
      } else {
        reject(new Error('Failed to read file as base64'));
      }
    };
    reader.onerror = () => reject(new Error(`FileReader error: ${reader.error?.message || 'unknown'}`));
    reader.readAsDataURL(file);
  });
}

// maxSize raised from 2400 (and a separate 1600 cap for files under 500KB,
// now removed) to 3200. Dense architectural sheets — a full redline drawing
// with small callout text — need every available pixel for that text to stay
// legible; a small compressed file size doesn't mean low detail, it can just
// mean efficient JPEG compression on a still-dense image. The old file-size
// split was sending SMALLER images for files that happened to compress well,
// which is backwards — file size and required resolution aren't correlated.
// 3200 is still comfortably below where Claude's vision pipeline begins
// downscaling on its own end, so this is real, usable extra detail, not
// wasted upload bandwidth.
export function imageToJpeg(file, maxSize = 3200) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width: w, height: h } = img;
      if (w > maxSize || h > maxSize) {
        if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
        else { w = Math.round(w * maxSize / h); h = maxSize; }
      }
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      // Quality bumped from 0.92 to 0.95 — at this file's size, JPEG artifacting
      // around small text edges (which already pushed legibility to the edge
      // here) is worth the modest extra upload size to avoid compounding the
      // resolution problem with compression noise on top of it.
      resolve(c.toDataURL('image/jpeg', 0.95).split(',')[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });
}

// ── .EML (BID EMAIL) → TEXT ─────────────────────────────────────────────────────
// Bid invitations frequently arrive as a saved email (.eml). Parse the body
// client-side (text/plain preferred, HTML stripped as fallback) so it can route
// through the same bid-letter / scope analysis as a pasted email or .doc.
function decodeQuotedPrintable(s) {
  return s.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}
function stripHtml(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<\/(p|div|tr|li|h[1-6]|table)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&#39;/g, "'").replace(/&quot;/gi, '"')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
}
export function emlToText(raw) {
  const text = String(raw || '').replace(/\r\n/g, '\n');

  // Collect every MIME boundary declared anywhere (emails nest multipart/related
  // > multipart/alternative > text/plain), then split flat on all of them so a
  // deeply-nested text part is reached regardless of nesting depth.
  const boundaries = [...text.matchAll(/boundary="?([^"\n;]+)"?/gi)].map(m => m[1]);
  if (boundaries.length) {
    const esc = b => b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const splitRe = new RegExp('\\n--(?:' + boundaries.map(esc).join('|') + ')(?:--)?\\n', 'g');
    const segments = ('\n' + text).split(splitRe);
    const bodies = [];
    for (const seg of segments) {
      const sep = seg.indexOf('\n\n');
      if (sep < 0) continue;
      const headers = seg.slice(0, sep).toLowerCase();
      let body = seg.slice(sep + 2);
      const isPlain = /content-type:\s*text\/plain/.test(headers);
      const isHtml = /content-type:\s*text\/html/.test(headers);
      if (!isPlain && !isHtml) continue;                  // skip nested containers & attachments
      if (/content-transfer-encoding:\s*quoted-printable/.test(headers)) body = decodeQuotedPrintable(body);
      else if (/content-transfer-encoding:\s*base64/.test(headers)) { try { body = atob(body.replace(/\s+/g, '')); } catch { /* leave as-is */ } }
      if (isHtml) body = stripHtml(body);
      body = body.trim();
      if (body.length > 10) bodies.push({ isPlain, text: body });
    }
    // Prefer the longest text/plain part; otherwise the longest part of any kind.
    const plain = bodies.filter(b => b.isPlain).sort((a, b) => b.text.length - a.text.length)[0];
    if (plain) return plain.text;
    if (bodies.length) return bodies.sort((a, b) => b.text.length - a.text.length)[0].text;
  }

  // Single-part: take the body after the header block.
  const sep = text.indexOf('\n\n');
  const headers = sep >= 0 ? text.slice(0, sep).toLowerCase() : '';
  let body = sep >= 0 ? text.slice(sep + 2) : text;
  if (/content-transfer-encoding:\s*quoted-printable/.test(headers)) body = decodeQuotedPrintable(body);
  if (/content-type:\s*text\/html/.test(headers) || /<html|<body/i.test(body)) body = stripHtml(body);
  return body.trim();
}
export async function emailFileToText(file) {
  return emlToText(await file.text());
}

export function searchSupplier(query, supplier = 'RE Michel') {
  if (!query?.trim()) return;
  const q = query.trim();
  navigator.clipboard?.writeText(q).catch(() => {});
  const urls = {
    'RE Michel': `https://www.remichel.com/search?keywords=${encodeURIComponent(q)}`,
    'Johnstone': `https://www.johnstonesupply.com/search?query=${encodeURIComponent(q)}`,
    'Ferguson': `https://www.ferguson.com/search#q=${encodeURIComponent(q)}`,
    'Wesco': `https://www.wesco.com/search?q=${encodeURIComponent(q)}`,
    'URI': `https://www.uri.com/INTERSHOP/web/BOS/URI-URIUS-Site/en_US/-/USD/Search-SimpleSearch?SearchTerm=${encodeURIComponent(q)}&submit=Search`,
    'Baker Distributing': `https://www.bakerdist.com/search?q=${encodeURIComponent(q)}`,
    'Carrier Enterprise': `https://www.carrierenterprise.com/catalogsearch/result/?q=${encodeURIComponent(q)}`,
  };
  // Any supplier without a known site-search endpoint (e.g. a regional house
  // like Southern Refrigeration) falls back to a Google search scoped to the
  // supplier name — the button always does something useful, and new suppliers
  // can be added to the SUPPLIERS list without needing a hand-coded URL.
  const url = urls[supplier] || `https://www.google.com/search?q=${encodeURIComponent(supplier + ' ' + q)}`;
  window.open(url, '_blank');
}

const RC_KEYWORDS = /refriger|circuit|line set|lineset|suction|liquid|copper|insul|drip pan|sensor|case move|top stub|epr|evap|compres|rack|coil|oil|defrost|condenser|ice.*machine/i;
const NON_RC_KEYWORDS = /mop sink|water supply|floor drain|electrical feed|GFI|receptacle|lighting|ductwork|duct hanger|plumb|\bpaint\b|drywall|tile|concrete|GC to|general contractor/i;

export function isRCTask(desc) {
  if (!desc) return false;
  if (NON_RC_KEYWORDS.test(desc) && !RC_KEYWORDS.test(desc)) return false;
  return true;
}

// Scope/schedule documents (like a multi-week construction remodel schedule)
// can run well beyond 8,000 characters — a Food Lion remodel schedule, for
// example, is commonly 20,000-30,000+ characters covering 15-25 weeks. The old
// version of this function silently truncated to the first 8,000 characters,
// which meant only the FIRST week or two of a long schedule ever reached the
// model — everything after that (often where most of the case relocations and
// circuit-tagged RC work actually live) was never read at all. This version
// chunks the document and processes every chunk, then merges the results.
const SCOPE_CHUNK_SIZE = 9000;
const SCOPE_CHUNK_OVERLAP = 500;

function chunkText(text, size, overlap) {
  if (text.length <= size) return [text];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start = end - overlap;
  }
  return chunks;
}

// Split document text into chunks at week/date header boundaries rather than
// arbitrary character positions. Splitting mid-paragraph causes two problems:
// (1) RC tasks get orphaned from their date header when the header is in chunk
// N but the task text falls into chunk N+1 past the boundary; (2) chunks that
// start mid-paragraph in dense GC content cause the model to miss RC tasks
// buried later in the same chunk. Splitting on date headers means every chunk
// starts cleanly at a date boundary and the model always sees complete
// date→task associations. Falls back to chunkText if no date headers found.
function chunkByDateHeaders(text, maxChunkSize = SCOPE_CHUNK_SIZE) {
  const headerRe = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+\w+\s+\d+\w*[\s(]/im;
  const lines = text.split('\n');
  const chunks = [];
  let currentLines = [];
  let currentSize = 0;

  for (const line of lines) {
    const isHeader = headerRe.test(line.trim());
    const lineSize = line.length + 1;

    // Flush current chunk at a date header if we've accumulated enough content
    if (isHeader && currentSize > 500 && currentSize + lineSize > maxChunkSize) {
      chunks.push(currentLines.join('\n'));
      currentLines = [line];
      currentSize = lineSize;
      continue;
    }

    currentLines.push(line);
    currentSize += lineSize;

    // Hard size limit in case a single date block is enormous
    if (currentSize >= maxChunkSize * 1.5) {
      chunks.push(currentLines.join('\n'));
      currentLines = [];
      currentSize = 0;
    }
  }

  if (currentLines.length > 0) chunks.push(currentLines.join('\n'));
  return chunks.length > 1 ? chunks : chunkText(text, SCOPE_CHUNK_SIZE, SCOPE_CHUNK_OVERLAP);
}

export async function analyzeScopeDoc(text, fileName) {
  // This prompt assumes the document may be a long, DATED schedule (like a
  // multi-week construction remodel schedule) where RC tasks are interleaved
  // among General Contractor, Electrical, and Plumbing tasks under day/week
  // headers — not a flat list. Date/week context is preserved on every task
  // because RC's obligations in these documents are usually tied to specific
  // night-work windows and case-set sequencing, not just "do this eventually."
  const prompt = `You are an expert commercial refrigeration estimating system reading a Food Lion (or similar grocery) remodel construction schedule.

A line is RC (Refrigeration Contractor) scope if ANY of these is true — treat each as equally authoritative:

1. The line explicitly says "Refrigeration Contractor" or "RC"
2. The line describes removing, relocating, or installing a refrigerated case AND includes a circuit reference in parentheses like (C1), (A7), (B6), (A9) etc. That parenthetical circuit tag is the definitive signal this is RC work, regardless of whether the bullet mentions RC by name. Examples from real schedules:
   - "5 door QIV5V14 Frozen Seafood #20 (C1)" → RC scope (circuit C1)
   - "40' DX6XN Lunch Meat #16, 17, 18, 19 (A6)" → RC scope (circuit A6)
   - "12' Meat #8 (A9)" → RC scope (circuit A9)
   - "Remove: (Product only due to same circuits)" followed by case lines → NOT RC scope (product-only moves don't disconnect the circuit)
   - "Remove: (relocate to backroom)" followed by case lines WITH circuit refs → RC scope
3. The line describes refrigeration piping, line sets, sensor termination, or refrigerant work
4. The line names RC as an attendee or participant in a meeting or walkthrough — even if other trades are listed first. Read the ENTIRE sentence before deciding; RC may appear after GC/EC in the list. Examples:
   - "After Precon - General Contractor, Electrical Contractor, Energy Specialist, Refrigeration Contractor and Construction Manager to review prints and on-site conditions" → RC scope (RC is named, extract it)
   - "Pre-construction Meeting Today - between the SM, ASM, General Contractor, Electrical Contractor, Construction Manager and Retail Specialist MUST BE PRESENT" → extract as RC task (RC is a required sub at precon)
5. The line mentions an RCC (Refrigeration Commissioning Check) — this is the final refrigeration punchlist that RC is directly responsible for completing, regardless of whether "Refrigeration Contractor" is named explicitly:
   - "Energy Team will conduct a complete store RCC" → RC scope (RC must be present and accountable)

IMPORTANT: Many schedules have a "Refrigeration Contractor Notes" or "- Refrigeration Contractor Notes -" subsection under an early week header (often Week 1). Extract EVERY bullet under that subsection as an RC task, associated with the nearest preceding date header. These commonly include:
- Case labeling requirements (label with case #, removal/relocation status, defrost set points)
- Kick plate removal (RC to remove kick plates in affected areas before other trades can work)
- Early line-running instructions (RC to begin running new refrigeration lines early in project)
- Precon meeting attendance (RC present at Preconstruction meeting to review prints and conditions)
These are real RC obligations that affect scheduling and crew time even though they don't mention specific circuits.

Do NOT extract lines for GC, Electrical (other than sensor termination), Plumbing, Decor, or Store Operations — even if in the same date block as RC work.

For EVERY RC task you extract:
- Capture the date/week header exactly as written (e.g. "Tuesday, August 4th (Night) w7")
- Include ALL case numbers, circuit IDs, and dimensions exactly — never drop these
- Extract each bullet point as its OWN separate task — do not merge multiple bullets into one description, even if they share the same date
- If a date block has a Remove list and a Relocate list in the same night, extract each case line as a separate task under that same date header

CRITICAL EXCLUSIONS — these look like RC scope but are NOT:
- "Electrical Contractor to begin pre-wire of new case sensor cables" → EC scope, NOT RC
- "Electrician must label both ends" → EC scope, NOT RC
- Any bullet under "Electrical Contractor Notes" heading — even if it mentions sensor cables — is EC scope UNLESS it explicitly says "Refrigeration Contractor will terminate"
- The RC sensor termination task is specifically: "The Refrigeration Contractor will terminate both ends" — extract this one, reject the EC pulling/labeling bullets around it

Also read any store address mentioned anywhere in the document — capture it exactly as written.

THREE KEY DATES — find these and return them as real calendar dates (e.g. "2025-06-23" or "June 23, 2025", whatever the document shows). These are the most important fields for an estimator and every schedule formats them differently, so reason from MEANING, not from a fixed phrase:
- preconDate: the day the pre-construction / pre-con meeting actually happens (the meeting day itself). Schedules sometimes have a "mobilize / pre-con" header on the day BEFORE the meeting — if so, use the meeting day, not the mobilize day. Look for lines like "Pre-construction Meeting Today", "Pre-Con Meeting", "Preconstruction conference".
- preconTime: the meeting time on that same pre-con line if one is given (e.g. "MUST BE PRESENT at 1:00 pm" -> "1:00 pm"). Leave empty if no time is stated.
- rcFirstNightDate: the FIRST night the REFRIGERATION CONTRACTOR (RC) itself starts night work — i.e. when RC begins removing product / washing / moving / relocating refrigerated cases. This is NOT the general "Night Work Begins" milestone, which usually marks when the GENERAL CONTRACTOR's night work starts (demo, fixtures) — that is typically weeks earlier. Use the first dated night on which the RC's own case removal/relocation/move work begins (look for "remove product and wash cases", "case moves begin", "RC removes/relocates cases", the first night with refrigerated-case relocation tied to circuit tags). If the GC night-work start and the RC case-move start are different dates, return the RC one.
- jobLengthWeeks: total length of the job. If the schedule is organized in numbered weeks (w1…wN) return the highest week number; otherwise estimate total calendar weeks from the first to the last dated milestone. Return a number only.
Leave any date you cannot determine as an empty string. Do NOT guess — only return a date you can tie to a specific line in the document.

Return ONLY valid JSON, no markdown:
{"storeName":"","storeNumber":"","address":"","startDate":"","preconDate":"","preconTime":"","rcFirstNightDate":"","jobLengthWeeks":0,"fieldTasks":[{"date":"exact date/week header text","desc":"the RC task as written, including case numbers and circuit IDs","circuitRef":"circuit ID if mentioned, e.g. C1 or A7","notes":""}],"rackTasks":[{"date":"","desc":"","rack":"","notes":""}],"parts":[{"partId":"","description":"","qty":0}],"nightWorkRequired":false,"nightWorkDetails":"","minimumCrew":"","flags":[{"type":"info|warn|error","text":""}],"summary":"one sentence summarizing what RC scope this chunk covers"}

If this chunk contains no RC-relevant content at all, return the same JSON shape with empty arrays.`;

  const chunks = chunkByDateHeaders(text);
  const merged = {
    storeName: '', storeNumber: '', address: '', startDate: '',
    preconDate: '', preconTime: '', rcFirstNightDate: '', jobLengthWeeks: 0,
    fieldTasks: [], rackTasks: [], parts: [], flags: [],
    nightWorkRequired: false, nightWorkDetails: '', minimumCrew: '',
    chunkSummaries: [],
  };

  for (let i = 0; i < chunks.length; i++) {
    const chunkLabel = chunks.length > 1 ? ` (part ${i + 1} of ${chunks.length})` : '';
    const resultText = await callClaude(
      [{ role: 'user', content: `File: ${fileName}${chunkLabel}\n\nDocument text:\n${chunks[i]}\n\n${prompt}` }],
      'You are an expert commercial refrigeration estimator. Return only valid JSON.'
    );
    const parsed = parseAIJson(resultText);
    if (!parsed) {
      merged.flags.push({ type: 'warn', text: `Part ${i + 1} of ${chunks.length}: AI response could not be parsed`, source: fileName });
      continue;
    }

    if (parsed.storeName && !merged.storeName) merged.storeName = parsed.storeName;
    if (parsed.storeNumber && !merged.storeNumber) merged.storeNumber = parsed.storeNumber;
    if (parsed.address && !merged.address) merged.address = parsed.address;
    if (parsed.startDate && !merged.startDate) merged.startDate = parsed.startDate;
    if (parsed.preconDate && !merged.preconDate) merged.preconDate = parsed.preconDate;
    if (parsed.preconTime && !merged.preconTime) merged.preconTime = parsed.preconTime;
    if (parsed.rcFirstNightDate && !merged.rcFirstNightDate) merged.rcFirstNightDate = parsed.rcFirstNightDate;
    if (parsed.jobLengthWeeks && parsed.jobLengthWeeks > (merged.jobLengthWeeks || 0)) merged.jobLengthWeeks = parsed.jobLengthWeeks;
    if (parsed.minimumCrew && !merged.minimumCrew) merged.minimumCrew = parsed.minimumCrew;
    if (parsed.nightWorkRequired) merged.nightWorkRequired = true;
    if (parsed.nightWorkDetails && !merged.nightWorkDetails) merged.nightWorkDetails = parsed.nightWorkDetails;

    (parsed.fieldTasks || []).forEach(t => merged.fieldTasks.push(t));
    (parsed.rackTasks || []).forEach(t => merged.rackTasks.push(t));
    (parsed.parts || []).forEach(p => merged.parts.push(p));
    (parsed.flags || []).forEach(f => merged.flags.push(f));
    if (parsed.summary) merged.chunkSummaries.push(parsed.summary);
  }

  merged.summary = merged.chunkSummaries.join(' ');
  return merged;
}

// ── BID INVITATION / RFQ LETTER DETECTION & ANALYSIS ───────────────────────────
// A bid invitation letter is a different document type from a dated
// construction schedule, even though both commonly arrive as .doc/.docx files
// and would otherwise both route through analyzeScopeDoc. A schedule describes
// WHAT WORK happens WHEN; a bid letter describes HOW TO STRUCTURE YOUR PRICE —
// required cost categories (Materials/Refrigerant/Labor/etc.), who to contact,
// and standing notes about what's supplied by the GC/store vs the contractor
// (e.g. "Food Lion will supply Gas and drums for new A rack"). Forcing this
// through the dated-schedule prompt would mostly return empty arrays, since
// there's no date/week structure here to find — technically correct, but it
// reads as a failed extraction rather than "right tool, wrong document."
//
// Detection is content-based, not filename-based, since both document types
// commonly share the same .doc/.docx extension.
export function looksLikeBidLetter(text) {
  if (!text) return false;
  const signals = [
    /materials?\s*:\s*\$/i,
    /labor\s*:\s*\$/i,
    /total\s+bid\s+price/i,
    /rules?\s+of\s+engagement/i,
    /invited\s+to\s+bid/i,
    /bidding\s+contractor/i,
  ];
  const hits = signals.filter(re => re.test(text)).length;
  return hits >= 2;
}

export async function analyzeBidLetter(text, fileName) {
  const prompt = `You are an expert commercial refrigeration estimator reading a bid invitation letter or RFQ cover document. This is NOT a construction schedule and NOT a technical scope of work — it's the document that tells a contractor what to include in their bid and who to contact, typically sent by a purchasing or maintenance department.

Extract:
- Required bid breakdown categories (e.g. "Materials, Refrigerant, Labor, Out of Town Expenses, Total Bid Price") — list exactly what categories the bid must be broken into, if stated
- Contacts: every named person mentioned with their role/title and any phone or email given
- Supply/exclusion notes: anything stating what the STORE/GC supplies versus what the CONTRACTOR must supply or include (e.g. "Food Lion will supply Gas and drums", "refrigeration contractor will be responsible for providing the necessary refrigerant"). These matter because they can change what should or shouldn't be a line item in the bid — flag them, don't decide for the user.
- Any standing rule about responsibility split between trades (e.g. who pulls vs. terminates sensor cable) — flag this the same way
- Store number and any location mentioned
- Due date or urgency language if stated (e.g. "due ASAP")

Do NOT invent circuits, run lengths, dated tasks, or technical scope — if none of that is in this document (it usually isn't), leave those arrays empty.

Return ONLY valid JSON, no markdown:
{"documentType":"bid_letter","storeNumber":"","address":"","bidCategories":[],"contacts":[{"name":"","role":"","phone":"","email":""}],"dueInfo":"","flags":[{"type":"info|warn","text":"the supply/exclusion or responsibility-split note, stated plainly"}],"summary":"one sentence describing what this letter is asking for"}`;

  const resultText = await callClaude(
    [{ role: 'user', content: `File: ${fileName}\n\nDocument text:\n${text}\n\n${prompt}` }],
    'You are an expert commercial refrigeration estimator. Return only valid JSON.'
  );
  return parseAIJson(resultText);
}

// ── FLAT (UNDATED) SCOPE OF WORK DOCUMENT DETECTION & ANALYSIS ────────────────
// A third distinct .doc/.docx shape, alongside dated schedules and bid letters:
// a flat, undated, numbered list of standing technical/contractual requirements
// (e.g. "Refrigeration Contractor will install new suction, liquid, and oil
// filters in all racks... Suction filters are to be removed at the 90-day
// change..."). These commonly run long (16+ pages) and mix rack-level technical
// work, standing responsibility rules, and a parts list that may DUPLICATE a
// separate parts-order-form spreadsheet uploaded in the same batch.
//
// Routing this through analyzeScopeDoc (built for dated weekly schedules) would
// produce thin, oddly-shaped results since there's no date/week structure to
// find. Routing it through analyzeBidLetter would also be wrong — there's no
// "Materials: $ / Labor: $" bid breakdown request here, just technical scope.
export function looksLikeFlatScopeDoc(text) {
  if (!text) return false;
  // No date/day-of-week structure anywhere — a real signal this isn't a dated
  // schedule, combined with scope-specific language below.
  const hasDateStructure = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(text) || /week\s*#?\s*\d/i.test(text);
  if (hasDateStructure) return false;

  const signals = [
    /refrigeration\s+contractor\s+will/i,
    /refrigeration\s+contractor\s+is\s+(to|responsible)/i,
    /parts\s+list\s*:/i,
    /scope\s+of\s+work/i,
  ];
  const hits = signals.filter(re => re.test(text)).length;
  return hits >= 2;
}

export async function analyzeFlatScopeDoc(text, fileName) {
  const prompt = `You are an expert commercial refrigeration estimator reading an undated technical scope of work document — a flat, typically numbered list of standing requirements for a remodel job, NOT a dated schedule.

This document mixes several kinds of content. Separate them:
- Rack-level technical work (new evaporator coils, valve changes, oil separator floats, header repiping with pipe sizes, EPR conversions, controller programming) → rackTasks
- Field-level work (case sealing, drip pans, top stubbing, insulation, sensor termination) → fieldTasks
- A parts list, if present (often near the top, e.g. "PARTS LIST:" followed by quantities and descriptions) → parts
- Standing rules/responsibilities that affect cost or scheduling but aren't a specific task (minimum crew size requirements, "must be in your bid" statements, day-tech requirements after night work, filter change schedules at fixed intervals) → flags, type "warn" if it has a clear cost/scheduling impact, "info" otherwise

CIRCUIT-TAGGED LINE CHANGES — capture these carefully, they are priced re-pipe scope and the single most important thing to get right:
- A line that names a circuit and a pipe change, e.g. "C7 = REPLACE 7/8 SUCTION LINE WITH 1 3/8 AT MEAT COOLER" or "CHANGE EPR ON CIRCUIT 4 TO SORIT 15", is a fieldTask. Put the circuit in circuitRef ("C7", "4"), the NEW size in newSize ("1 3/8"), the OLD/existing size in oldSize ("7/8") if stated, the line type in lineType ("suction" | "liquid" | "hot gas" | "") and the location in location. Keep the full verbatim sentence in desc.
- These upsize/replace lines drive copper footage and fittings, so never summarize them — keep every size and circuit ID exactly as written, character for character.

For EVERY item, capture pipe sizes, valve sizes, or other technical specifics EXACTLY as written — do not round or simplify (e.g. "3 5/8 with 2 1/8 double riser" must stay exactly that, not generalized to "large pipe").

Pay special attention to statements that explicitly say something must be included in the bid (e.g. "MAKE SURE THIS GETS IN YOUR BIDS") — always capture these as a "warn" flag, verbatim.

Do NOT invent dates — this document has none, leave date fields empty. Do NOT invent circuit IDs unless explicitly stated.

Return ONLY valid JSON, no markdown:
{"documentType":"flat_scope","rackTasks":[{"desc":"","rack":"","notes":""}],"fieldTasks":[{"desc":"","circuitRef":"","oldSize":"","newSize":"","lineType":"","location":"","notes":""}],"parts":[{"partId":"","description":"","qty":0}],"minimumCrew":"","flags":[{"type":"info|warn","text":""}],"summary":"one sentence describing the overall scope"}

If this chunk contains no relevant content, return the same shape with empty arrays.`;

  const chunks = chunkText(text, SCOPE_CHUNK_SIZE, SCOPE_CHUNK_OVERLAP);
  const merged = { rackTasks: [], fieldTasks: [], parts: [], flags: [], minimumCrew: '', chunkSummaries: [] };

  for (let i = 0; i < chunks.length; i++) {
    const chunkLabel = chunks.length > 1 ? ` (part ${i + 1} of ${chunks.length})` : '';
    const resultText = await callClaude(
      [{ role: 'user', content: `File: ${fileName}${chunkLabel}\n\nDocument text:\n${chunks[i]}\n\n${prompt}` }],
      'You are an expert commercial refrigeration estimator. Return only valid JSON.'
    );
    const parsed = parseAIJson(resultText);
    if (!parsed) {
      merged.flags.push({ type: 'warn', text: `Part ${i + 1} of ${chunks.length}: AI response could not be parsed`, source: fileName });
      continue;
    }
    if (parsed.minimumCrew && !merged.minimumCrew) merged.minimumCrew = parsed.minimumCrew;
    (parsed.rackTasks || []).forEach(t => merged.rackTasks.push(t));
    (parsed.fieldTasks || []).forEach(t => merged.fieldTasks.push(t));
    (parsed.parts || []).forEach(p => merged.parts.push(p));
    (parsed.flags || []).forEach(f => merged.flags.push(f));
    if (parsed.summary) merged.chunkSummaries.push(parsed.summary);
  }

  merged.summary = merged.chunkSummaries.join(' ');
  return merged;
}
