/**
 * Unit tests — no live llama-server required.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from './cli.js';
import { resolveModelArgs } from './engine.js';
import {
  complete,
  mergeAskPrompt,
  reasoningEffortFromEnv,
  sseContentDelta,
} from './core.js';
import { PORTS } from './ports.js';
import { LOCAL_TOOLS } from './mcp.js';

describe('parseArgs', () => {
  it('parses ask text', () => {
    const r = parseArgs(['node', 'cli.js', 'ask', 'hello', 'world']);
    assert.equal(r.cmd, 'ask');
    assert.equal(r.text, 'hello world');
  });

  it('parses /ask as ask', () => {
    const r = parseArgs(['node', 'cli.js', '/ask', 'hello']);
    assert.equal(r.cmd, 'ask');
    assert.equal(r.text, 'hello');
  });

  it('parses agent', () => {
    const r = parseArgs(['node', 'cli.js', 'agent', 'do', 'stuff']);
    assert.equal(r.cmd, 'agent');
    assert.equal(r.text, 'do stuff');
  });

  it('parses /agent as agent', () => {
    const r = parseArgs(['node', 'cli.js', '/agent', 'do']);
    assert.equal(r.cmd, 'agent');
    assert.equal(r.text, 'do');
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
