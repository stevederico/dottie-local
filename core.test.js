/**
 * Unit tests — no live llama-server required.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from './cli.js';
import { resolveModelArgs } from './engine.js';
import { complete } from './core.js';
import { PORTS } from './ports.js';
import { LOCAL_TOOLS } from './mcp.js';

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

  it('uses injected fetch', async () => {
    const fetchFn = async () => ({
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          model: 'test',
          choices: [{ message: { content: 'pong' } }],
        });
      },
    });
    const r = await complete({ message: 'ping', fetchFn });
    assert.equal(r.text, 'pong');
    assert.equal(r.model, 'test');
  });
});

describe('LOCAL_TOOLS', () => {
  it('exports complete and agent', () => {
    const names = LOCAL_TOOLS.map((t) => t.name);
    assert.ok(names.includes('complete'));
    assert.ok(names.includes('agent'));
  });
});
