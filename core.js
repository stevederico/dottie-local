/**
 * dottie-local core — complete() against llama-server.
 */

import { engineBaseUrl } from './engine.js';
import { PORTS } from './ports.js';

/**
 * @param {object} opts
 * @param {string} opts.message
 * @param {string} [opts.model]
 * @param {Array<{role: string, content: string}>} [opts.messages]
 * @param {boolean} [opts.stream]
 * @param {typeof fetch} [opts.fetchFn]
 * @returns {Promise<{ text: string, model?: string }|{ error: string }>}
 */
export async function complete({
  message,
  model,
  messages,
  stream = false,
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

  const body = {
    messages: msgs,
    stream: false,
  };
  if (model) body.model = model;
  // llama-server accepts empty/omitted model when one GGUF is loaded
  if (!body.model) body.model = 'local';

  if (stream) {
    return { error: 'complete() is buffered — use HTTP /v1/chat/completions for SSE' };
  }

  try {
    const res = await fetchFn(`${engineBaseUrl()}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(300_000),
    });
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

export const LOCAL_PORTS = {
  ENGINE: PORTS.ENGINE_PORT,
  HTTP: PORTS.HTTP_PORT,
};
