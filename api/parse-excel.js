const ExcelJS = require('exceljs');
const XLSX    = require('xlsx');
const fetch   = globalThis.fetch || require('node-fetch');

// ── CONSTANTS ──────────────────────────────────────────────────────────────────
const CYAN        = 'FF00FFFF';
const YELLOW      = 'FFFFFF00';
const LIGHT_CYAN  = 'FF69FFFF';
const LIGHT_GREEN = 'FFCCFFCC';
const LIGHT_BLUE  = 'FFADD8E6';

const INDEXED_HIGHLIGHT = {
  12: CYAN, 13: YELLOW, 42: LIGHT_GREEN, 8: LIGHT_BLUE,
  4: CYAN, 6: YELLOW, 10: LIGHT_GREEN
};

const PIPE_SIZES = ['1/4','3/8','1/2','5/8','7/8','1-1/8','1 1/8','1-3/8','1 3/8',
  '1-5/8','1 5/8','2-1/8','2 1/8','2-5/8','3-1/8','3-5/8'];

// ── HELPERS ────────────────────────────────────────────────────────────────────
function sizeToFraction(val) {
  if(!val && val !== 0) return '';
  const str = String(val).trim().replace(/"/g,'');
  if(!str || str === '0') return '';
  // Normalize compound fractions to the dash form ("1 1/8" → "1-1/8") the size
  // dropdowns AND the copper rate table both key on. .xls schedules store these
  // with a space, which matched neither — so the size showed blank in the UI and
  // priced at $0. Simple fractions (7/8, 1/2) have no space and are unaffected.
  if(str.match(/\d[\s-]\d\/\d/) || str.match(/^\d\/\d/)) return str.replace(/\s+/, '-') + '"';
  const map = {
    0.25:'1/4"',0.375:'3/8"',0.5:'1/2"',0.625:'5/8"',0.75:'3/4"',
    0.875:'7/8"',1.0:'1"',1.125:'1-1/8"',1.25:'1-1/4"',1.375:'1-3/8"',
    1.5:'1-1/2"',1.625:'1-5/8"',2.125:'2-1/8"',2.625:'2-5/8"',
    3.125:'3-1/8"',3.625:'3-5/8"'
  };
  const f = parseFloat(str);
  if(!isNaN(f) && f > 0) return map[Math.round(f*1000)/1000] || str+'"';
  return str ? str+'"' : '';
}

function getCellColor(cell) {
  try {
    const fill = cell.fill;
    if(!fill || fill.type !== 'pattern') return null;
    const fg = fill.fgColor;
    if(!fg) return null;
    if(fg.argb) return fg.argb;
    if(fg.indexed !== undefined && fg.indexed !== null)
      return INDEXED_HIGHLIGHT[fg.indexed] || null;
    return null;
  } catch { return null; }
}

function isHighlighted(color) {
  if(!color) return false;
  return [CYAN, LIGHT_CYAN, YELLOW, LIGHT_GREEN, LIGHT_BLUE].includes(color);
}

// Some BPRs mark new work with a plain gray/generic shade rather than one of
// the specific named highlight colors above — "shaded" rows the user has seen
// on real jobs that the named-color check alone would miss. Treat ANY actual
// fill color (not just the five whitelisted ones, and not pure white/none) as
// a signal worth counting, per the "any signal counts" decision: missing a
// genuinely new circuit costs real money in the field; flagging an existing
// one as new costs a few seconds of review-screen cleanup. Asymmetric risk,
// so this errs toward catching more candidates.
// Known deliberate shading colors used in BPR files to mark new work —
// gray variants specifically. These are tight, confirmed values rather than
// "anything except white," because ExcelJS frequently returns non-white
// color values from default theme fills (cells with no deliberate shading),
// which the previous loose check was incorrectly treating as a signal.
// ARGB format: first two hex chars are alpha (FF = fully opaque). Strip
// those before comparing so both 'FF808080' and '808080' match.
const KNOWN_SHADING_COLORS = new Set([
  'C0C0C0', // silver/light gray — common "new work" shade in BPRs
  '808080', // medium gray
  'A6A6A6', // Office theme gray
  'BFBFBF', // light gray variant
  'D9D9D9', // very light gray, sometimes used for pending/new rows
  '969696', // another gray variant seen in some KW files
]);

function isShaded(color) {
  if(!color) return false;
  if(isHighlighted(color)) return true;
  // Strip ARGB alpha prefix (first two chars if 8-char hex, e.g. 'FF808080' -> '808080')
  const hex = color.length === 8 ? color.slice(2).toUpperCase() : color.toUpperCase();
  return KNOWN_SHADING_COLORS.has(hex);
}

// ── LEGACY .XLS FILL READING (via SheetJS) ──────────────────────────────────
// ExcelJS is .xlsx-only, but SheetJS (read with cellStyles:true) exposes cell
// fills on legacy .xls too — as `cell.s.fgColor.rgb`. Colors come back as bare
// 6-char RRGGBB (e.g. '69FFFF') OR 8-char AARRGGBB; normalize the alpha off and
// compare against the same KWRS highlight/shading palette used on the .xlsx path
// so new-copper detection works identically for both file types.
const XLS_HIGHLIGHT_RGB = new Set(['00FFFF','69FFFF','FFFF00','CCFFCC','ADD8E6']);
function xlsFillRgb(ws, r, c) {
  if (c == null || c < 0) return null;
  const cell = ws[XLSX.utils.encode_cell({ r, c })];
  const rgb = cell && cell.s && cell.s.fgColor && cell.s.fgColor.rgb;
  return rgb ? String(rgb).toUpperCase() : null;
}
function isHighlightRgb(rgb) {
  if (!rgb) return false;
  const s = rgb.length === 8 ? rgb.slice(2) : rgb;
  if (s === 'FFFFFF') return false;              // plain white is not a mark
  return XLS_HIGHLIGHT_RGB.has(s) || KNOWN_SHADING_COLORS.has(s);
}

// Text-based new-work detection: explicit phrases that unambiguously mean
// "this is a new circuit," confirmed across real Kysor Warren and W&R BPR
// files. "Retrofit" was intentionally dropped — it describes work being
// done TO an existing circuit (door kits, EPR conversions, etc.), not a
// new circuit being added. Matching it was the source of the "all circuits
// showing up as new" bug on store 348 where existing circuits like C4, C10,
// C11 all had "Retrofit Doors" in the Heat Exchanger column.
// Only matches the Heat Exchanger column value, not the Application column,
// since Application values like "MD Fresh Meat 18,19,22" or "Beer Doors
// 37-39" don't reliably signal new-vs-existing.
const NEW_WORK_PHRASES = /^NEW$|^New\s+(Coil|Piping|Piping\s+Line|Circuit|Install)/i;
function looksLikeNewWorkText(heatExchangerValue) {
  if(!heatExchangerValue) return false;
  return NEW_WORK_PHRASES.test(String(heatExchangerValue).trim());
}

function looksLikePipeSize(val) {
  if(!val) return false;
  const str = String(val).trim();
  return PIPE_SIZES.some(s => str.replace(/"/g,'').trim() === s) ||
    /^(0\.[2-9]\d*|[1-3]\.\d+)$/.test(str);
}

function looksLikeRunLength(val) {
  const n = parseFloat(val);
  return !isNaN(n) && n > 5 && n < 2000;
}

// ── FORMAT DETECTION ──────────────────────────────────────────────────────────
// Detects a PARTS ORDER FORM (e.g. Kysor Warren "Parts Order Form" templates for
// case ends, rack parts, etc.) — a fundamentally different document shape from a
// circuit schedule. These have Part Number / Qty / Description / Where Used
// columns, not circuit IDs / run lengths / pipe sizes, and commonly carry a large
// irrelevant reference table (sales rep lookup by state) baked into the same
// sheet that would otherwise confuse a circuit-schedule parser. Detected
// separately and BEFORE the BPR/Kysor circuit-schedule checks, since a parts
// order form should never be run through that logic.
function detectPartsOrderForm(wb) {
  let isPartsOrder = false;
  wb.eachSheet(ws => {
    for(let r = 1; r <= 12; r++) {
      const row = ws.getRow(r);
      let rowText = '';
      row.eachCell(cell => { rowText += ' ' + String(cell.value||'').toLowerCase(); });
      if(rowText.match(/parts\s*order\s*form/i)) isPartsOrder = true;
      if(rowText.match(/part\s*number/i) && rowText.match(/where\s*used/i)) isPartsOrder = true;
    }
  });
  return isPartsOrder;
}

function detectFormat(wb) {
  let isBPR = false, isKysor = false, isHVAC = false, isGeneric = false;

  wb.eachSheet(ws => {
    const name = ws.name.toLowerCase();
    if(ws.name.match(/Remote\s*Hdr/i)) isBPR = true;
    if(ws.name.match(/^Rack\s+[A-Za-z]/i)) isKysor = true;
    if(name.includes('rtu') || name.includes('ahu') || name.includes('equipment') ||
       name.includes('hvac') || name.includes('schedule')) isHVAC = true;

    // Scan first 20 rows for clues
    for(let r = 1; r <= 20; r++) {
      const row = ws.getRow(r);
      let rowText = '';
      row.eachCell(cell => { rowText += ' ' + String(cell.value||'').toLowerCase(); });
      if(rowText.match(/remote\s*hdr|bpr|suction|liquid.*line|run.*len/)) isBPR = true;
      if(rowText.match(/kysor|warren|circuit.*id|[a-z]\d{2,3}/)) isKysor = true;
      if(rowText.match(/rtu|ahu|vav|tonnage|seer|cfm|static.*press/)) isHVAC = true;
    }

    // Check for numeric circuit IDs in rows 13-16 (BPR signature)
    for(let r = 13; r <= 16; r++) {
      const v = String(ws.getRow(r).getCell(1).value||'').trim();
      if(!isNaN(parseFloat(v)) && parseFloat(v) < 200) isBPR = true;
      if(v.match(/^[A-Z]\d+$/i)) isKysor = true;
    }
  });

  if(isBPR && !isKysor) return 'bpr';
  if(isKysor) return 'kysor';
  if(isHVAC) return 'hvac';
  return 'unknown';
}

// ── SHEET TO TEXT (for AI) ───────────────────────────────────────────────────
function sheetToText(ws, maxRows = 80, maxCols = 30) {
  const rows = [];
  let rowCount = 0;

  ws.eachRow((row, rowNum) => {
    if(rowNum > maxRows) return;
    const cells = [];
    for(let c = 1; c <= maxCols; c++) {
      const cell = row.getCell(c);
      const val = cell.value;
      if(val === null || val === undefined) { cells.push(''); continue; }
      // Handle rich text
      let text = '';
      if(typeof val === 'object' && val.richText)
        text = val.richText.map(r=>r.text).join('');
      else if(typeof val === 'object' && val.result !== undefined)
        text = String(val.result);
      else
        text = String(val);
      cells.push(text.trim());
    }
    // Remove trailing empty cells
    while(cells.length > 0 && cells[cells.length-1] === '') cells.pop();
    if(cells.some(c => c !== '')) rows.push(`R${rowNum}: ${cells.join(' | ')}`);
    rowCount++;
  });

  return rows.join('\n');
}

// ── DIRECT OPENROUTER CALL ──────────────────────────────────────────────────
// Calling /api/claude via a relative-turned-absolute fetch from inside ANOTHER
// serverless function is fragile — it depends on Vercel resolving VERCEL_URL
// correctly for an internal hop, adds a second cold start, and any failure
// there was being silently swallowed (caught, logged server-side where nobody
// would see it, and treated as "AI found nothing"). This calls OpenRouter
// directly instead, matching the exact request shape api/claude.js uses, so
// there's one less network hop and one less thing that can silently break.
async function callOpenRouter(messages, system) {
  // Prefer Anthropic direct with a current-generation Claude model — stronger
  // document extraction than the older gpt-4o path, which matters most on
  // unfamiliar spreadsheet formats. OpenRouter stays as the fallback when no
  // ANTHROPIC_API_KEY is configured.
  if (process.env.ANTHROPIC_API_KEY) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        // No temperature: Sonnet 5 rejects the parameter (HTTP 400).
        model: 'claude-sonnet-5', max_tokens: 4000,
        ...(system ? { system } : {}),
        messages,
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error?.message || `Anthropic error ${response.status}`);
    return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  }

  const fullMessages = system ? [{ role: 'system', content: system }, ...messages] : messages;
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + process.env.OPENROUTER_API_KEY,
      'HTTP-Referer': 'https://mechbid.vercel.app',
      'X-Title': 'MechBid'
    },
    body: JSON.stringify({ model: 'openai/gpt-4o', max_tokens: 4000, messages: fullMessages })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `OpenRouter error ${response.status}`);
  return data.choices?.[0]?.message?.content || '';
}

