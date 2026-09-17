/**
 * Unit tests — no live llama-server required.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from './cli.js';
import { resolveModelArgs, stopEngineForce, engineLogPath } from './engine.js';
import {
  complete,
  mergeAskPrompt,
  reasoningEffortFromEnv,
  sseContentDelta,
} from './core.js';
import { PORTS } from './ports.js';
import { tagsFromOpenAIModels } from './http.js';
import { LOCAL_TOOLS } from './mcp.js';
import { main as llmServerMain } from './llm-server.js';

describe('parseArgs', () => {
  it('parses ask text', () => {
    const r = parseArgs(['node', 'cli.js', 'ask', 'hello', 'world']);
    assert.equal(r.cmd, 'ask');
    assert.equal(r.text, 'hello world');
  });

  it('parses agent', () => {
    const r = parseArgs(['node', 'cli.js', 'agent', 'do', 'stuff']);
    assert.equal(r.cmd, 'agent');
    assert.equal(r.text, 'do stuff');
  });

  it('defaults to help', () => {
    assert.equal(parseArgs(['node', 'cli.js']).cmd, 'help');
  });
});

describe('mergeAskPrompt', () => {
  it('returns argv only', () => {
    assert.equal(mergeAskPrompt('hi', ''), 'hi');
  });

  it('returns stdin only', () => {
    assert.equal(mergeAskPrompt('', 'body'), 'body');
  });

  it('appends stdin after argv', () => {
    assert.equal(mergeAskPrompt('summarize', 'long'), 'summarize\n\nlong');
  });
});

describe('reasoningEffortFromEnv', () => {
  it('defaults to none', () => {
    assert.equal(reasoningEffortFromEnv({}), 'none');
  });

  it('LLM_REASON=1 → medium', () => {
    assert.equal(reasoningEffortFromEnv({ LLM_REASON: '1' }), 'medium');
  });
});

describe('sseContentDelta', () => {
  it('extracts delta content', () => {
    const line = 'data: {"choices":[{"delta":{"content":"hi"}}]}';
    assert.equal(sseContentDelta(line), 'hi');
  });

  it('skips DONE', () => {
    assert.equal(sseContentDelta('data: [DONE]'), null);
  });
});

describe('ports', () => {
  it('exposes engine + http', () => {
    assert.equal(typeof PORTS.ENGINE_PORT, 'number');
    assert.equal(typeof PORTS.HTTP_PORT, 'number');
  });

  it('defaults http to 1318 when env unset', () => {
    if (process.env.DOTTIE_LOCAL_HTTP_PORT) return;
    assert.equal(PORTS.HTTP_PORT, 1318);
  });
});

describe('tagsFromOpenAIModels', () => {
  it('maps OpenAI data[].id to Ollama models[].name', () => {
    assert.deepEqual(
      tagsFromOpenAIModels({ data: [{ id: 'gemma' }, { id: 'qwen' }] }),
      { models: [{ name: 'gemma' }, { name: 'qwen' }] },
    );
  });

  it('returns empty models for bad/missing input', () => {
    assert.deepEqual(tagsFromOpenAIModels(null), { models: [] });
    assert.deepEqual(tagsFromOpenAIModels({}), { models: [] });
    assert.deepEqual(tagsFromOpenAIModels({ data: [{ id: 1 }, {}] }), { models: [] });
  });
});

describe('resolveModelArgs', () => {
  it('uses -hf when path missing', () => {
    const args = resolveModelArgs('org/no-such-model-zzzz');
    assert.deepEqual(args, ['-hf', 'org/no-such-model-zzzz']);
  });
});

describe('complete', () => {
  it('requires message', async () => {
    const r = await complete({ message: '' });
    assert.ok(r.error);
  });

  it('uses injected fetch (buffered)', async () => {
    const fetchFn = async (_url, init) => {
      const body = JSON.parse(init.body);
      assert.equal(body.stream, false);
      assert.equal(body.reasoning_effort, 'none');
      assert.equal(body.max_tokens, 2048);
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            model: 'test',
            choices: [{ message: { content: 'pong' } }],
          });
        },
      };
    };
    const r = await complete({ message: 'ping', fetchFn });
    assert.equal(r.text, 'pong');
    assert.equal(r.model, 'test');
  });

  it('streams SSE deltas via onDelta', async () => {
    const sse = [
      'data: {"model":"m","choices":[{"delta":{"content":"hel"}}]}\n',
      'data: {"choices":[{"delta":{"content":"lo"}}]}\n',
      'data: [DONE]\n',
    ].join('');
    const enc = new TextEncoder();
    const fetchFn = async (_url, init) => {
      const body = JSON.parse(init.body);
      assert.equal(body.stream, true);
      assert.equal(body.reasoning_effort, 'medium');
      let i = 0;
      return {
        ok: true,
        status: 200,
        body: {
          getReader() {
            return {
              async read() {
                if (i >= 1) return { done: true, value: undefined };
                i += 1;
                return { done: false, value: enc.encode(sse) };
              },
            };
          },
        },
      };
    };
    const parts = [];
    const r = await complete({
      message: 'ping',
      stream: true,
      reasoningEffort: 'medium',
      onDelta: (d) => parts.push(d),
      fetchFn,
    });
    assert.equal(r.text, 'hello');
    assert.deepEqual(parts, ['hel', 'lo']);
    assert.equal(r.model, 'm');
  });
});

describe('LOCAL_TOOLS', () => {
  it('exports complete and agent', () => {
    const names = LOCAL_TOOLS.map((t) => t.name);
    assert.ok(names.includes('complete'));
    assert.ok(names.includes('agent'));
  });
});

describe('engine helpers', () => {
  it('exposes log path', () => {
    assert.ok(engineLogPath().includes('dottie-local'));
  });

  it('stopEngineForce returns a status string', () => {
    const r = stopEngineForce();
    assert.ok(r === 'stopped' || r === 'not running');
  });
});

describe('llm-server main', () => {
  it('rejects unknown command', async () => {
    const prev = process.exitCode;
    let code;
    const realExit = process.exit;
    process.exit = (c) => { code = c; throw new Error('exit'); };
    try {
      await llmServerMain(['node', 'llm-server.js', 'nope']);
    } catch (err) {
      assert.equal(err.message, 'exit');
    } finally {
      process.exit = realExit;
      process.exitCode = prev;
    }
    assert.equal(code, 1);
  });
});
