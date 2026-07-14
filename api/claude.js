// Text-extraction endpoint. Primary: Anthropic direct with a current-generation
// Claude model (stronger document extraction than the older gpt-4o path, which
// matters most on unfamiliar chain formats with no deterministic parser).
// Sonnet 5 is a reasoning model — it takes longer per call than gpt-4o did, so
// vercel.json raises the function maxDuration to 60s to accommodate it.
// If the Anthropic call fails for ANY reason (bad param, model change, outage),
// the request automatically retries through OpenRouter/gpt-4o rather than
// surfacing an error to the estimator mid-upload.
const CLAUDE_MODEL = 'claude-sonnet-5';

// Hard cap on the primary model. Sonnet 5 reasons before answering and a long
// chunk can run past a minute — but iOS Safari kills any request around the
// 60s mark ("Load failed"), taking the whole document analysis with it. 40s
// here + a ~10-15s gpt-4o fallback keeps every request comfortably inside
// both Safari's limit and the 60s Vercel function budget.
const PRIMARY_TIMEOUT_MS = 40_000;

async function callAnthropic({ messages, system, max_tokens }) {
  // Anthropic wants system top-level and no system-role messages inline.
  const sysParts = [system, ...messages.filter(m => m.role === 'system').map(m => m.content)].filter(Boolean);
  const chat = messages.filter(m => m.role !== 'system');
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: AbortSignal.timeout(PRIMARY_TIMEOUT_MS),
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens,
      // No temperature: Sonnet 5 rejects the parameter outright
      // ("`temperature` is deprecated for this model" → HTTP 400).
      // Thinking disabled: Sonnet 5 thinks by default when the field is
      // omitted, and thinking latency was blowing the 40s cap on big chunks.
      // These are structured-extraction calls — speed beats deliberation.
      thinking: { type: 'disabled' },
      ...(sysParts.length ? { system: sysParts.join('\n\n') } : {}),
      messages: chat,
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `Anthropic error ${response.status}`);
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
}

async function callOpenRouter({ messages, system, max_tokens, temperature }) {
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
  if (!response.ok) throw new Error(data?.error?.message || `OpenRouter error ${response.status}`);
  return data.choices?.[0]?.message?.content || '';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const messages = req.body.messages || [];
    const system = req.body.system;
    const max_tokens = req.body.max_tokens || 4000;
    // Deterministic extraction on the fallback path: temperature 0 so the same
    // document yields the same result every run.
    const temperature = typeof req.body.temperature === 'number' ? req.body.temperature : 0;

    let text = null;
    let lastError = null;

    if (process.env.ANTHROPIC_API_KEY) {
      try {
        text = await callAnthropic({ messages, system, max_tokens });
      } catch (e) {
        lastError = e;
      }
    }

    if (text == null && process.env.OPENROUTER_API_KEY) {
      try {
        text = await callOpenRouter({ messages, system, max_tokens, temperature });
      } catch (e) {
        lastError = e;
      }
    }

    if (text == null) {
      return res.status(500).json({ error: lastError?.message || 'No AI provider configured (set ANTHROPIC_API_KEY or OPENROUTER_API_KEY)' });
    }

    return res.status(200).json({
      content: [{ type: 'text', text }],
      choices: [{ message: { content: text } }],
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
