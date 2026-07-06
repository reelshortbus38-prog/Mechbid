// ── DIRECT ANTHROPIC API CALL ───────────────────────────────────────────────
// Separate from api/claude.js (which routes through OpenRouter and is used by
// most of the app). This calls Anthropic directly, for the specific calls
// where lower hallucination rate matters most — starting with redline/
// blueprint vision extraction, where a fabricated address or blended circuit
// ID costs real money. Requires ANTHROPIC_API_KEY in Vercel env vars.
//
// Note the request shape difference from api/claude.js: Anthropic's image
// content blocks use {type: "image", source: {type: "base64", media_type,
// data}} — NOT the OpenAI/OpenRouter-style {type: "image_url", image_url:
// {url: "data:..."}} shape used elsewhere in this app. Callers must build
// messages in Anthropic's format, not reuse the OpenRouter message shape.

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { messages, system, max_tokens, model, temperature } = req.body;
    if (!messages) return res.status(400).json({ error: 'No messages provided' });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-5',
        max_tokens: max_tokens || 4000,
        // Deterministic extraction — same document, same result every run.
        temperature: typeof temperature === 'number' ? temperature : 0,
        ...(system ? { system } : {}),
        messages,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error?.message || `Anthropic API error ${response.status}`, raw: data });
    }

    // Normalize to the same { content: [{ type: 'text', text }] } shape
    // api/claude.js returns, so client code doesn't need to branch on which
    // endpoint it called.
    return res.status(200).json({ content: data.content });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
