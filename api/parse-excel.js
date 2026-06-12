const ExcelJS = require('exceljs');
const XLSX = require('xlsx');

const CYAN = 'FF00FFFF';
const YELLOW = 'FFFFFF00';
const LIGHT_CYAN = 'FF69FFFF';
const LIGHT_GREEN = 'FFCCFFCC';

function sizeToFraction(val) {
  if(!val && val !== 0) return '';
  const str = String(val).trim().replace(/"/g,'');
  if(!str || str === '0') return '';
  if(str.match(/\d[\s-]\d\/\d/) || str.match(/^\d\/\d/)) return str + '"';
  const map = {
    0.25:'1/4"',0.375:'3/8"',0.5:'1/2"',0.625:'5/8"',
    0.75:'3/4"',0.875:'7/8"',1.0:'1"',1.125:'1-1/8"',
    1.25:'1-1/4"',1.375:'1-3/8"',1.5:'1-1/2"',1.625:'1-5/8"',
    2.125:'2-1/8"',2.625:'2-5/8"',3.125:'3-1/8"',3.625:'3-5/8"'
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
    return fg.argb || null;
  } catch { return null; }
}

function isHighlighted(color) {
  if(!color) return false;
  return [CYAN, LIGHT_CYAN, YELLOW, LIGHT_GREEN].includes(color);
}

// Parse Kysor Warren format (.xlsx with cell color highlighting)
function parseKysorWarren(wb, circuits, meta) {
  wb.eachSheet((ws, sheetId) => {
    const sName = ws.name;
    if(!sName.match(/^Rack\s+[A-Za-z]/i)) return;
    const rack = sName.replace(/^Rack\s+/i,'').trim();

    if(sheetId === 1) {
      for(let r = 1; r <= 10; r++) {
        const row = ws.getRow(r);
        row.eachCell((cell, col) => {
          const v = String(cell.value||'');
          if(v.match(/Store\s*(No|#)/i)) {
            const next = ws.getRow(r).getCell(col+1);
            if(next.value && !meta.storeNo) meta.storeNo = String(next.value);
          }
          if(v === 'Food Lion' && !meta.storeName) meta.storeName = v;
        });
      }
    }

    for(let rowNum = 14; rowNum <= 50; rowNum++) {
      const row = ws.getRow(rowNum);
      const circId = String(row.getCell(1).value||'').trim();
      if(!circId || !circId.match(/^[A-Z]\d+$/i)) continue;
      if(!circId.toUpperCase().startsWith(rack.toUpperCase())) continue;

      let highlighted = false, colorType = null;
      for(let c = 1; c <= 6; c++) {
        const color = getCellColor(row.getCell(c));
        if(color === CYAN || color === LIGHT_CYAN) { highlighted = true; colorType = 'cyan'; break; }
        if(color === YELLOW) { highlighted = true; colorType = 'yellow'; break; }
      }
      if(!highlighted) continue;

      const run = parseFloat(row.getCell(21).value)||0;
      const riser = parseFloat(row.getCell(22).value)||20;
      const sh = sizeToFraction(row.getCell(23).value);
      const sr = sizeToFraction(row.getCell(24).value);
      const lh = sizeToFraction(row.getCell(25).value);
      const evap = parseFloat(String(row.getCell(9).value||'').replace('+',''))||0;
      const app = String(row.getCell(7).value||row.getCell(5).value||'');
      const note = String(row.getCell(4).value||'');

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

// Parse Williams & Rowe BPR format (.xlsx with "NEW" in column 4)
function parseBPR(wb, circuits, meta) {
  wb.eachSheet((ws, sheetId) => {
    const sName = ws.name;
    if(sName.includes('Module') || sName.includes('Chart')) return;
    if(!sName.match(/Remote\s*Hdr|Rack|RACK/i)) return;

    const rack = sName.replace(/Remote\s*Hdr\s*/i,'Hdr').replace(/\s*\(\d+\)/,'')
      .replace(/^Rack\s*/i,'').replace(/^RACK\s*/i,'').trim();

    for(let rowNum = 13; rowNum <= 60; rowNum++) {
      const row = ws.getRow(rowNum);
      const circIdRaw = String(row.getCell(1).value||'').trim();
      if(!circIdRaw || isNaN(parseFloat(circIdRaw))) continue;

      const exchr = String(row.getCell(4).value||'').trim().toUpperCase();
      if(exchr !== 'NEW') continue;

      const app = String(row.getCell(7).value||'');
      if(!app || app.match(/SPARE|spare/)) continue;

      const run = parseFloat(row.getCell(21).value)||0;
      const sh = sizeToFraction(row.getCell(22).value);
      if(!run || !sh) continue;

      const sr = sizeToFraction(row.getCell(23).value);
      const lh = sizeToFraction(row.getCell(24).value);
      const evap = parseFloat(String(row.getCell(9).value||'').replace('+',''))||0;

      circuits.push({
        circuitId: `${rack}-${circIdRaw}`, rack,
        runLength: run, riserLength: 20,
        sucHoriz: sh, sucRiser: sr, liqHoriz: lh,
        tempType: evap < 0 ? 'low' : 'medium',
        application: app, isRiserOnly: false,
        colorType: 'new', notes: 'NEW — BPR format'
      });
    }
  });
}

// Parse any .xls format using SheetJS (no color detection, uses NEW keyword)
function parseXLS(xlsBuffer, circuits, meta) {
  const wb = XLSX.read(xlsBuffer, {type:'buffer', cellStyles: true});

  for(const sName of wb.SheetNames) {
    if(sName.includes('Module') || sName.includes('Chart')) continue;

    const ws = wb.Sheets[sName];
    const data = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
    if(!data || data.length < 5) continue;

    let rack = sName.replace(/Remote\s*Hdr\s*/i,'Hdr').replace(/\s*\(\d+\)/,'')
      .replace(/^Rack\s*/i,'').replace(/^RACK\s*/i,'').trim();

    // For generic sheet names (Sheet1, Sheet2), try to find rack name from data content
    if(!rack || rack.match(/^Sheet\d+$/i)) {
      for(let r = 0; r < Math.min(data.length, 15); r++) {
        for(let c = 0; c < Math.min((data[r]||[]).length, 5); c++) {
          const v = String(data[r][c]||'').trim();
          if(v.match(/^Rack\s+[A-Z]$/i)) { rack = v.replace(/^Rack\s*/i,'').trim(); break; }
          if(v.match(/^Remote\s*Hdr/i)) { rack = v.replace(/Remote\s*Hdr\s*/i,'Hdr').replace(/\s*\(\d+\)/,'').trim(); break; }
        }
        if(rack && !rack.match(/^Sheet/i)) break;
      }
      if(!rack || rack.match(/^Sheet\d+$/i)) rack = 'S'+(wb.SheetNames.indexOf(sName)+1);
    }

    // Find header row
    let headerRow = -1;
    let runCol = -1, sucHCol = -1, sucRCol = -1, liqCol = -1, evapCol = -1, appCol = -1, exChrCol = -1;

    // Search multiple rows for headers (BPR has 2-row headers)
    for(let r = 5; r < Math.min(data.length, 20); r++) {
      const row = data[r] || [];
      const nextRow = data[r+1] || [];
      for(let c = 0; c < row.length; c++) {
        const v = String(row[c]||'').toLowerCase().trim();
        const v2 = String(nextRow[c]||'').toLowerCase().trim();
        const combined = v + ' ' + v2;
        if(v === 'run' || v === 'len.' || combined.includes('run len') || combined.includes('run horiz') && runCol < 0) { runCol = c; headerRow = r+1; }
        if((v.includes('suct') || combined.includes('suct')) && (v2.includes('hor') || v2 === 'horiz') && sucHCol < 0) sucHCol = c;
        if((v.includes('suct') || combined.includes('suct')) && (v2.includes('ris') || v2 === 'riser') && sucRCol < 0) sucRCol = c;
        if((v.includes('liq') || combined.includes('liq')) && (v2.includes('hor') || v2 === 'horiz') && liqCol < 0) liqCol = c;
        if(v.includes('evap') || v === '° f' || v2 === '° f' || v2.includes('evap')) evapCol = c;
        if(v === 'application' || v.includes('applic')) appCol = c;
        if(v === 'exchr.' || v.includes('exchr')) exChrCol = c;
        // Also check single row
        if(v === 'run' || v === 'len.' || (v.includes('run') && v.includes('len'))) { runCol = c; headerRow = r; }
        if(v.includes('suct') && (v.includes('hor') || v.includes('horiz'))) sucHCol = c;
        if(v.includes('suct') && v.includes('ris')) sucRCol = c;
        if(v.includes('liq') && (v.includes('hor') || v.includes('horiz')) && sucHCol >= 0) liqCol = c;
      }
      if(runCol >= 0 && sucHCol >= 0) break;
    }

    if(runCol < 0) continue;

    // Check store info in first few rows
    for(let r = 0; r < Math.min(data.length, 10); r++) {
      for(let c = 0; c < data[r].length; c++) {
        const v = String(data[r][c]||'');
        if(v.match(/Food Lion/i) && !meta.storeName) meta.storeName = 'Food Lion';
        if(v.match(/Store\s*(No|#)/i)) {
          const next = String(data[r][c+1]||'');
          if(next.match(/\d{3,4}/) && !meta.storeNo) meta.storeNo = next.match(/\d{3,4}/)[0];
        }
      }
    }

    // Process circuit rows
    for(let r = headerRow+1; r < data.length; r++) {
      const row = data[r];
      const circIdRaw = String(row[0]||'').trim();
      if(!circIdRaw) continue;

      // For BPR format: numeric circuit IDs, check exchr column for NEW
      const isNumeric = !isNaN(parseFloat(circIdRaw)) && parseFloat(circIdRaw) < 200;
      // For Kysor format: letter+number circuit IDs
      const isLetter = circIdRaw.match(/^[A-Z]\d+$/i);

      if(!isNumeric && !isLetter) continue;

      // Check if NEW
      let isNew = false;
      if(exChrCol >= 0) {
        const exchr = String(row[exChrCol]||'').trim().toUpperCase();
        if(exchr === 'NEW') isNew = true;
        if(exchr === 'EXISTING') { isNew = false; }
      }

      // For Kysor format without color, include all rows with run length
      if(isLetter && !isNew) {
        // Include if it has run length and pipe sizes (assume new if in schedule)
        isNew = true;
      }

      if(!isNew) continue;

      const run = parseFloat(String(row[runCol]||''))||0;
      if(!run) continue;

      const sh = sizeToFraction(sucHCol >= 0 ? row[sucHCol] : '');
      const sr = sizeToFraction(sucRCol >= 0 ? row[sucRCol] : '');
      const lh = sizeToFraction(liqCol >= 0 ? row[liqCol] : '');
      const evap = parseFloat(String(evapCol >= 0 ? row[evapCol]||'' : '').replace('+',''))||0;
      const app = String(appCol >= 0 ? row[appCol]||'' : row[6]||'');

      if(!sh) continue;
      if(app.match(/SPARE|spare/)) continue;

      const circId = isNumeric ? `${rack}-${circIdRaw}` : circIdRaw;

      if(!circuits.find(c => c.circuitId === circId)) {
        circuits.push({
          circuitId: circId, rack,
          runLength: run, riserLength: 20,
          sucHoriz: sh, sucRiser: sr, liqHoriz: lh,
          tempType: evap < 0 ? 'low' : 'medium',
          application: app, isRiserOnly: false,
          colorType: 'xls-parsed',
          notes: 'From .xls — verify highlighted circuits manually'
        });
      }
    }
  }
}

module.exports = async function handler(req, res) {
  if(req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});

  try {
    const {fileData, fileName} = req.body;
    if(!fileData) return res.status(400).json({error:'No file data'});

    const name = (fileName||'').toLowerCase();
    const buffer = Buffer.from(fileData, 'base64');
    const circuits = [];
    const meta = {storeName:'', storeNo:''};
    let format = 'unknown';

    if(name.endsWith('.xlsx')) {
      // Load with ExcelJS for color detection
      const wb = new ExcelJS.Workbook();
      await Promise.race([
        wb.xlsx.load(buffer),
        new Promise((_,rej) => setTimeout(() => rej(new Error('Timeout')), 15000))
      ]);

      // Detect format
      let isBPR = false, isKysor = false;
      wb.eachSheet((ws) => {
        if(ws.name.match(/^Rack\s+[A-Za-z]/i)) isKysor = true;
        if(ws.name.match(/Remote\s*Hdr/i)) isBPR = true;
        for(let r = 13; r <= 16; r++) {
          const v = String(ws.getRow(r).getCell(1).value||'').trim();
          if(!isNaN(parseFloat(v)) && parseFloat(v) < 200) isBPR = true;
          if(v.match(/^[A-Z]\d+$/i)) isKysor = true;
        }
      });

      if(isBPR && !isKysor) { parseBPR(wb, circuits, meta); format = 'bpr'; }
      else if(isKysor) { parseKysorWarren(wb, circuits, meta); format = 'kysor'; }
      else {
        parseKysorWarren(wb, circuits, meta);
        if(!circuits.length) parseBPR(wb, circuits, meta);
        format = circuits.length ? 'auto-detected' : 'unknown';
      }
    } else if(name.endsWith('.xls')) {
      // Use SheetJS for .xls — no color detection available
      try {
        parseXLS(buffer, circuits, meta);
        format = 'xls-no-colors';
      } catch(xlsErr) {
        return res.status(200).json({
          circuits: [], format: 'xls-error',
          storeName: meta.storeName, storeNumber: meta.storeNo,
          warning: `Could not parse ${fileName}. For best results, open this file in Excel and save as .xlsx format, then re-upload.`,
          summary: `0 circuits — XLS parse error: ${xlsErr.message}`
        });
      }
    }

    const racks = [...new Set(circuits.map(c=>c.rack))];
    let warning = null;
    if(format === 'xls-no-colors') {
      if(circuits.length === 0) {
        warning = `${fileName} is an older .xls format and no circuits were found. Please open this file in Excel and save as .xlsx, then re-upload for full circuit extraction with color detection.`;
      } else {
        warning = `${fileName} is an older .xls format — cell color highlighting cannot be detected. ${circuits.length} circuit(s) included. Please verify which are actually new work.`;
      }
    }

    return res.status(200).json({
      circuits, format,
      storeName: meta.storeName,
      storeNumber: meta.storeNo,
      warning,
      summary: `${circuits.length} circuit(s) found [${format}] across: ${racks.join(', ') || 'no racks detected'}`
    });

  } catch(err) {
    return res.status(500).json({error: err.message});
  }
};
