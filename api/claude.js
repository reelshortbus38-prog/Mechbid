// Text-extraction endpoint. Prefers Anthropic direct (current-generation
// Claude — measurably better at document extraction than the older gpt-4o
// this used to call, which matters most on unfamiliar chain formats where
// there's no deterministic parser to lean on). Falls back to OpenRouter's
// gpt-4o automatically if no ANTHROPIC_API_KEY is configured, so nothing
// breaks on an env that only has the OpenRouter key.
const CLAUDE_MODEL = 'claude-sonnet-5';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const messages = req.body.messages || [];
    const system = req.body.system;
    const max_tokens = req.body.max_tokens || 4000;
    // Deterministic extraction: temperature 0 so the same document yields the
    // same result every run (otherwise the model splits/merges callouts
    // differently each time and the task count drifts, e.g. 8 vs 9 vs 12).
    const temperature = typeof req.body.temperature === 'number' ? req.body.temperature : 0;

    if (process.env.ANTHROPIC_API_KEY) {
      // Anthropic wants system top-level and no system-role messages inline.
      const sysParts = [system, ...messages.filter(m => m.role === 'system').map(m => m.content)].filter(Boolean);
      const chat = messages.filter(m => m.role !== 'system');
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens,
          temperature,
          ...(sysParts.length ? { system: sysParts.join('\n\n') } : {}),
          messages: chat,
        }),
      });
      const data = await response.json();
      if (!response.ok) return res.status(response.status).json(data);
      const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
      return res.status(200).json({
        content: [{ type: 'text', text }],
        choices: [{ message: { content: text } }],
      });
    }

    // Fallback: OpenRouter (original path)
    const orMessages = system ? [{ role: 'system', content: system }, ...messages] : messages;
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + process.env.OPENROUTER_API_KEY,
        'HTTP-Referer': 'https://mechbid.vercel.app',
        'X-Title': 'MechBid'
      },
      body: JSON.stringify({ model: 'openai/gpt-4o', max_tokens, temperature, messages: orMessages })
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);

    const text = data.choices?.[0]?.message?.content || '';
    return res.status(200).json({
      content: [{ type: 'text', text }],
      choices: data.choices,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
