/**
 * Agent layer — @stevederico/dotbot harness pointed at local llama-server.
 */

import path from 'node:path';
import os from 'node:os';
import { mkdirSync } from 'node:fs';
import { engineBaseUrl } from './engine.js';

/**
 * Build a Provider object for agentLoop (bypasses env-at-import LOCAL_LLM_URL).
 * @param {string} [modelId]
 */
export function localProvider(modelId = 'local') {
  return {
    id: 'local',
    name: 'Local (dottie-local)',
    apiUrl: `${engineBaseUrl()}/v1`,
    defaultModel: modelId,
    models: [],
    local: true,
    supportsToolRole: true,
    headers: () => ({ 'Content-Type': 'application/json' }),
    endpoint: '/chat/completions',
    formatRequest: (messages, model) => ({ model, messages }),
    formatResponse: (data) => data?.choices?.[0]?.message?.content,
  };
}

function dataDir() {
  const dir = process.env.DOTTIE_LOCAL_DATA
    || path.join(os.homedir(), '.cache', 'dottie-local');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * One-shot agent turn with tools. Returns final text (+ optional event log).
 * @param {object} opts
 * @param {string} opts.message
 * @param {string} [opts.model]
 * @param {string} [opts.userId]
 * @param {number} [opts.maxTurns]
 * @returns {Promise<{ text: string, events: object[] }|{ error: string }>}
 */
export async function agentChat({
  message,
  model = 'local',
  userId = 'local',
  maxTurns = 10,
} = {}) {
  if (typeof message !== 'string' || !message.trim()) {
    return { error: 'message (string) required' };
  }

  let createAgent;
  let MemorySessionStore;
  let coreTools;
  try {
    const mod = await import('@stevederico/dotbot');
    createAgent = mod.createAgent;
    MemorySessionStore = mod.MemorySessionStore;
    coreTools = mod.coreTools;
  } catch (err) {
    return {
      error: `dotbot not installed — bun add @stevederico/dotbot (or npm i). ${err.message}`,
    };
  }

  const sessionStore = new MemorySessionStore();
  await sessionStore.init();
  const agent = createAgent({
    sessionStore,
    tools: coreTools,
  });

  const provider = localProvider(model);
  /** @type {object[]} */
  const events = [];
  let text = '';

  try {
    for await (const event of agent.chatRaw({
      messages: [
        { role: 'user', content: message.trim() },
      ],
      provider,
      model,
      maxTurns,
      tools: coreTools,
      context: { userID: userId, dataDir: dataDir() },
    })) {
      events.push(event);
      if (event.type === 'text_delta' && typeof event.text === 'string') {
        text += event.text;
      }
      if (event.type === 'done' && typeof event.content === 'string' && event.content) {
        text = event.content;
      }
      if (event.type === 'error') {
        return { error: event.error || 'agent error', events };
      }
      if (event.type === 'max_iterations') {
        return {
          text: text || event.message || 'max iterations',
          events,
          truncated: true,
        };
      }
    }
  } catch (err) {
    return { error: err.message, events };
  }

  return { text, events };
}
