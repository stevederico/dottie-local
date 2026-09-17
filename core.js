/**
 * dottie-local core — complete() against llama-server.
 * ask parity with local-ai-cli: stream SSE, stdin append, LLM_REASON.
 */

import { engineBaseUrl } from './engine.js';
import { PORTS } from './ports.js';

/**
 * Gemma / llama-server reasoning_effort. LLM_REASON=1 → medium; else none.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function reasoningEffortFromEnv(env = process.env) {
  return env.LLM_REASON === '1' ? 'medium' : 'none';
}

/**
 * Merge CLI args + piped stdin (local-ai-cli ask behavior).
 * @param {string} argvText
 * @param {string} stdinText
 */
export function mergeAskPrompt(argvText, stdinText) {
  const q = typeof argvText === 'string' ? argvText : '';
  const s = typeof stdinText === 'string' ? stdinText : '';
  if (!s) return q;
  if (!q.trim()) return s;
  return `${q}\n\n${s}`;
}

/**
 * Parse one SSE `data:` payload line; return content delta or null.
 * @param {string} line
 * @returns {string | null}
 */
export function sseContentDelta(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) return null;
  const payload = trimmed.slice(5).trim();
  if (!payload || payload === '[DONE]') return null;
  try {
    const json = JSON.parse(payload);
    const d = json?.choices?.[0]?.delta?.content;
    return typeof d === 'string' ? d : null;
  } catch {
    return null;
  }
}

/**
 * @param {object} opts
 * @param {string} [opts.message]
 * @param {string} [opts.model]
 * @param {Array<{role: string, content: string}>} [opts.messages]
 * @param {boolean} [opts.stream]
 * @param {(delta: string) => void} [opts.onDelta]
 * @param {string} [opts.reasoningEffort]
 * @param {number} [opts.maxTokens]
 * @param {typeof fetch} [opts.fetchFn]
 * @returns {Promise<{ text: string, model?: string }|{ error: string }>}
 */
export async function complete({
  message,
  model,
  messages,
  stream = false,
  onDelta,
  reasoningEffort,
  maxTokens = 2048,
  fetchFn = globalThis.fetch,
} = {}) {
  /** @type {Array<{role: string, content: string}>} */
  let msgs = messages;
  if (!msgs) {
    if (typeof message !== 'string' || !message.trim()) {
      return { error: 'message (string) required' };
    }
    msgs = [{ role: 'user', content: message.trim() }];
  }

  /** @type {Record<string, unknown>} */
  const body = {
    messages: msgs,
    stream: !!stream,
    max_tokens: maxTokens,
    reasoning_effort: reasoningEffort ?? reasoningEffortFromEnv(),
  };
  if (model) body.model = model;
  if (!body.model) body.model = 'local';

  try {
    const res = await fetchFn(`${engineBaseUrl()}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(300_000),
    });

    if (stream) {
      return consumeStream(res, onDelta);
    }

    const textBody = await res.text();
    let json;
    try {
      json = JSON.parse(textBody);
    } catch {
      return { error: `engine ${res.status}: ${textBody.slice(0, 300)}` };
    }
    if (!res.ok) {
      const err = json.error?.message || json.error || textBody.slice(0, 300);
      return { error: `engine ${res.status}: ${err}` };
    }
    const text = json.choices?.[0]?.message?.content;
    if (typeof text !== 'string') {
      return { error: 'engine returned no message content' };
    }
    return {
      text,
      model: typeof json.model === 'string' ? json.model : undefined,
    };
  } catch (err) {
    const gone = err.cause?.code === 'ECONNREFUSED' || /fetch failed/i.test(err.message);
    return {
      error: gone
        ? `llama-server not running on :${PORTS.ENGINE_PORT} — run: dottie-local start`
        : err.message,
    };
  }
}

/**
 * @param {Response} res
 * @param {(delta: string) => void} [onDelta]
 */
async function consumeStream(res, onDelta) {
  if (!res.ok) {
    const textBody = await res.text();
    return { error: `engine ${res.status}: ${textBody.slice(0, 300)}` };
  }
  if (!res.body) {
    return { error: 'engine returned empty stream body' };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let text = '';
  /** @type {string | undefined} */
  let model;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      const delta = sseContentDelta(line);
      if (delta) {
        text += delta;
        if (onDelta) onDelta(delta);
      }
      // best-effort model from first chunk
      if (!model && line.trim().startsWith('data:')) {
        try {
          const p = line.trim().slice(5).trim();
          if (p && p !== '[DONE]') {
            const j = JSON.parse(p);
            if (typeof j.model === 'string') model = j.model;
          }
        } catch { /* ok */ }
      }
    }
  }

  return { text, model };
}

export const LOCAL_PORTS = {
  ENGINE: PORTS.ENGINE_PORT,
  HTTP: PORTS.HTTP_PORT,
};
