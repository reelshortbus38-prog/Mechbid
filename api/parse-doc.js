const mammoth = require('mammoth');

module.exports = async function handler(req, res) {
  if(req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});

  try {
    const {fileData, fileName} = req.body;
    if(!fileData) return res.status(400).json({error:'No file data'});

    const buffer = Buffer.from(fileData, 'base64');
    
    // Extract text from Word doc
    const result = await mammoth.extractRawText({buffer});
    const text = result.value || '';

    if(!text.trim()) {
      return res.status(200).json({text:'', error:'No text could be extracted from this document'});
    }

    return res.status(200).json({
      text,
      length: text.length,
      preview: text.slice(0, 500)
    });

  } catch(err) {
    return res.status(500).json({error: err.message});
  }
};
