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

// Convert Anthropic-format messages to OpenAI/OpenRouter format so the SAME
// image + prompt can be run through a second, different model for the vision
// cross-check (two similar models make correlated mistakes; a different one
// disagrees in more informative ways).
function toOpenAiMessages(messages) {
  return messages.map(m => ({
    role: m.role,
    content: Array.isArray(m.content)
      ? m.content.map(b => {
          if (b.type === 'image' && b.source?.type === 'base64') {
            return { type: 'image_url', image_url: { url: `data:${b.source.media_type};base64,${b.source.data}` } };
          }
          return { type: 'text', text: b.text || '' };
        })
      : m.content,
  }));
}

async function secondOpinion(messages, system, max_tokens) {
  if (!process.env.OPENROUTER_API_KEY) return null;
  try {
    const orMessages = system ? [{ role: 'system', content: system }, ...toOpenAiMessages(messages)] : toOpenAiMessages(messages);
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(35_000),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + process.env.OPENROUTER_API_KEY,
        'HTTP-Referer': 'https://mechbid.vercel.app',
        'X-Title': 'MechBid',
      },
      body: JSON.stringify({ model: 'openai/gpt-4o', max_tokens: max_tokens || 4000, temperature: 0, messages: orMessages }),
    });
    const data = await response.json();
    if (!response.ok) return null;
    return data.choices?.[0]?.message?.content || null;
  } catch {
    return null; // the second opinion is best-effort — never fail the primary
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { messages, system, max_tokens, model, temperature, crossCheck } = req.body;
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
        // No temperature: Sonnet 5 rejects the parameter outright
        // ("`temperature` is deprecated for this model" → HTTP 400).
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
    // endpoint it called. When crossCheck is requested, a second model
    // (GPT-4o via OpenRouter) reads the same input and its raw text rides
    // along for the client to diff — best-effort, null on any failure.
    const second = crossCheck ? await secondOpinion(messages, system, max_tokens) : null;
    return res.status(200).json({ content: data.content, ...(second ? { secondOpinion: second } : {}) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