// ── AI EXTRACTION ──────────────────────────────────────────────────────────────
async function extractWithAI(sheetsText, fileName, format) {
  const isRefrig = format !== 'hvac';

  const systemPrompt = isRefrig
    ? `You are an expert commercial refrigeration estimating system. Extract refrigeration circuit data from equipment schedules, BPR sheets, legend sheets, or any format. Return ONLY valid JSON.`
    : `You are an expert commercial HVAC estimating system. Extract equipment schedule data from HVAC schedules. Return ONLY valid JSON.`;

  const extractionTarget = isRefrig ? ` Extract all refrigeration circuits that have new pipe runs. Look for:
- Circuit IDs (numbers, letters+numbers, or descriptive names)
- Run lengths / line lengths in feet
- Suction line sizes (horizontal and riser)
- Liquid line sizes
- Application/location descriptions
- Temperature type (medium temp coolers/cases vs low temp freezer cases)
- Rack or header assignments
- Any highlighting, "NEW" labels, or other markers indicating new work

Return JSON:
{
  "storeName": "",
  "storeNumber": "",
  "refrigerant": "",
  "format": "description of what format this appears to be",
  "circuits": [
    {
      "circuitId": "",
      "rack": "",
      "application": "",
      "runLength": 0,
      "riserLength": 0,
      "sucHoriz": "",
      "sucRiser": "",
      "liqHoriz": "",
      "tempType": "medium|low",
      "isRiserOnly": false,
      "isNew": true,
      "notes": ""
    }
  ],
  "parts": [{"partId":"","description":"","qty":0}],
  "flags": []
}` : ` Extract all HVAC equipment from the schedule. Look for:
- Equipment tags (RTU-1, AHU-2, etc.)
- Equipment types (RTU, AHU, VAV, Fan Coil, Split System, etc.)
- Tonnage or capacity (tons, BTU, CFM)
- Brand/manufacturer
- Model numbers
- Any notes about new vs existing equipment

Return JSON:
{
  "projectName": "",
  "format": "description of format",
  "equipment": [
    {
      "tag": "",
      "type": "",
      "tons": "",
      "cfm": "",
      "brand": "",
      "model": "",
      "isNew": true,
      "notes": ""
    }
  ],
  "flags": []
}`;

  const userMessage = `File: ${fileName}\n\nSheet data:\n${sheetsText}\n\n${extractionTarget}`;

  try {
    const text = await callOpenRouter([{ role: 'user', content: userMessage }], systemPrompt);
    const clean = text.replace(/```json|```/g,'').trim();
    return JSON.parse(clean);
  } catch(e) {
    console.error('AI extraction failed:', e.message);
    return null;
  }
}

