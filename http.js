#!/usr/bin/env node
/**
 * dottie-local HTTP — owns/attaches llama-server, proxies OpenAI routes, agent endpoint.
 * Default: node http.js  →  127.0.0.1:1321
 */

import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { PORTS } from './ports.js';
import { ensureEngineRunning, engineHealthPayload, engineBaseUrl, stopEngine } from './engine.js';
import { complete } from './core.js';
import { agentChat } from './agent.js';

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {string} targetBase
 */
async function proxy(req, res, targetBase) {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const target = `${targetBase}${url.pathname}${url.search}`;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  const headers = { ...req.headers };
  delete headers.host;
  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body: ['GET', 'HEAD'].includes(req.method || 'GET') ? undefined : body,
    duplex: 'half',
  });
  const outHeaders = {};
  upstream.headers.forEach((v, k) => {
    if (k === 'transfer-encoding') return;
    outHeaders[k] = v;
  });
  res.writeHead(upstream.status, outHeaders);
  // Stream SSE / large bodies
  if (upstream.body) {
    const reader = upstream.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
    return;
  }
  res.end(Buffer.from(await upstream.arrayBuffer()));
}

/**
 * Handle one request. Exported for tests.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
export async function handleLocalRequest(req, res) {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      const engine = await engineHealthPayload();
      res.writeHead(engine.ok ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok: engine.ok,
        service: 'dottie-local',
        httpPort: PORTS.HTTP_PORT,
        ...engine,
      }));
      return;
    }

    // Buffered helper for MCP / simple clients
    if (req.method === 'POST' && url.pathname === '/v1/local/complete') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      const result = await complete({
        message: body.message || body.prompt || '',
        model: body.model,
        messages: body.messages,
      });
      const status = result.error ? 502 : 200;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result.error ? { error: result.error } : result));
      return;
    }

    if (req.method === 'POST' && url.pathname === '/v1/agent/chat') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      const result = await agentChat({
        message: body.message || body.input || '',
        model: body.model || 'local',
        maxTurns: body.maxTurns || 10,
      });
      const status = result.error ? 502 : 200;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(
        result.error
          ? { error: result.error, events: result.events }
          : { text: result.text, truncated: result.truncated || false, events: result.events },
      ));
      return;
    }

    // OpenAI-compatible proxy to engine
    const proxyPaths = [
      '/v1/chat/completions',
      '/v1/completions',
      '/v1/models',
      '/v1/embeddings',
      '/v1/responses',
      '/completion',
      '/completions',
      '/props',
    ];
    if (proxyPaths.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))) {
      await proxy(req, res, engineBaseUrl());
      return;
    }
    if (req.method === 'GET' && url.pathname === '/v1/models') {
      await proxy(req, res, engineBaseUrl());
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message || String(err) }));
  }
}

/**
 * @param {number} [port]
 */
export async function startHttpServer(port = PORTS.HTTP_PORT) {
  await ensureEngineRunning();
  const server = http.createServer((req, res) => {
    handleLocalRequest(req, res).catch((err) => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
      }
      res.end(JSON.stringify({ error: err.message || String(err) }));
    });
  });

  await new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', resolve);
    server.on('error', reject);
  });

  process.stderr.write(`[dottie-local] HTTP http://127.0.0.1:${port} (engine ${engineBaseUrl()})\n`);

  const shutdown = () => {
    server.close();
    stopEngine();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  return server;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  startHttpServer().catch((err) => {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  });
}
