export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = {
      model: 'openai/gpt-4o-mini',
      max_tokens: req.body.max_tokens || 1000,
      messages: req.body.messages
    };
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + process.env.OPENROUTER_API_KEY,
        'HTTP-Referer': 'https://mechbid.vercel.app',
        'X-Title': 'MechBid'
      },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if(!response.ok) return res.status(response.status).json(data);
    return res.status(200).json(data);
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
