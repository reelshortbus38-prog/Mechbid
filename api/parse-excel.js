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
  if(str.match(/\d[\s-]\d\/\d/) || str.match(/^\d\/\d/)) return str + '"';
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

// ── AI EXTRACTION ──────────────────────────────────────────────────────────────
// Routed through /api/claude (OpenRouter) — same path every other AI call in
// this app uses. This previously called api.anthropic.com directly with its own
// model string, which silently fails whenever the direct Anthropic key has no
// usable billing/credits, with no visible error to the user (caught by the
// try/catch below and just treated as "AI found nothing"). That mismatch is
// likely why non-standard sheets (e.g. parts order forms) returned empty
// results even when content was clearly present.
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
    const res = await fetch(`${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : ''}/api/claude`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    if(!res.ok) {
      const err = await res.text();
      throw new Error(`AI API error ${res.status}: ${err}`);
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || data.choices?.[0]?.message?.content || '';
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

  try {
    const res = await fetch(`${process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : ''}/api/claude`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      })
    });
    if(!res.ok) return null;
    const data = await res.json();
    const text = data.content?.[0]?.text || data.choices?.[0]?.message?.content || '';
    const clean = text.replace(/```json|```/g,'').trim();
    return JSON.parse(clean);
  } catch(e) {
    console.error('Parts order extraction failed:', e.message);
    return null;
  }
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

      // New circuit = highlighted line size cells (cols 22/23/24)
      const lineSizeHighlighted = [22,23,24].some(c => isHighlighted(getCellColor(row.getCell(c))));
      if(!lineSizeHighlighted) continue;

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
        colorType: 'new', notes: 'NEW — highlighted line sizes'
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

      let highlighted = false, colorType = null;
      for(let c = 1; c <= 6; c++) {
        const color = getCellColor(row.getCell(c));
        if(isHighlighted(color)) { highlighted = true; colorType = 'cyan'; break; }
      }
      if(!highlighted) continue;

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
        runLength: run, riserLength: riser,
        sucHoriz: sh, sucRiser: sr, liqHoriz: lh,
        tempType: evap < 0 ? 'low' : 'medium',
        application: app, isRiserOnly: run === 0 && !!sr,
        colorType, notes: note || ''
      });
    }
  });
}

// ── XLS FALLBACK PARSER ────────────────────────────────────────────────────────
function parseXLS(xlsBuffer, circuits, meta) {
  const wb = XLSX.read(xlsBuffer, {type:'buffer'});

  for(const sName of wb.SheetNames) {
    if(sName.includes('Module') || sName.includes('Chart')) continue;
    const ws = wb.Sheets[sName];
    const data = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
    if(!data || data.length < 5) continue;

    let rack = sName.replace(/Remote\s*Hdr\s*/i,'Hdr').replace(/\s*\(\d+\)/,'')
      .replace(/^Rack\s*/i,'').replace(/^RACK\s*/i,'').trim();
    if(!rack || rack.match(/^Sheet\d+$/i)) rack = 'S'+(wb.SheetNames.indexOf(sName)+1);

    // Find header row with run/suction columns
    let headerRow = -1, runCol = -1, sucHCol = -1, sucRCol = -1, liqCol = -1, appCol = -1;

    for(let r = 5; r < Math.min(data.length, 25); r++) {
      const row = data[r] || [];
      const nextRow = data[r+1] || [];
      for(let c = 0; c < row.length; c++) {
        const v = String(row[c]||'').toLowerCase().trim();
        const v2 = String(nextRow[c]||'').toLowerCase().trim();
        const combined = v + ' ' + v2;
        if((v==='run'||v.includes('run len')||combined.includes('run len')) && runCol<0) { runCol=c; headerRow=r; }
        if((v.includes('suct')||combined.includes('suct')) && (v2.includes('hor')||v2==='horiz') && sucHCol<0) sucHCol=c;
        if((v.includes('suct')||combined.includes('suct')) && (v2.includes('ris')) && sucRCol<0) sucRCol=c;
        if((v.includes('liq')||combined.includes('liq')) && (v2.includes('hor')||v2==='horiz') && liqCol<0) liqCol=c;
        if(v==='application'||v.includes('applic')) appCol=c;
      }
      if(runCol>=0 && sucHCol>=0) break;
    }

    if(runCol < 0) continue;

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
      if(!run) continue;

      const sh  = sizeToFraction(sucHCol>=0 ? row[sucHCol] : '');
      if(!sh) continue;

      const sr  = sizeToFraction(sucRCol>=0 ? row[sucRCol] : '');
      const lh  = sizeToFraction(liqCol>=0  ? row[liqCol]  : '');
      const app = String(appCol>=0 ? row[appCol]||'' : row[6]||'').trim();
      if(app.match(/SPARE/i)) continue;

      const circId = isNumeric ? `${rack}-${circIdRaw}` : circIdRaw;
      if(!circuits.find(c => c.circuitId === circId)) {
        circuits.push({
          circuitId: circId, rack,
          runLength: run, riserLength: 20,
          sucHoriz: sh, sucRiser: sr, liqHoriz: lh,
          tempType: 'medium',
          application: app, isRiserOnly: false,
          colorType: 'xls-parsed',
          notes: 'From .xls — verify manually'
        });
      }
    }
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
          const partsResult = await extractPartsOrderForm(allText, fileName);
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

      // 1. Check for parts-order-form shape FIRST — this should never be run
      // through the circuit-schedule parsers below.
      if(detectPartsOrderForm(wb)) {
        const allText = sheetsToTextGeneric(wb, true);
        const partsResult = await extractPartsOrderForm(allText, fileName);
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
