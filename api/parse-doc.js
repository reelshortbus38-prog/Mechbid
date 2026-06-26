const mammoth = require('mammoth');
const WordExtractor = require('word-extractor');
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
    // Which extraction path produced the text — returned to the client so the
    // upload UI can warn when a legacy .doc fell back to the crude raw-text
    // reader (which runs words together and hurts AI extraction quality).
    let method = 'none';
    // Whether LibreOffice (soffice) is actually present in this runtime. On
    // Vercel's serverless runtime it isn't, so .doc conversion falls back to
    // raw text. Probed once below, reported so you can confirm it from a real
    // upload instead of guessing.
    let libreofficeAvailable = null;

    if(isDocx) {
      // Use mammoth for .docx
      try {
        const result = await mammoth.extractRawText({buffer});
        text = result.value || '';
        method = 'mammoth-docx';
      } catch(e) {
        return res.status(200).json({text:'', error:'Could not read .docx: '+e.message});
      }
    } else if(isDoc) {
      // word-extractor reads the legacy OLE .doc format properly (preserving
      // word and paragraph boundaries), which the raw-text fallback could not —
      // critical for circuit-tagged scope lines like "C7 = REPLACE 7/8 SUCTION
      // LINE WITH 1 3/8". This is a pure-JS reader, so it works on the
      // serverless runtime where LibreOffice isn't available.
      try {
        const doc = await new WordExtractor().extract(buffer);
        const body = (doc.getBody() || '').trim();
        if(body.length > 50) { text = body; method = 'word-extractor'; }
      } catch(e) { /* try next method */ }

      // Fall back to mammoth (occasionally handles a .doc)
      if(!text) {
        try {
          const result = await mammoth.extractRawText({buffer});
          if(result.value && result.value.trim().length > 50) {
            text = result.value;
            method = 'mammoth-doc';
          }
        } catch(e) { /* try next method */ }
      }

      // Probe for LibreOffice once, so we both know whether to attempt it and
      // can report availability back to the client.
      if(!text) {
        try {
          execSync('soffice --version', {timeout: 5000, stdio: 'ignore'});
          libreofficeAvailable = true;
        } catch(e) {
          libreofficeAvailable = false;
        }
      }

      // If mammoth failed and LibreOffice exists, convert with it.
      if(!text && libreofficeAvailable) {
        try {
          const tmpDir = os.tmpdir();
          const tmpFile = path.join(tmpDir, 'convert_' + Date.now() + '.doc');
          fs.writeFileSync(tmpFile, buffer);
          execSync(`soffice --headless --convert-to txt "${tmpFile}" --outdir "${tmpDir}"`, {timeout: 15000});
          const txtFile = tmpFile.replace('.doc', '.txt');
          if(fs.existsSync(txtFile)) {
            text = fs.readFileSync(txtFile, {encoding:'utf8', flag:'r'});
            method = 'libreoffice';
            fs.unlinkSync(txtFile);
          }
          fs.unlinkSync(tmpFile);
        } catch(e) { /* try next method */ }
      }

      // Last resort: raw ASCII extraction
      if(!text) {
        method = 'raw-ascii';
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
        method: 'none',
        libreofficeAvailable,
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
      length: text.length,
      method,
      libreofficeAvailable,
    });

  } catch(err) {
    return res.status(500).json({error: err.message});
  }
};
