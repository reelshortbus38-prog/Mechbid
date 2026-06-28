export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    let messages = req.body.messages || [];
    const system = req.body.system;
    
    // If system prompt provided, prepend as system message for OpenRouter
    if (system) {
      messages = [{ role: 'system', content: system }, ...messages];
    }

    const body = {
      model: 'openai/gpt-4o',  // Use gpt-4o for vision support
      max_tokens: req.body.max_tokens || 4000,
      // Deterministic extraction: temperature 0 so the same document yields the
      // same result every run (otherwise the model splits/merges callouts
      // differently each time and the task count drifts, e.g. 8 vs 9 vs 12).
      temperature: typeof req.body.temperature === 'number' ? req.body.temperature : 0,
      messages,
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
    if (!response.ok) return res.status(response.status).json(data);

    // Return in a format our frontend can use
    const text = data.choices?.[0]?.message?.content || '';
    return res.status(200).json({
      content: [{ type: 'text', text }],
      choices: data.choices,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
