const mammoth = require('mammoth');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

module.exports = async function handler(req, res) {
  if(req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});

  try {
    const {fileData, fileName} = req.body;
    if(!fileData) return res.status(400).json({error:'No file data'});

    const buffer = Buffer.from(fileData, 'base64');
    const name = (fileName||'').toLowerCase();
    const isDocx = name.endsWith('.docx');
    const isDoc = name.endsWith('.doc') && !isDocx;

    let text = '';

    if(isDocx) {
      // Use mammoth for .docx
      try {
        const result = await mammoth.extractRawText({buffer});
        text = result.value || '';
      } catch(e) {
        return res.status(200).json({text:'', error:'Could not read .docx: '+e.message});
      }
    } else if(isDoc) {
      // Try mammoth first (sometimes works on .doc)
      try {
        const result = await mammoth.extractRawText({buffer});
        if(result.value && result.value.trim().length > 50) {
          text = result.value;
        }
      } catch(e) { /* try next method */ }

      // If mammoth failed, try LibreOffice conversion
      if(!text) {
        try {
          const tmpDir = os.tmpdir();
          const tmpFile = path.join(tmpDir, 'convert_' + Date.now() + '.doc');
          const outFile = path.join(tmpDir, 'convert_' + Date.now() + '.txt');
          fs.writeFileSync(tmpFile, buffer);
          execSync(`soffice --headless --convert-to txt "${tmpFile}" --outdir "${tmpDir}"`, {timeout: 15000});
          const txtFile = tmpFile.replace('.doc', '.txt');
          if(fs.existsSync(txtFile)) {
            text = fs.readFileSync(txtFile, {encoding:'utf8', flag:'r'});
            fs.unlinkSync(txtFile);
          }
          fs.unlinkSync(tmpFile);
        } catch(e) { /* try next method */ }
      }

      // Last resort: raw ASCII extraction
      if(!text) {
        const bytes = new Uint8Array(buffer);
        let rawText = '';
        let run = '';
        for(let i = 0; i < bytes.length; i++) {
          const c = bytes[i];
          if((c >= 32 && c < 127) || c === 9 || c === 10 || c === 13) {
            run += String.fromCharCode(c);
          } else {
            if(run.length > 4) rawText += run + ' ';
            run = '';
          }
        }
        const lines = rawText.split(/[\n\r\s]{3,}/)
          .map(l => l.trim())
          .filter(l => l.length > 15 && /[a-zA-Z]{3,}/.test(l))
          .join('\n');
        if(lines.length > 100) text = lines;
      }
    }

    if(!text || !text.trim()) {
      return res.status(200).json({
        text: '',
        error: `Could not extract text from ${fileName}. Try converting to .docx format.`
      });
    }

    // NOTE: previously this truncated to text.slice(0, 12000) "to avoid token
    // overflow" — but that cut long documents (multi-week construction
    // schedules routinely run 30,000-60,000+ characters) down to roughly their
    // first 2-3 weeks before the text ever left this endpoint. The client-side
    // analyzeScopeDoc function already chunks long text into ~9,000-character
    // pieces and makes one AI call per chunk specifically to manage token
    // limits per-call — so truncating here was redundant AND actively
    // discarding most of the document before that logic ever got to run.
    // Send the FULL extracted text; let the caller decide how to chunk it.
    return res.status(200).json({
      text: text,
      length: text.length
    });

  } catch(err) {
    return res.status(500).json({error: err.message});
  }
};
