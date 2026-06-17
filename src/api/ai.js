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

This type of drawing typically has colored callout boxes (orange, red, or similar) with leader lines pointing to specific locations on the floor plan. Each callout is an instruction for the refrigeration contractor (RC) — what to drop, move, connect, or rework, and where.

IMPORTANT — only extract what is actually written. Do NOT invent or estimate:
- Circuit run lengths (these are almost never given on a redline — leave them out entirely, don't guess)
- Pipe sizes, UNLESS a size is explicitly written in the callout text (e.g. "1 1/8, 1/2" written directly in the callout)
- Quantities not stated in the text

Read every callout box on the page, in whatever orientation it's drawn (the page may be rotated). For each callout:
- Capture the COMPLETE actual instruction text, not a paraphrase or a generic label
- Note the circuit ID(s) referenced if stated (e.g. "B11", "A2", "C7")
- Note the location/area if stated (e.g. "Meat Prep", "Deli Closet", "To-Go Room")
- Skip instructions that are purely for the General Contractor (lines starting with or referring to "GC TO...") — only extract RC refrigeration scope. If a callout has both GC and RC portions, extract only the RC portion.
- If a callout mentions night work, trench work, demo, or other notable conditions, include that in notes.

Also read the title block (usually a box in a corner, may be upside down or rotated): store name, store number, address, drawing/sheet number, date, drawing title.

Return ONLY valid JSON, no markdown, no commentary:
{"documentType":"redline_callout","storeName":"","storeNumber":"","address":"","drawingNumber":"","sheetTitle":"","fieldTasks":[{"desc":"complete actual callout text","circuitRef":"","location":"","statedSize":"","notes":""}],"flags":[{"type":"info|warn","text":""}],"summary":"one sentence describing what this page covers"}`;

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

export async function analyzeScopeDoc(text, fileName) {
  const prompt = `You are an expert commercial refrigeration estimating system. Extract all relevant information from this scope of work document.

Extract rackTasks (rack work: setpoint adjustments, EPR/valve changes, oil floats, filter elements, ultra-tubes, controller programming, rack part changes) and fieldTasks (field work: new line runs, drip pans, sensor terminations, insulation repairs, top stubs, case moves, sealing, night work).

Return ONLY valid JSON:
{"storeName":"","storeNumber":"","startDate":"","rackTasks":[{"desc":"","rack":"","notes":""}],"fieldTasks":[{"desc":"","notes":""}],"parts":[{"partId":"","description":"","qty":0}],"rcSchedule":[{"week":"","milestone":"","rcInvolved":true,"nightWork":false,"notes":""}],"nightWorkRequired":false,"nightWorkDetails":"","minimumCrew":"","flags":[{"type":"info|warn|error","text":""}],"summary":""}`;

  const resultText = await callClaude(
    [{ role: 'user', content: `File: ${fileName}\n\nDocument text:\n${text.slice(0, 8000)}\n\n${prompt}` }],
    'You are an expert commercial refrigeration estimator. Return only valid JSON.'
  );
  return parseAIJson(resultText);
}
