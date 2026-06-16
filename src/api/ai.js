// ── AI API CALLS ──────────────────────────────────────────────────────────────

// Call Claude via Vercel proxy (no API key exposed)
export async function callClaude(messages, system = '') {
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 4000, system, messages }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'AI error');
  return data.content?.map(b => b.text || '').join('') || '';
}

// Call Claude vision directly (Anthropic API) for blueprints
export async function callClaudeVision(base64Image, fileName) {
  try {
    const prompt = `You are an expert commercial refrigeration estimating system analyzing construction documents.

Analyze this image carefully. It may be rotated or upside down — read ALL text regardless of orientation.

If this is a BLUEPRINT, FLOOR PLAN, or REDLINE DRAWING:
- Read EVERY orange, red, or colored callout box — these contain RC field tasks
- Extract each callout as a separate fieldTask with the COMPLETE text
- Common patterns: "DROP NEW [circuit]", "CONNECT EXISTING [circuit] TO [location]", "DISCONNECT AT CASE #[N]", "FEED [size] THRU WALL"
- Skip "GC TO..." portions — only extract RC refrigeration work
- Circuit IDs: A1-A9, B1-B9, C1-C9, N1-N99
- Read title block: store name, store number, address, drawing number, date
- IMPORTANT: Use EXACT text from callouts, never placeholder text

If this is a BPR or EQUIPMENT SCHEDULE:
- Extract ALL circuits with run lengths, suction sizes, liquid sizes

Return ONLY valid JSON, no markdown:
{
  "documentType": "blueprint|fixture_plan|bpr|equipment_schedule|scope_of_work|unknown",
  "storeName": "",
  "storeNumber": "",
  "address": "",
  "drawingNumber": "",
  "circuits": [{"circuitId":"","rack":"","runLength":0,"riserLength":0,"sucHoriz":"","sucRiser":"","liqHoriz":"","tempType":"medium","application":"","isRiserOnly":false,"isNew":true,"notes":""}],
  "fieldTasks": [{"desc":"actual text from drawing","circuit":"","location":"","lineSize":"","notes":""}],
  "rackTasks": [{"desc":"","rack":"","notes":""}],
  "parts": [{"partId":"","description":"","qty":0}],
  "rcNotes": [{"text":"","costImpact":false}],
  "nightWorkRequired": false,
  "nightWorkDetails": "",
  "flags": [],
  "summary": ""
}

CRITICAL: Replace ALL placeholder text with ACTUAL content from the image. Never return "circuit", "location", "size" as literal values.`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
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
    return data.content?.[0]?.text || null;
  } catch (e) {
    console.warn('Vision error:', e.message);
    return null;
  }
}

// Parse AI result JSON robustly
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

// Analyze a Word/doc file via parse-doc API
export async function parseDocFile(base64, fileName) {
  const res = await fetch('/api/parse-doc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileData: base64, fileName }),
  });
  return res.json();
}

// Analyze an Excel/BPR file via parse-excel API
export async function parseExcelFile(base64, fileName) {
  const res = await fetch('/api/parse-excel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileData: base64, fileName }),
  });
  return res.json();
}

// Convert file to base64
export function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(',')[1]);
    r.onerror = () => rej(new Error('Read failed'));
    r.readAsDataURL(file);
  });
}

// Convert image to JPEG base64 at high res for blueprints
export function imageToJpeg(file, maxSize = 2400) {
  return new Promise((res, rej) => {
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
      res(c.toDataURL('image/jpeg', 0.92).split(',')[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Image load failed')); };
    img.src = url;
  });
}

// Search supplier
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

// RC task filters
const RC_KEYWORDS = /refriger|circuit|line set|lineset|suction|liquid|copper|insul|drip pan|sensor|case move|top stub|epr|evap|compres|rack|coil|refrig.*valve|oil|defrost|condenser|ice.*machine/i;
const NON_RC_KEYWORDS = /mop sink|water supply|floor drain|electrical feed|GFI|receptacle|lighting|ductwork|duct hanger|plumb|paint|drywall|tile|concrete|GC to|general contractor/i;

export function isRCTask(desc) {
  if (!desc) return false;
  if (NON_RC_KEYWORDS.test(desc) && !RC_KEYWORDS.test(desc)) return false;
  return true;
}

// Analyze scope doc text with Claude
export async function analyzeScopeDoc(text, fileName) {
  const prompt = `You are an expert commercial refrigeration estimating system. Extract all relevant information from this scope of work document.

Extract:
1. rackTasks - rack-specific work: setpoint adjustments, EPR/valve changes, oil floats, filter elements, ultra-tubes, controller programming, rack part changes
2. fieldTasks - field work: new line runs, drip pans, sensor terminations, insulation repairs, top stubs, case moves, sealing, night work tasks
3. parts - parts list with part numbers and quantities
4. schedule - start date, week-by-week RC schedule, night work dates, filter change schedule
5. nightWorkRequired - boolean
6. minimumCrew - e.g. "6 people for frozen food week"

Return ONLY valid JSON:
{
  "storeName": "",
  "storeNumber": "",
  "startDate": "",
  "rackTasks": [{"desc": "", "rack": "", "notes": ""}],
  "fieldTasks": [{"desc": "", "notes": ""}],
  "parts": [{"partId": "", "description": "", "qty": 0}],
  "rcSchedule": [{"week": "", "milestone": "", "rcInvolved": true, "nightWork": false, "notes": ""}],
  "nightWorkRequired": false,
  "nightWorkDetails": "",
  "minimumCrew": "",
  "filterChangeDates": {"day30": "", "day60": "", "day90": ""},
  "flags": [{"type": "info|warn|error", "text": ""}],
  "summary": ""
}`;

  const resultText = await callClaude(
    [{ role: 'user', content: `File: ${fileName}\n\nDocument text:\n${text.slice(0, 8000)}\n\n${prompt}` }],
    'You are an expert commercial refrigeration estimator. Return only valid JSON.'
  );
  return parseAIJson(resultText);
}