// ── PARTS ORDER FORM EXTRACTION ────────────────────────────────────────────────
// Different prompt shape entirely — this is NOT hunting for circuits. Parts
// order forms list discrete items (part number, qty, description, case/location
// they go on) and are commonly used when the store/GC supplies parts directly
// (case ends, rack parts) rather than the refrigeration contractor pricing them.
// The goal here is reference visibility — "what work does this imply" — not a
// priced line-item list, since these parts typically aren't on the RC's bid.
// ── ERF (EQUIPMENT REQUEST FORM) KEY DATES ───────────────────────────────────
// The OCR Equipment Request Form carries the dates a refrigeration estimator
// needs up front — PRE-CON DATE and STORE COMPLETION DATE — as real date cells.
// Pull them deterministically (ExcelJS returns date cells as JS Dates; older
// files store them as 1900-system serials, handled by toDate).
function erfToDate(v) {
  if (v instanceof Date && !isNaN(v)) return v;
  if (v && typeof v === 'object' && v.result instanceof Date) return v.result; // formula cell
  const n = parseFloat(v);
  if (!isNaN(n) && n > 20000 && n < 80000) {       // sane Excel serial range
    const d = new Date(Math.round((n - 25569) * 86400000));
    return isNaN(d) ? null : d;
  }
  return null;
}
function fmtErfDate(d) {
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
}
// ExcelJS cells can be rich text / hyperlink / formula objects, not plain values.
function erfCellText(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map(t => t.text).join('').trim();
    if (v.text != null) return String(v.text).trim();
    if (v.result != null) return String(v.result).trim();
    return '';
  }
  return String(v).trim();
}
function detectAndExtractERF(wb) {
  let isERF = false, precon = null, completion = null, storeNo = '';
  wb.eachSheet(ws => {
    if (/equipment request|store info/i.test(ws.name)) isERF = true;
    for (let r = 1; r <= 60; r++) {
      const row = ws.getRow(r);
      row.eachCell((cell, col) => {
        const v = String(cell.value || '');
        if (/equipment request form|OCR\s*\d/i.test(v)) isERF = true;
        if (/PRE-?CON\s*DATE/i.test(v)) { isERF = true; const d = erfToDate(row.getCell(col + 1).value); if (d) precon = d; }
        if (/STORE\s*COMPLETION/i.test(v)) { const d = erfToDate(row.getCell(col + 1).value); if (d) completion = d; }
        if (/^Store\s*#?:?$/i.test(v.trim())) { const t = erfCellText(row.getCell(col + 1).value); if (t && /\d/.test(t)) storeNo = t; }
      });
    }
  });
  if (!isERF || (!precon && !completion)) return null;
  const jobLengthWeeks = (precon && completion) ? Math.round((completion - precon) / (7 * 86400000)) : null;
  return {
    preconDate: fmtErfDate(precon),
    completionDate: fmtErfDate(completion),
    jobLengthWeeks,
    storeNumber: storeNo,
  };
}

async function extractPartsOrderForm(sheetsText, fileName) {
  const systemPrompt = `You are an expert commercial refrigeration estimator reading a parts order form (e.g. a Kysor Warren or case-manufacturer parts order template). Return ONLY valid JSON.`;

  const extractionTarget = `This is a PARTS ORDER FORM, not a circuit schedule — do not look for circuit IDs, run lengths, or pipe sizes. Extract only the actual order line items: Part Number, Qty, Description, and Where Used (case number or location), ignoring any unrelated reference tables that may be embedded in the same sheet (e.g. sales rep or state lookup lists — these are template boilerplate, not order data).

These parts are often supplied by the store/GC rather than priced by the refrigeration contractor — the goal is to know what work is implied (e.g. "5 case ends on cases 7, 19, 23, 33/22, 68" tells you which cases are being relocated/modified), not to price the parts themselves.

Return JSON:
{
  "storeNumber": "",
  "formType": "case ends|rack parts|other",
  "items": [
    {"partNumber":"","qty":0,"description":"","whereUsed":""}
  ],
  "summary": "one sentence describing what work this parts list implies"
}`;

  const userMessage = `File: ${fileName}\n\nSheet data:\n${sheetsText}\n\n${extractionTarget}`;

  const text = await callOpenRouter([{ role: 'user', content: userMessage }], systemPrompt);
  const clean = text.replace(/```json|```/g,'').trim();
  return JSON.parse(clean);
}

// ── HIGHLIGHT SCANNER ────────────────────────────────────────────────────────
// Scans all sheets for highlighted cells — works across any format
function scanHighlights(wb) {
  const highlighted = {}; // rowKey -> {cells}

  wb.eachSheet((ws, sheetId) => {
    const sheetName = ws.name;
    ws.eachRow((row, rowNum) => {
      const highlightedCells = [];
      let rowHasData = false;

      row.eachCell((cell, colNum) => {
        if(cell.value !== null && cell.value !== undefined) rowHasData = true;
        const color = getCellColor(cell);
        if(isHighlighted(color)) {
          highlightedCells.push({ col: colNum, value: cell.value, color });
        }
      });

      if(highlightedCells.length > 0 && rowHasData) {
        const key = `${sheetName}_R${rowNum}`;
        highlighted[key] = {
          sheet: sheetName, row: rowNum,
          allCells: extractRowValues(row),
          highlightedCells
        };
      }
    });
  });

  return highlighted;
}

function extractRowValues(row) {
  const values = {};
  row.eachCell((cell, col) => {
    if(cell.value !== null && cell.value !== undefined) {
      let v = cell.value;
      if(typeof v === 'object' && v.richText) v = v.richText.map(r=>r.text).join('');
      else if(typeof v === 'object' && v.result !== undefined) v = v.result;
      values[col] = String(v).trim();
    }
  });
  return values;
}

// ── W&R BPR PARSER ────────────────────────────────────────────────────────────
function parseBPR(wb, circuits, meta) {
  wb.eachSheet((ws) => {
    const sName = ws.name;
    if(sName.includes('Module') || sName.includes('Chart')) return;
    if(!sName.match(/Remote\s*Hdr|Rack|RACK/i)) return;

    for(let r = 1; r <= 10; r++) {
      ws.getRow(r).eachCell((cell, col) => {
        const v = String(cell.value||'');
        if(v.match(/Food Lion|Publix|Kroger|Winn.Dixie|Harris Teeter/i) && !meta.storeName)
          meta.storeName = v.match(/([A-Za-z\s]+)\s*#?\d*/)?.[1]?.trim() || v;
        if(v.match(/Store\s*#/i)) {
          const next = ws.getRow(r).getCell(col+1);
          if(next.value && !meta.storeNo) meta.storeNo = String(next.value).trim();
        }
      });
    }

    const rack = sName.replace(/Remote\s*Hdr\s*/i,'Hdr').replace(/\s*\(\d+\)/,'')
      .replace(/^Rack\s*/i,'').replace(/^RACK\s*/i,'').trim();

    for(let rowNum = 13; rowNum <= 80; rowNum++) {
      const row = ws.getRow(rowNum);
      const circIdRaw = String(row.getCell(1).value||'').trim();
      if(!circIdRaw || isNaN(parseFloat(circIdRaw))) continue;

      const app = String(row.getCell(7).value||'').trim();
      if(!app || app.match(/SPARE/i)) continue;

      // New circuit = ANY of: highlighted/shaded line-size cells (cols
      // 22/23/24), OR explicit "new"/"retrofit" text in the Heat Exchanger
      // column (col 4) or Application column (col 7). Different
      // manufacturers and techs mark new work differently across real job
      // files — sometimes highlighted, sometimes a plain-text "NEW"/"New
      // Coil", sometimes a generic gray shade — and requiring just one
      // specific convention silently dropped circuits marked the other ways.
      const lineSizeHighlighted = [22,23,24].some(c => isHighlighted(getCellColor(row.getCell(c))));
      const lineSizeShaded = [22,23,24].some(c => isShaded(getCellColor(row.getCell(c))));
      const heatExchangerText = String(row.getCell(4).value||'');
      const newWorkText = looksLikeNewWorkText(heatExchangerText);
      const isNewCircuit = lineSizeHighlighted || lineSizeShaded || newWorkText;
      if(!isNewCircuit) continue;

      const newWorkSignal = lineSizeHighlighted ? 'highlighted' : lineSizeShaded ? 'shaded' : 'text: ' + heatExchangerText.trim();

      const run = parseFloat(row.getCell(21).value)||0;
      const sh  = sizeToFraction(row.getCell(22).value);
      const sr  = sizeToFraction(row.getCell(23).value);
      const lh  = sizeToFraction(row.getCell(24).value);
      const evap = parseFloat(String(row.getCell(9).value||'').replace('+',''))||0;
      const isRiserOnly = !run && !!sr;
      if(!run && !sr) continue;

      circuits.push({
        circuitId: `${rack}-${circIdRaw}`, rack,
        runLength: run, riserLength: 20,
        sucHoriz: sh, sucRiser: sr, liqHoriz: lh,
        tempType: evap < 0 ? 'low' : 'medium',
        application: app, isRiserOnly,
        colorType: 'new', notes: `NEW — ${newWorkSignal}`
      });
    }
  });
}

// ── KYSOR WARREN PARSER ────────────────────────────────────────────────────────
function parseKysorWarren(wb, circuits, meta) {
  wb.eachSheet((ws, sheetId) => {
    const sName = ws.name;
    if(!sName.match(/^Rack\s+[A-Za-z]/i)) return;
    const rack = sName.replace(/^Rack\s+/i,'').trim();

    if(sheetId === 1) {
      for(let r = 1; r <= 10; r++) {
        ws.getRow(r).eachCell((cell, col) => {
          const v = String(cell.value||'');
          if(v.match(/Store\s*(No|#)/i)) {
            const next = ws.getRow(r).getCell(col+1);
            if(next.value && !meta.storeNo) meta.storeNo = String(next.value);
          }
          if(v.match(/Food Lion|Publix|Kroger/i) && !meta.storeName) meta.storeName = v;
        });
      }
    }

    for(let rowNum = 14; rowNum <= 80; rowNum++) {
      const row = ws.getRow(rowNum);
      const circId = String(row.getCell(1).value||'').trim();
      if(!circId || !circId.match(/^[A-Z]\d+$/i)) continue;
      if(!circId.toUpperCase().startsWith(rack.toUpperCase())) continue;

      // New copper is run only where the PIPE-SIZE cells are marked. Highlighting
      // the circuit ID or case description — which EVERY revised circuit has — does
      // NOT mean new copper (e.g. "New Retrofit Doors" adds doors to an existing
      // circuit whose pipe stays). Confirmed against real KWRS legends (store 1086):
      // a full new circuit marks its horizontal run (Suction Horz col 23 and/or
      // Liquid Horz col 25); a riser-only add marks just the riser (Suction Riser
      // col 24 / Vert Riser col 22). Cols: 21 Run · 22 Vert Riser · 23 Suction
      // Horz · 24 Suction Riser · 25 Liquid Horz.
      const marked = c => { const col = getCellColor(row.getCell(c)); return isHighlighted(col) || isShaded(col); };
      const sucHorzM = marked(23), liqHorzM = marked(25), sucRiserM = marked(24), vRiserM = marked(22);
      const horizMarked = sucHorzM || liqHorzM;   // a new horizontal run → new circuit
      const riserMarked = sucRiserM || vRiserM;   // a new riser drop
      if(!horizMarked && !riserMarked) continue;  // pipe not marked → no new copper here
      const riserOnly = riserMarked && !horizMarked;
      const colorType = [22,23,24,25].some(c => isHighlighted(getCellColor(row.getCell(c)))) ? 'cyan' : 'shaded';

      const run   = parseFloat(row.getCell(21).value)||0;
      const riser = parseFloat(row.getCell(22).value)||20;
      const sh    = sizeToFraction(row.getCell(23).value);
      const sr    = sizeToFraction(row.getCell(24).value);
      const lh    = sizeToFraction(row.getCell(25).value);
      const evap  = parseFloat(String(row.getCell(9).value||'').replace('+',''))||0;
      const app   = String(row.getCell(7).value||row.getCell(5).value||'');
      const note  = String(row.getCell(4).value||'');

      circuits.push({
        circuitId: circId, rack,
        // Riser-only adds no new horizontal copper — zero the run so the takeoff
        // prices just the new riser, not the existing horizontal main.
        runLength: riserOnly ? 0 : run, riserLength: riser,
        sucHoriz: sh, sucRiser: sr, liqHoriz: lh,
        tempType: evap < 0 ? 'low' : 'medium',
        application: app, isRiserOnly: riserOnly,
        colorType, notes: [riserOnly ? 'RISER — new riser drop' : 'NEW CIRCUIT — new copper run', note].filter(Boolean).join(' — ')
      });
    }
  });
}

// ── XLS FALLBACK PARSER ────────────────────────────────────────────────────────
function parseXLS(xlsBuffer, circuits, meta) {
  // cellStyles:true so we can read fills — KWRS legends mark new copper by
  // highlighting the pipe-size cells, and without this every circuit in the
  // schedule (existing included) gets extracted (the "35 circuits" bug).
  const wb = XLSX.read(xlsBuffer, {type:'buffer', cellStyles:true});

  // Collect all circuit candidates first with their pipe-cell highlight flags,
  // then decide: if ANY candidate has a highlighted pipe cell, the file marks
  // new work by highlighting → keep only highlighted circuits. If nothing is
  // highlighted anywhere (older .xls with no color info, or an unmarked sheet),
  // fall back to keeping all rows so we don't silently return zero.
  const candidates = [];

  for(const sName of wb.SheetNames) {
    if(sName.includes('Module') || sName.includes('Chart')) continue;
    const ws = wb.Sheets[sName];
    const data = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
    if(!data || data.length < 5) continue;

    // "Remodel Rack A" / "Remote Hdr 1 (1173)" → a clean rack key ("A" / "Hdr1").
    // The leading "Remodel " prefix on real Food Lion KWRS sheets was leaving the
    // rack as "Remodel Rack A", producing circuit IDs like "Remodel Rack A-1".
    let rack = sName.replace(/Remote\s*Hdr\s*/i,'Hdr').replace(/\s*\(\d+\)/,'')
      .replace(/^Remodel\s+/i,'').replace(/^Rack\s*/i,'').replace(/^RACK\s*/i,'').trim();
    if(!rack || rack.match(/^Sheet\d+$/i)) rack = 'S'+(wb.SheetNames.indexOf(sName)+1);

    // Find header row with run/suction columns
    let headerRow = -1, runCol = -1, sucHCol = -1, sucRCol = -1, liqCol = -1, appCol = -1, evapCol = -1, heatCol = -1;

    // 1. Locate the Run column / header row.
    for(let r = 5; r < Math.min(data.length, 25) && runCol < 0; r++) {
      const row = data[r] || [];
      for(let c = 0; c < row.length; c++) {
        const v = String(row[c]||'').toLowerCase().trim();
        if(v==='run' || v.includes('run len') || v.includes('run length')) { runCol=c; headerRow=r; break; }
      }
    }
    if(runCol < 0) continue;

    // 2. Classify the remaining columns from the run header row. On these
    // Williams & Rowe / Kysor schedules the sub-headers read
    // Suction Horiz | Suction Riser | Liquid Horiz — keyed off the literal
    // "Horiz"/"Riser" labels so the riser column isn't missed (the "Suction"
    // group label sits one column left of "Riser", which defeated the old
    // "suct"+"riser must share a column" check and dropped every riser size).
    {
      const row = data[headerRow] || [];
      const horizCols = [], riserCols = [];
      for(let c = 0; c < row.length; c++) {
        const v = String(row[c]||'').toLowerCase().trim();
        if(/^horiz/.test(v)) horizCols.push(c);
        if(/^riser/.test(v)) riserCols.push(c);
        if((v.includes('evap') || v==='°f' || /^°\s*f$/.test(v)) && evapCol<0) evapCol=c;
        if((v.includes('exchr') || v.includes('heat exch')) && heatCol<0) heatCol=c;
        if((v==='application' || v.includes('applic')) && appCol<0) appCol=c;
      }
      sucHCol = horizCols[0] ?? (runCol+1);
      sucRCol = riserCols[0] ?? (runCol+2);
      liqCol  = horizCols[1] ?? (runCol+3);
    }
    // Evap / Heat-Exchanger / Application labels can sit on the group-header row
    // ABOVE the run row — check there if not found alongside Run.
    if(evapCol<0 || heatCol<0 || appCol<0) {
      const prev = data[headerRow-1] || [];
      for(let c = 0; c < prev.length; c++) {
        const v = String(prev[c]||'').toLowerCase().trim();
        if(v.includes('evap') && evapCol<0) evapCol=c;
        if((v.includes('exchr') || v.includes('heat exch')) && heatCol<0) heatCol=c;
        if((v==='application' || v.includes('applic')) && appCol<0) appCol=c;
      }
    }

    // Extract store info
    for(let r=0;r<Math.min(data.length,10);r++) {
      for(let c=0;c<(data[r]||[]).length;c++) {
        const v = String(data[r][c]||'');
        if(v.match(/Food Lion|Publix|Kroger|Winn.Dixie/i) && !meta.storeName) meta.storeName = v;
        if(v.match(/Store\s*(No|#)/i)) {
          const next = String(data[r][c+1]||'');
          if(next.match(/\d{3,4}/) && !meta.storeNo) meta.storeNo = next.match(/\d{3,4}/)[0];
        }
      }
    }

    for(let r = headerRow+1; r < data.length; r++) {
      const row = data[r] || [];
      const circIdRaw = String(row[0]||'').trim();
      if(!circIdRaw) continue;
      const isNumeric = !isNaN(parseFloat(circIdRaw)) && parseFloat(circIdRaw) < 200;
      const isLetter  = circIdRaw.match(/^[A-Z]\d+$/i);
      if(!isNumeric && !isLetter) continue;

      const run = parseFloat(String(row[runCol]||''))||0;
      const sh  = sizeToFraction(sucHCol>=0 ? row[sucHCol] : '');
      const sr  = sizeToFraction(sucRCol>=0 ? row[sucRCol] : '');
      const lh  = sizeToFraction(liqCol>=0  ? row[liqCol]  : '');
      // Need at least one pipe fact to be a real circuit row.
      if(!run && !sh && !sr && !lh) continue;

      const app = String(appCol>=0 ? row[appCol]||'' : row[6]||'').trim();
      if(app.match(/SPARE/i)) continue;

      // Pipe-cell highlighting = new copper. A highlighted Suction Horiz or
      // Liquid Horiz means a new horizontal run (new circuit); a highlighted
      // Suction Riser with no horizontal mark is a riser-only add. Same rule as
      // the .xlsx KWRS parser, just reading fills through SheetJS.
      const horizMarked = isHighlightRgb(xlsFillRgb(ws, r, sucHCol)) || isHighlightRgb(xlsFillRgb(ws, r, liqCol));
      const riserMarked = isHighlightRgb(xlsFillRgb(ws, r, sucRCol));

      // Temp type from the Evap °F column instead of assuming medium. Frozen
      // circuits run well below 0°F (≈ -10 to -25); medium temp is ≈ +20 to +32.
      // A 10°F split separates them cleanly and stops low-temp lines being
      // bid with medium-temp insulation.
      const evapRaw = evapCol>=0 ? String(row[evapCol]||'').replace('+','').trim() : '';
      const evap = parseFloat(evapRaw);
      const tempType = (!isNaN(evap) && evap < 10) ? 'low' : 'medium';
      const heatTxt = heatCol>=0 ? String(row[heatCol]||'').trim() : '';
      const heatNote = heatTxt && !/^0$/.test(heatTxt) ? `Heat Exchr: ${heatTxt}` : '';

      // Single-letter rack → "A1" (Food Lion convention); longer keys keep the
      // dash ("Hdr1-1") to stay unambiguous across multi-header BPRs.
      const circId = isNumeric ? (rack.length <= 2 ? `${rack}${circIdRaw}` : `${rack}-${circIdRaw}`) : circIdRaw;

      candidates.push({ circId, rack, run, sh, sr, lh, tempType, app, heatNote, horizMarked, riserMarked });
    }
  }

  // If highlighting exists anywhere, it's the new-work signal — keep only marked
  // circuits. Otherwise keep everything (no color info to filter on).
  const hasHighlightInfo = candidates.some(c => c.horizMarked || c.riserMarked);

  for(const c of candidates) {
    const marked = c.horizMarked || c.riserMarked;
    if(hasHighlightInfo && !marked) continue;
    // No-highlight fallback keeps the old stricter guards (run + suction size)
    // to avoid dragging in stray non-circuit rows.
    if(!hasHighlightInfo && (!c.run || !c.sh)) continue;

    const riserOnly = hasHighlightInfo && c.riserMarked && !c.horizMarked;
    if(circuits.find(x => x.circuitId === c.circId)) continue;

    circuits.push({
      circuitId: c.circId, rack: c.rack,
      // Riser-only adds no horizontal copper — zero the run so the takeoff
      // prices just the new riser, not the existing main.
      runLength: riserOnly ? 0 : c.run, riserLength: 20,
      sucHoriz: c.sh, sucRiser: c.sr, liqHoriz: c.lh,
      tempType: c.tempType,
      application: c.app, isRiserOnly: riserOnly,
      colorType: hasHighlightInfo ? 'cyan' : 'xls-parsed',
      notes: hasHighlightInfo
        ? [riserOnly ? 'RISER — new riser drop' : 'NEW CIRCUIT — new copper run', c.heatNote].filter(Boolean).join(' — ')
        : ['From .xls — verify manually', c.heatNote].filter(Boolean).join(' — ')
    });
  }
}

// ── MERGE AI RESULTS INTO CIRCUITS ──────────────────────────────────────────
function mergeAICircuits(aiResult, circuits) {
  if(!aiResult?.circuits?.length) return;
  for(const c of aiResult.circuits) {
    if(!c.circuitId && !c.application) continue;
    const id = c.circuitId || `${c.rack||'?'}-${circuits.length+1}`;
    if(circuits.find(x => x.circuitId === id)) continue;
    circuits.push({
      circuitId: id,
      rack: c.rack || '',
      runLength: c.runLength || 0,
      riserLength: c.riserLength || 20,
      sucHoriz: c.sucHoriz || '',
      sucRiser: c.sucRiser || '',
      liqHoriz: c.liqHoriz || '',
      tempType: c.tempType || 'medium',
      application: c.application || '',
      isRiserOnly: c.isRiserOnly || false,
      colorType: 'ai-extracted',
      notes: c.notes || 'AI extracted'
    });
  }
}

// ── PARTS-ORDER-FORM TEXT BUILDER (shared by .xls and .xlsx paths) ───────────
function sheetsToTextGeneric(wb, isXlsx) {
  let allText = '';
  if(isXlsx) {
    let sheetCount = 0;
    wb.eachSheet((ws) => {
      if(sheetCount >= 5) return;
      if(ws.name.match(/Chart|Image|Cover/i)) return;
      const text = sheetToText(ws, 80, 30);
      if(text.trim().length > 50) {
        allText += `\n\n=== Sheet: ${ws.name} ===\n${text}`;
        sheetCount++;
      }
    });
  } else {
    for(const sName of wb.SheetNames.slice(0,4)) {
      const ws = wb.Sheets[sName];
      const data = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
      allText += `\n\n=== Sheet: ${sName} ===\n`;
      allText += data.slice(0,80).map((r,i) => `R${i+1}: ${r.filter(c=>c!=='').join(' | ')}`).join('\n');
    }
  }
  return allText;
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  if(req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});

  try {
    const {fileData, fileName} = req.body;
    if(!fileData) return res.status(400).json({error:'No file data'});

    const name   = (fileName||'').toLowerCase();
    const buffer = Buffer.from(fileData, 'base64');
    const circuits = [];
    const meta   = {storeName:'', storeNo:'', refrigerant:''};
    let format   = 'unknown';
    let aiUsed   = false;
    let warning  = null;

    // ── .XLS PATH ────────────────────────────────────────────────────────────
    if(name.endsWith('.xls')) {
      // Check for parts-order-form shape FIRST, via SheetJS (works for legacy
      // .xls without needing ExcelJS's xlsx-only loader).
      try {
        const xlsWbCheck = XLSX.read(buffer, {type:'buffer'});
        let isPartsOrderXls = false;
        for(const sName of xlsWbCheck.SheetNames.slice(0,3)) {
          const ws = xlsWbCheck.Sheets[sName];
          const data = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
          const topText = data.slice(0,12).map(r=>r.join(' ')).join(' ').toLowerCase();
          if(topText.includes('parts order form') || (topText.includes('part number') && topText.includes('where used'))) {
            isPartsOrderXls = true;
          }
        }

        if(isPartsOrderXls) {
          const allText = sheetsToTextGeneric(xlsWbCheck, false);
          let partsResult = null;
          let extractError = null;
          try {
            partsResult = await extractPartsOrderForm(allText, fileName);
          } catch(e) {
            extractError = e.message;
          }
          if(partsResult) {
            return res.status(200).json({
              circuits: [],
              partsOrderForm: partsResult,
              format: 'parts-order-form',
              storeNumber: partsResult.storeNumber || '',
              aiUsed: true,
              summary: `${partsResult.items?.length || 0} part(s) found [parts order form] — ${partsResult.summary || fileName}`
            });
          }
          // Detected as a parts order form but AI extraction failed — say so
          // explicitly with the real error, rather than silently falling
          // through to the circuit parser below, which finds nothing and
          // produces a misleading "older .xls format" warning unrelated to
          // the actual problem.
          return res.status(200).json({
            circuits: [],
            format: 'parts-order-form-failed',
            warning: `${fileName} looks like a parts order form, but AI extraction failed${extractError ? ': ' + extractError : ''}. Try again, or add items manually.`,
            summary: `0 part(s) found [parts order form — extraction failed] — ${fileName}`
          });
        }
      } catch(e) { /* fall through to normal circuit parsing below */ }

      try {
        parseXLS(buffer, circuits, meta);
        format = 'xls';
        if(circuits.length === 0) {
          warning = `${fileName} is an older .xls format. Save as .xlsx for full AI extraction.`;
        }
      } catch(e) {
        warning = `Could not parse ${fileName}: ${e.message}. Try saving as .xlsx.`;
      }

      // Even for .xls, try AI on the text content
      if(circuits.length === 0) {
        try {
          const xlsWb = XLSX.read(buffer, {type:'buffer'});
          const allText = sheetsToTextGeneric(xlsWb, false);
          const aiResult = await extractWithAI(allText, fileName, 'refrigeration');
          if(aiResult?.circuits?.length) {
            mergeAICircuits(aiResult, circuits);
            if(aiResult.storeName && !meta.storeName) meta.storeName = aiResult.storeName;
            if(aiResult.storeNumber && !meta.storeNo) meta.storeNo = aiResult.storeNumber;
            aiUsed = true;
          }
        } catch(e) { /* AI extraction failed silently */ }
      }

    // ── .XLSX PATH ───────────────────────────────────────────────────────────
    } else if(name.endsWith('.xlsx')) {
      const wb = new ExcelJS.Workbook();
      await Promise.race([
        wb.xlsx.load(buffer),
        new Promise((_,rej) => setTimeout(() => rej(new Error('Timeout loading xlsx')), 20000))
      ]);

      // 0. Equipment Request Form → key bid dates (pre-con, completion, length).
      const erf = detectAndExtractERF(wb);
      if(erf) {
        return res.status(200).json({
          circuits: [],
          keyDates: { preconDate: erf.preconDate, completionDate: erf.completionDate, jobLengthWeeks: erf.jobLengthWeeks },
          storeNumber: erf.storeNumber || '',
          format: 'erf',
          summary: `Equipment Request Form — pre-con ${erf.preconDate || 'n/a'}${erf.jobLengthWeeks ? `, ~${erf.jobLengthWeeks} week job` : ''}`,
        });
      }

      // 1. Check for parts-order-form shape FIRST — this should never be run
      // through the circuit-schedule parsers below.
      if(detectPartsOrderForm(wb)) {
        const allText = sheetsToTextGeneric(wb, true);
        let partsResult = null;
        let extractError = null;
        try {
          partsResult = await extractPartsOrderForm(allText, fileName);
        } catch(e) {
          extractError = e.message;
        }
        if(partsResult) {
          return res.status(200).json({
            circuits: [],
            partsOrderForm: partsResult,
            format: 'parts-order-form',
            storeNumber: partsResult.storeNumber || '',
            aiUsed: true,
            summary: `${partsResult.items?.length || 0} part(s) found [parts order form] — ${partsResult.summary || fileName}`
          });
        }
        return res.status(200).json({
          circuits: [],
          format: 'parts-order-form-failed',
          warning: `${fileName} looks like a parts order form, but AI extraction failed${extractError ? ': ' + extractError : ''}. Try again, or add items manually.`,
          summary: `0 part(s) found [parts order form — extraction failed] — ${fileName}`
        });
      }

      // 2. Detect format
      format = detectFormat(wb);

      // 3. Run known parsers first (fast, free, accurate for known formats)
      if(format === 'bpr') {
        parseBPR(wb, circuits, meta);
      } else if(format === 'kysor') {
        parseKysorWarren(wb, circuits, meta);
      }

      // 4. If known parser found circuits, done. If not, use AI.
      if(circuits.length === 0 || format === 'unknown') {
        const allSheetsText = sheetsToTextGeneric(wb, true);

        if(allSheetsText.trim().length > 100) {
          const aiResult = await extractWithAI(allSheetsText, fileName, format);
          if(aiResult) {
            // Merge AI circuits (avoids duplicates)
            mergeAICircuits(aiResult, circuits);
            if(aiResult.storeName && !meta.storeName) meta.storeName = aiResult.storeName;
            if(aiResult.storeNumber && !meta.storeNo) meta.storeNo = aiResult.storeNumber;
            if(aiResult.refrigerant) meta.refrigerant = aiResult.refrigerant;
            if(aiResult.format) format = aiResult.format;
            aiUsed = true;

            // HVAC equipment result
            if(aiResult.equipment?.length) {
              return res.status(200).json({
                circuits: [],
                equipment: aiResult.equipment,
                format: 'hvac-ai',
                storeName: meta.storeName,
                storeNumber: meta.storeNo,
                aiUsed: true,
                summary: `${aiResult.equipment.length} equipment item(s) found [AI] — ${fileName}`
              });
            }
          }
        }
      }

      // 5. Always run highlight scanner as supplemental check
      if(format === 'unknown' || circuits.length === 0) {
        const highlights = scanHighlights(wb);
        const highlightCount = Object.keys(highlights).length;
        if(highlightCount > 0 && circuits.length === 0) {
          warning = `Found ${highlightCount} highlighted row(s) but could not parse circuit data. The AI attempted extraction — please verify results.`;
        }
      }

    } else {
      return res.status(200).json({
        circuits: [], format: 'unsupported',
        warning: `${fileName}: Unsupported file type. Upload .xlsx or .xls files.`,
        summary: '0 circuits — unsupported format'
      });
    }

    const racks = [...new Set(circuits.map(c=>c.rack).filter(Boolean))];

    if(circuits.length === 0 && !warning) {
      warning = `No new circuits found in ${fileName}. If this file has new circuits, they may not be highlighted or marked as new. Try uploading a screenshot of the sheet for AI vision extraction.`;
    }

    return res.status(200).json({
      circuits,
      format: aiUsed ? `${format}-ai` : format,
      storeName: meta.storeName,
      storeNumber: meta.storeNo,
      refrigerant: meta.refrigerant,
      aiUsed,
      warning,
      summary: `${circuits.length} circuit(s) found [${aiUsed?'AI+':''}${format}] across: ${racks.join(', ') || 'no racks detected'}`
    });

  } catch(err) {
    return res.status(500).json({error: err.message});
  }
};
