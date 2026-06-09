export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer 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'
      },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    return res.status(200).json(data);
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
