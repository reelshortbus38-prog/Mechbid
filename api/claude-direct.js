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

// The cross-check / fallback reader. Deliberately a DIFFERENT model family:
// two similar models make correlated mistakes, and a different one disagrees
// in more informative ways. It is never authoritative — its finds become
// "verify this" flags, and its read is only used at all when the primary
// failed outright, and then only with a fallbackModel marker attached.
const SECOND_MODEL = process.env.COLDGAUGE_SECOND_MODEL || 'openai/gpt-4o';

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
        'HTTP-Referer': 'https://coldgauge.vercel.app',
        'X-Title': 'Coldgauge',
      },
      body: JSON.stringify({ model: SECOND_MODEL, max_tokens: max_tokens || 4000, temperature: 0, messages: orMessages }),
    });
    const data = await response.json();
    if (!response.ok) return null;
    return data.choices?.[0]?.message?.content || null;
  } catch {
    return null; // the second opinion is best-effort — never fail the primary
  }
}

// Vision model. Sonnet 5 is the default because it has the SAME high-
// resolution vision as Opus 5 (2576px long edge) at 60% of the input cost and
// meaningfully lower latency, which matters against a hard 60s function
// budget. COLDGAUGE_VISION_MODEL lets the drawing-vision path be moved to
// claude-opus-5 from Vercel env vars without a deploy, to A/B stronger
// reasoning on ambiguous plan geometry against the latency risk.
const VISION_MODEL = process.env.COLDGAUGE_VISION_MODEL || 'claude-sonnet-5';

// Thinking is DISABLED on Sonnet 5 (it runs adaptive thinking by default when
// the field is omitted): thinking tokens eat the max_tokens budget and the
// latency blew the time cap on dense plan sheets, and this is structured
// extraction, not deliberation.
//
// Opus-class models are the exception. There, `disabled` is only accepted at
// effort `high` or below, and running disabled has two documented failure
// modes that would silently corrupt a takeoff: tool calls emitted as plain
// text, and `<thinking>` tags leaking into the text block (which lands
// non-JSON in front of the JSON we parse). The documented fix is to let it
// think — adaptive keeps it brief on easy sheets.
function thinkingFor(model) {
  return /^claude-(opus|fable)/.test(model) ? { type: 'adaptive' } : { type: 'disabled' };
}

// Belt-and-braces for the leakage failure mode above: a stray thinking block
// rendered as text must never reach the JSON parser.
function stripLeakedThinking(text) {
  return text.replace(/<thinking>[\s\S]*?<\/thinking>\s*/gi, '');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { messages, system, max_tokens, model, crossCheck } = req.body;
    if (!messages) return res.status(400).json({ error: 'No messages provided' });
    const activeModel = model || VISION_MODEL;

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
          model: activeModel,
          max_tokens: max_tokens || 4000,
          // No temperature: Sonnet 5 rejects the parameter outright
          // ("`temperature` is deprecated for this model" → HTTP 400).
          thinking: thinkingFor(activeModel),
          ...(system ? { system } : {}),
          messages,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || `Anthropic API error ${response.status}`);
      // Normalize to text-only blocks: a thinking block can land BEFORE the
      // text block, so never assume content[0] is the answer — join every
      // text block there is (reading [0].text turned good answers into
      // "empty AI response" failures).
      const text = stripLeakedThinking(
        (data.content || []).filter(b => b.type === 'text').map(b => b.text).join(''));
      if (!text) throw new Error('Anthropic returned no text content');
      return [{ type: 'text', text }];
    })();
    const secondPromise = crossCheck ? secondOpinion(messages, system, max_tokens) : Promise.resolve(null);

    let content = null, primaryErr = null;
    try { content = await primaryPromise; } catch (e) { primaryErr = e; }
    const second = await secondPromise;

    if (content == null && second != null) {
      // Primary timed out or errored but the second model answered — return
      // ITS read instead of a dead request. Degrade, don't die. But the
      // second model is the weaker reader, so this MUST be marked: an
      // unlabelled backup read is a quietly worse takeoff, and the client
      // turns fallbackModel into a warning naming the sheet.
      return res.status(200).json({
        content: [{ type: 'text', text: second }],
        fallbackModel: SECOND_MODEL,
        primaryError: primaryErr?.message || 'primary model unavailable',
      });
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
