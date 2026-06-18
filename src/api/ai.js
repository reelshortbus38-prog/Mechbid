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

// Vision call - uses /api/claude with image support
export async function callClaudeVision(base64Image, fileName) {
  try {
    const prompt = `You are an expert commercial refrigeration estimating system analyzing construction documents.

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

    const res = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
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
export async function callClaudeVisionRedline(base64Image, fileName, pageNum, totalPages) {
  try {
    const pageContext = totalPages > 1 ? ` This is page ${pageNum} of ${totalPages} in a multi-sheet drawing set.` : '';
    const prompt = `You are an expert commercial refrigeration estimator reading a redlined floor plan or piping plan.${pageContext}

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

    const res = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
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
export async function analyzeRedlinePdf(file, fileName) {
  const { renderPdfPagesToImages } = await import('./pdfRender.js');
  const { pages, totalPages, truncated } = await renderPdfPagesToImages(file);

  const merged = {
    documentType: 'redline_callout',
    storeName: '', storeNumber: '', address: '', drawingNumber: '',
    fieldTasks: [], flags: [], pageSummaries: [],
  };

  for (const { pageNum, base64 } of pages) {
    const raw = await callClaudeVisionRedline(base64, fileName, pageNum, totalPages);
    if (!raw) {
      merged.flags.push({ type: 'warn', text: `Page ${pageNum}: could not be analyzed`, source: fileName });
      continue;
    }
    const parsed = parseAIJson(raw);
    if (!parsed) {
      merged.flags.push({ type: 'warn', text: `Page ${pageNum}: AI response could not be parsed`, source: fileName });
      continue;
    }

    if (parsed.storeName && !merged.storeName) merged.storeName = parsed.storeName;
    if (parsed.storeNumber && !merged.storeNumber) merged.storeNumber = parsed.storeNumber;
    if (parsed.address && !merged.address) merged.address = parsed.address;
    if (parsed.drawingNumber && !merged.drawingNumber) merged.drawingNumber = parsed.drawingNumber;

    (parsed.fieldTasks || []).forEach(t => {
      merged.fieldTasks.push({ ...t, pageNum });
    });
    (parsed.flags || []).forEach(f => merged.flags.push(f));
    if (parsed.summary) merged.pageSummaries.push(`Page ${pageNum}: ${parsed.summary}`);
  }

  if (truncated) {
    merged.flags.push({ type: 'warn', text: `Document has more pages than were analyzed (limit reached) — some sheets may be missing from this extraction`, source: fileName });
  }

  merged.summary = merged.pageSummaries.join(' ');
  return merged;
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

export function imageToJpeg(file, maxSize = 2400) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width: w, height: h } = img;
      const MAX = file.size > 500000 ? maxSize : 1600;
      if (w > MAX || h > MAX) {
        if (w > h) { h = Math.round(h * MAX / w); w = MAX; }
        else { w = Math.round(w * MAX / h); h = MAX; }
      }
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/jpeg', 0.92).split(',')[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });
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
  };
  window.open(urls[supplier] || urls['RE Michel'], '_blank');
}

const RC_KEYWORDS = /refriger|circuit|line set|lineset|suction|liquid|copper|insul|drip pan|sensor|case move|top stub|epr|evap|compres|rack|coil|oil|defrost|condenser|ice.*machine/i;
const NON_RC_KEYWORDS = /mop sink|water supply|floor drain|electrical feed|GFI|receptacle|lighting|ductwork|duct hanger|plumb|paint|drywall|tile|concrete|GC to|general contractor/i;

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
// Overlap between chunks so a task description that happens to fall right at
// a chunk boundary doesn't get cut in half and lost or duplicated oddly.
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

export async function analyzeScopeDoc(text, fileName) {
  // This prompt assumes the document may be a long, DATED schedule (like a
  // multi-week construction remodel schedule) where RC tasks are interleaved
  // among General Contractor, Electrical, and Plumbing tasks under day/week
  // headers — not a flat list. Date/week context is preserved on every task
  // because RC's obligations in these documents are usually tied to specific
  // night-work windows and case-set sequencing, not just "do this eventually."
  const prompt = `You are an expert commercial refrigeration estimating system reading a construction remodel schedule. This document is organized by week and date, with bullet points under each date describing work for different trades (General Contractor, Electrical Contractor, Plumbing Contractor, Refrigeration Contractor, etc.) — often in the same paragraph block.

Your job: find every bullet point that is Refrigeration Contractor (RC) scope, and ONLY those. A line is RC scope if it explicitly says "Refrigeration Contractor" or "RC", OR if it describes case removal/relocation/installation, refrigeration line/circuit work, sensor termination (the RC terminates sensor cable ends — note: the Electrical Contractor PULLS the cable, but RC TERMINATES it, so termination lines belong to RC), case labeling for refrigeration purposes, or refrigeration piping.

Do NOT extract lines that are purely General Contractor, Electrical Contractor (other than sensor termination), Plumbing, Decor, or other trades' responsibility, even if they're in the same date block as RC work.

For EVERY RC task you extract, capture the date/week it's tied to (e.g. "Monday, September 28th (Night) w15") exactly as written in the nearest preceding date header — this matters because RC's work in these schedules is usually tied to a specific night-work window or case-set date, not just "eventually."

Also capture any circuit ID or case number mentioned in parentheses or inline (e.g. "(B6)", "(A7)", "#N74", "Case #23") — these tie directly to refrigeration circuits and should not be dropped.

Also read any store address mentioned anywhere in the document (often near the top, in a header, or near the store name/number) — capture it exactly as written.

Return ONLY valid JSON, no markdown:
{"storeName":"","storeNumber":"","address":"","startDate":"","fieldTasks":[{"date":"exact date/week header text","desc":"the RC task as written, including case numbers and circuit IDs","circuitRef":"circuit ID if mentioned, e.g. B6 or A7","notes":""}],"rackTasks":[{"date":"","desc":"","rack":"","notes":""}],"parts":[{"partId":"","description":"","qty":0}],"nightWorkRequired":false,"nightWorkDetails":"","minimumCrew":"","flags":[{"type":"info|warn|error","text":""}],"summary":"one sentence summarizing what RC scope this chunk covers"}

If this chunk of the document contains no RC-relevant content at all, return the same JSON shape with empty arrays — don't skip the response.`;

  const chunks = chunkText(text, SCOPE_CHUNK_SIZE, SCOPE_CHUNK_OVERLAP);
  const merged = {
    storeName: '', storeNumber: '', address: '', startDate: '',
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

For EVERY item, capture pipe sizes, valve sizes, or other technical specifics EXACTLY as written — do not round or simplify (e.g. "3 5/8 with 2 1/8 double riser" must stay exactly that, not generalized to "large pipe").

Pay special attention to statements that explicitly say something must be included in the bid (e.g. "MAKE SURE THIS GETS IN YOUR BIDS") — always capture these as a "warn" flag, verbatim.

Do NOT invent dates — this document has none, leave date fields empty. Do NOT invent circuit IDs unless explicitly stated.

Return ONLY valid JSON, no markdown:
{"documentType":"flat_scope","rackTasks":[{"desc":"","rack":"","notes":""}],"fieldTasks":[{"desc":"","notes":""}],"parts":[{"partId":"","description":"","qty":0}],"minimumCrew":"","flags":[{"type":"info|warn","text":""}],"summary":"one sentence describing the overall scope"}

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
