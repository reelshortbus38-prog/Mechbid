const ExcelJS = require('exceljs');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CYAN = 'FF00FFFF';
const YELLOW = 'FFFFFF00';
const LIGHT_CYAN = 'FF69FFFF';
const LIGHT_GREEN = 'FFCCFFCC';

function sizeToFraction(val) {
  if(!val || val === 0) return '';
  const str = String(val).trim();
  // Already a fraction string like "1 3/8" or "1-3/8" or '1 3/8"'
  if(str.match(/\d[\s-]?\d\/\d/)) return str.replace(/"/g,'') + '"';
  if(str.match(/^\d\/\d/)) return str.replace(/"/g,'') + '"';
  // Decimal
  const map = {
    0.25:'1/4"',0.375:'3/8"',0.5:'1/2"',0.625:'5/8"',
    0.75:'3/4"',0.875:'7/8"',1.0:'1"',1.125:'1-1/8"',
    1.25:'1-1/4"',1.375:'1-3/8"',1.5:'1-1/2"',1.625:'1-5/8"',
    2.125:'2-1/8"',2.625:'2-5/8"',3.125:'3-1/8"',3.625:'3-5/8"'
  };
  const f = parseFloat(str);
  if(!isNaN(f)) return map[Math.round(f*1000)/1000] || str+'"';
  return str;
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

function isNewColor(color) {
  return color === CYAN || color === LIGHT_CYAN || color === YELLOW || color === LIGHT_GREEN;
}

async function convertXlsToXlsx(buffer, fileName) {
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, 'convert_' + Date.now() + path.extname(fileName));
  const outDir = tmpDir;
  fs.writeFileSync(tmpFile, buffer);
  try {
    execSync(`soffice --headless --convert-to xlsx "${tmpFile}" --outdir "${outDir}"`, {timeout:20000});
    const xlsxFile = tmpFile.replace(/\.xls$/i, '.xlsx');
    if(fs.existsSync(xlsxFile)) {
      const data = fs.readFileSync(xlsxFile);
      fs.unlinkSync(xlsxFile);
      fs.unlinkSync(tmpFile);
      return data;
    }
  } catch(e) {
    try { fs.unlinkSync(tmpFile); } catch {}
    throw new Error('XLS conversion failed: ' + e.message);
  }
  try { fs.unlinkSync(tmpFile); } catch {}
  throw new Error('XLS conversion produced no output');
}

function detectFormat(wb) {
  // Check sheet names and circuit ID patterns
  let hasRackSheets = false;
  let hasRemoteHdr = false;
  let hasNumericCircuits = false;
  let hasLetterCircuits = false;

  wb.eachSheet((ws) => {
    const name = ws.name;
    if(name.match(/^Rack\s+[A-Z]/i)) hasRackSheets = true;
    if(name.match(/Remote\s*Hdr|Hdr\s*\d/i)) hasRemoteHdr = true;
    // Check first few circuit rows
    for(let r = 13; r <= 18; r++) {
      const val = String(ws.getRow(r).getCell(1).value||'').trim();
      if(val && !isNaN(parseFloat(val)) && parseFloat(val) < 200) hasNumericCircuits = true;
      if(val && val.match(/^[A-Z]\d+$/)) hasLetterCircuits = true;
    }
  });

  if(hasRemoteHdr || (hasNumericCircuits && !hasLetterCircuits)) return 'bpr';
  if(hasRackSheets && hasLetterCircuits) return 'kysor';
  if(hasRackSheets) return 'kysor'; // Default for rack-based sheets
  return 'unknown';
}

function parseKysorFormat(wb, circuits, storeName, storeNo) {
  // Kysor Warren / standard format
  // Sheets: "Rack A", "Rack B", etc
  // Circuit IDs: A1, A2, B3, etc
  // New circuits: cyan (FF00FFFF) highlighted cells
  // Columns: 1=CircID, 5=App, 7=App(alt), 9=Evap, 21=Run, 22=VertRiser, 23=SucH, 24=SucR, 25=LiqH

  wb.eachSheet((ws, sheetId) => {
    const sName = ws.name;
    if(!sName.match(/^Rack\s+/i)) return;
    const rack = sName.replace(/^Rack\s+/i,'').trim();

    // Get store info from first sheet
    if(sheetId === 1) {
      for(let r = 1; r <= 10; r++) {
        const row = ws.getRow(r);
        row.eachCell((cell, colNum) => {
          const v = String(cell.value||'');
          if(v.includes('Store No') || v.includes('Store #')) {
            const next = ws.getRow(r).getCell(colNum+1);
            if(next.value && !storeNo[0]) storeNo[0] = String(next.value);
          }
          if(v === 'Food Lion' && !storeName[0]) storeName[0] = v;
        });
      }
    }

    for(let rowNum = 14; rowNum <= 50; rowNum++) {
      const row = ws.getRow(rowNum);
      const circId = String(row.getCell(1).value||'').trim();
      if(!circId || !circId.startsWith(rack)) continue;

      let highlighted = false;
      let colorType = null;
      for(let c = 1; c <= 6; c++) {
        const color = getCellColor(row.getCell(c));
        if(color === CYAN || color === LIGHT_CYAN) { highlighted = true; colorType = 'cyan'; break; }
        if(color === YELLOW) { highlighted = true; colorType = 'yellow'; break; }
      }
      if(!highlighted) continue;

      const run = parseFloat(row.getCell(21).value) || 0;
      const riser = parseFloat(row.getCell(22).value) || 20;
      const sh = sizeToFraction(row.getCell(23).value);
      const sr = sizeToFraction(row.getCell(24).value);
      const lh = sizeToFraction(row.getCell(25).value);
      const evap = parseFloat(String(row.getCell(9).value||'').replace('+','')) || 0;
      const app = String(row.getCell(7).value || row.getCell(5).value || '');
      const note = String(row.getCell(4).value||'');
      const tempType = evap < 0 ? 'low' : 'medium';
      const isRiserOnly = run === 0 && sr !== '';

      circuits.push({
        circuitId: circId, rack, runLength: run, riserLength: riser,
        sucHoriz: sh, sucRiser: sr, liqHoriz: lh, tempType,
        application: app, isRiserOnly, colorType,
        notes: note || (colorType === 'yellow' ? 'Yellow highlight — verify' : '')
      });
    }
  });
}

function parseBPRFormat(wb, circuits, storeName, storeNo) {
  // Williams & Rowe BPR format
  // Sheets: "Remote Hdr 1 (1173)", "Remote Hdr 2 (1155)", "Rack A", "RACK D"
  // Circuit IDs: numbers (1, 2, 3...)
  // New circuits: col 4 = "NEW"
  // Columns: 1=No, 4=Exchr(NEW/EXISTING), 7=Application, 9=Evap
  //          21=Run, 22=SucHoriz, 23=SucRiser, 24=LiqHoriz

  wb.eachSheet((ws, sheetId) => {
    const sName = ws.name;
    if(sName.includes('Module') || sName.includes('Chart')) return;
    
    const isValidSheet = sName.match(/Remote\s*Hdr|Rack|RACK/i);
    if(!isValidSheet) return;

    // Derive rack label from sheet name
    let rack = sName
      .replace(/Remote\s*Hdr\s*/i, 'Hdr')
      .replace(/\s*\(\d+\)/, '')
      .replace(/^Rack\s*/i, '')
      .replace(/^RACK\s*/i, '')
      .trim();

    // Get store info
    if(sheetId === 1) {
      for(let r = 1; r <= 8; r++) {
        const row = ws.getRow(r);
        for(let c = 1; c <= 5; c++) {
          const v = String(row.getCell(c).value||'');
          if(v.match(/Store\s*#?\s*\d{3}/i)) {
            const match = v.match(/\d{3,4}/);
            if(match && !storeNo[0]) storeNo[0] = match[0];
          }
        }
      }
    }

    for(let rowNum = 13; rowNum <= 60; rowNum++) {
      const row = ws.getRow(rowNum);
      const circIdRaw = String(row.getCell(1).value||'').trim();
      if(!circIdRaw || isNaN(parseFloat(circIdRaw))) continue;

      const exchr = String(row.getCell(4).value||'').trim().toUpperCase();
      if(exchr !== 'NEW') continue;

      const app = String(row.getCell(7).value||'');
      if(!app || app.includes('SPARE') || app.includes('spare')) continue;

      const run = parseFloat(row.getCell(21).value) || 0;
      const sh = sizeToFraction(row.getCell(22).value);
      const sr = sizeToFraction(row.getCell(23).value);
      const lh = sizeToFraction(row.getCell(24).value);
      const evap = parseFloat(String(row.getCell(9).value||'').replace('+','')) || 0;
      const tempType = evap < 0 ? 'low' : 'medium';

      if(!run || !sh) continue;

      circuits.push({
        circuitId: `${rack}-${circIdRaw}`,
        rack, runLength: run, riserLength: 20,
        sucHoriz: sh, sucRiser: sr, liqHoriz: lh,
        tempType, application: app, isRiserOnly: false,
        colorType: 'new', notes: 'NEW — BPR schedule'
      });
    }
  });
}

function parseHeatcraftFormat(wb, circuits, storeName, storeNo) {
  // Heatcraft format — similar to Kysor Warren but may have different sheet names
  // Try to auto-detect based on available columns
  wb.eachSheet((ws, sheetId) => {
    const sName = ws.name;
    if(!sName.match(/Rack/i)) return;
    const rack = sName.replace(/Rack\s*/i,'').trim();

    if(sheetId === 1) {
      for(let r = 1; r <= 10; r++) {
        const row = ws.getRow(r);
        for(let c = 1; c <= 10; c++) {
          const v = String(row.getCell(c).value||'');
          if(v.includes('Customer') || v.includes('Store')) {
            const next = ws.getRow(r).getCell(c+1);
            if(next.value && !storeName[0]) storeName[0] = String(next.value);
          }
        }
      }
    }

    // Find header row
    let headerRow = 13;
    let runCol = 0, sucHCol = 0, sucRCol = 0, liqCol = 0, evapCol = 0, appCol = 0;

    for(let r = 10; r <= 16; r++) {
      const row = ws.getRow(r);
      for(let c = 1; c <= 30; c++) {
        const v = String(row.getCell(c).value||'').toLowerCase();
        if(v.includes('run') && v.includes('len')) { runCol = c; headerRow = r; }
        if(v.includes('suct') && (v.includes('hor') || v.includes('horiz'))) sucHCol = c;
        if(v.includes('suct') && v.includes('ris')) sucRCol = c;
        if(v.includes('liq') && (v.includes('hor') || v.includes('horiz'))) liqCol = c;
        if(v.includes('evap')) evapCol = c;
        if(v.includes('applic')) appCol = c;
      }
      if(runCol) break;
    }

    if(!runCol) return; // Can't find columns

    for(let rowNum = headerRow+1; rowNum <= 60; rowNum++) {
      const row = ws.getRow(rowNum);
      const circId = String(row.getCell(1).value||'').trim();
      if(!circId || circId.length < 2) continue;

      // Check for any highlighting
      let highlighted = false;
      for(let c = 1; c <= 8; c++) {
        const color = getCellColor(row.getCell(c));
        if(color && isNewColor(color)) { highlighted = true; break; }
        // Also check for gray/dark shading
        if(color && color !== 'FFFFFFFF' && color !== '00000000' && color !== 'FF000000') {
          highlighted = true; break;
        }
      }

      if(!highlighted) continue;

      const run = parseFloat(row.getCell(runCol).value) || 0;
      if(!run) continue;

      const sh = sizeToFraction(row.getCell(sucHCol).value);
      const sr = sizeToFraction(row.getCell(sucRCol).value);
      const lh = sizeToFraction(row.getCell(liqCol).value);
      const evap = parseFloat(String(row.getCell(evapCol||9).value||'').replace('+','')) || 0;
      const app = String(row.getCell(appCol||7).value||'');
      const tempType = evap < 0 ? 'low' : 'medium';

      circuits.push({
        circuitId: circId, rack, runLength: run, riserLength: 20,
        sucHoriz: sh, sucRiser: sr, liqHoriz: lh,
        tempType, application: app, isRiserOnly: false,
        colorType: 'highlighted', notes: ''
      });
    }
  });
}

module.exports = async function handler(req, res) {
  if(req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});

  try {
    const {fileData, fileName} = req.body;
    if(!fileData) return res.status(400).json({error:'No file data'});

    const name = (fileName||'').toLowerCase();
    let buffer = Buffer.from(fileData, 'base64');

    // Convert .xls to .xlsx if needed
    if(name.endsWith('.xls') && !name.endsWith('.xlsx')) {
      try {
        buffer = await convertXlsToXlsx(buffer, fileName);
      } catch(convErr) {
        return res.status(200).json({
          circuits: [], storeName: '', storeNumber: '',
          summary: `0 circuits — could not convert .xls file: ${convErr.message}`,
          warning: `${fileName} is an older .xls format. Try saving as .xlsx for better results.`
        });
      }
    }

    // Load workbook
    const wb = new ExcelJS.Workbook();
    await Promise.race([
      wb.xlsx.load(buffer),
      new Promise((_,reject) => setTimeout(() => reject(new Error('Timeout loading Excel')), 15000))
    ]);

    const circuits = [];
    const storeName = [''];
    const storeNo = [''];

    // Detect format and parse
    const format = detectFormat(wb);

    if(format === 'bpr') {
      parseBPRFormat(wb, circuits, storeName, storeNo);
    } else if(format === 'kysor') {
      parseKysorFormat(wb, circuits, storeName, storeNo);
    } else {
      // Try all formats
      parseKysorFormat(wb, circuits, storeName, storeNo);
      if(circuits.length === 0) parseBPRFormat(wb, circuits, storeName, storeNo);
      if(circuits.length === 0) parseHeatcraftFormat(wb, circuits, storeName, storeNo);
    }

    const racks = [...new Set(circuits.map(c=>c.rack))];
    return res.status(200).json({
      circuits,
      storeName: storeName[0] || '',
      storeNumber: storeNo[0] || '',
      format,
      summary: `${circuits.length} new circuit(s) found across rack(s): ${racks.join(', ') || 'none'} [Format: ${format}]`
    });

  } catch(err) {
    return res.status(500).json({error: err.message});
  }
};
