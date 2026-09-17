#!/usr/bin/env node
/**
 * dottie-local MCP stdio — complete + agent against local llama-server + dotbot.
 *
 *   node mcp.js
 */

import { pathToFileURL } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { complete } from './core.js';
import { agentChat } from './agent.js';
import { ensureEngineRunning } from './engine.js';

export const LOCAL_TOOLS = [
  {
    name: 'complete',
    description: 'One-shot chat completion via local llama-server (no tools).',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'User message' },
        model: { type: 'string', description: 'Optional model id' },
      },
      required: ['message'],
    },
  },
  {
    name: 'agent',
    description:
      'Run the dotbot agent harness against the local model (dot_* tools: memory, web, files, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'User message / task' },
        model: { type: 'string', description: 'Optional model id' },
        maxTurns: { type: 'number', description: 'Agent loop cap (default 10)' },
      },
      required: ['message'],
    },
  },
];

const server = new Server(
  { name: 'dottie-local', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: LOCAL_TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = req.params.arguments || {};

  if (name === 'complete') {
    const result = await complete({
      message: args.message,
      model: args.model,
    });
    if (result.error) {
      return { content: [{ type: 'text', text: result.error }], isError: true };
    }
    return {
      content: [{ type: 'text', text: result.text }],
      structuredContent: { text: result.text, model: result.model },
    };
  }

  if (name === 'agent') {
    const result = await agentChat({
      message: args.message,
      model: args.model || 'local',
      maxTurns: typeof args.maxTurns === 'number' ? args.maxTurns : 10,
    });
    if (result.error) {
      return { content: [{ type: 'text', text: result.error }], isError: true };
    }
    return {
      content: [{ type: 'text', text: result.text }],
      structuredContent: {
        text: result.text,
        truncated: result.truncated || false,
      },
    };
  }

  return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
});

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  await ensureEngineRunning();
  await server.connect(new StdioServerTransport());
}
