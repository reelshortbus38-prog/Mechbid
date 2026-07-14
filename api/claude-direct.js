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
      signal: AbortSignal.timeout(45_000),
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

    // Primary (Claude) and the cross-check second opinion (GPT-4o) run in
    // PARALLEL, each with its own cap. Running them back-to-back with an
    // uncapped primary blew Vercel's 60s budget on dense plan sheets — the
    // function was killed mid-flight and every upload read "0 found" with no
    // error surfaced. Worst case now ≈ max(50s, 45s), inside the 60s budget —
    // dense M-series sheets kept blowing a 40s cap, so the caps run as close
    // to the budget as response overhead allows.
    const primaryPromise = (async () => {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: AbortSignal.timeout(50_000),
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
          // Thinking DISABLED: Sonnet 5 runs adaptive thinking by default when
          // the field is omitted. On dense plan sheets it would think first —
          // a thinking block lands BEFORE the text block (clients reading
          // content[0].text saw "empty" responses), thinking tokens eat the
          // max_tokens budget, and the extra latency blew the time cap. This
          // is structured extraction under a hard 60s budget — no thinking.
          thinking: { type: 'disabled' },
          ...(system ? { system } : {}),
          messages,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || `Anthropic API error ${response.status}`);
      // Normalize to text-only blocks: even with thinking disabled, never
      // assume the text block is first — join every text block there is.
      const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
      if (!text) throw new Error('Anthropic returned no text content');
      return [{ type: 'text', text }];
    })();
    const secondPromise = crossCheck ? secondOpinion(messages, system, max_tokens) : Promise.resolve(null);

    let content = null, primaryErr = null;
    try { content = await primaryPromise; } catch (e) { primaryErr = e; }
    const second = await secondPromise;

    if (content == null && second != null) {
      // Primary timed out or errored but the second model answered — return
      // ITS read (marked) instead of a dead request. Degrade, don't die.
      return res.status(200).json({ content: [{ type: 'text', text: second }], fallbackModel: 'gpt-4o' });
    }
    if (content == null) {
      return res.status(502).json({ error: primaryErr?.message || 'Vision analysis failed' });
    }

    // Normalize to the same { content: [{ type: 'text', text }] } shape
    // api/claude.js returns. The second opinion rides along for the client
    // to diff — best-effort, absent on any failure.
    return res.status(200).json({ content, ...(second ? { secondOpinion: second } : {}) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
