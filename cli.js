#!/usr/bin/env node
/**
 * dottie-local CLI — ask / agent / start / health / stop
 *
 *   dottie-local ask "hello"
 *   dottie-local agent "search memory for my name"
 *   dottie-local start
 *   dottie-local health
 *   dottie-local stop
 */

import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { complete } from './core.js';
import { agentChat } from './agent.js';
import { ensureEngineRunning, engineHealthPayload, stopEngine } from './engine.js';
import { PORTS } from './ports.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function usage(code = 0) {
  const text = `dottie-local — local llama.cpp + optional dotbot harness

Usage:
  dottie-local ask <text>          One-shot completion (no tools)
  dottie-local /ask <text>         Same as ask
  dottie-local agent <text>        Agent turn with dot_* tools
  dottie-local /agent <text>       Same as agent
  dottie-local start               HTTP façade :${PORTS.HTTP_PORT} (+ engine :${PORTS.ENGINE_PORT})
  dottie-local health
  dottie-local stop                Stop engine child this process started
  dottie-local help

Env:
  DOTTIE_LOCAL_ENGINE_PORT   default ${PORTS.ENGINE_PORT}
  DOTTIE_LOCAL_HTTP_PORT     default ${PORTS.HTTP_PORT}
  DOTTIE_LOCAL_MODEL / LLM_MODEL
`;
  process.stderr.write(text);
  process.exit(code);
}

/** Strip leading slash so /ask and ask are the same command. */
export function normalizeCmd(raw) {
  if (typeof raw !== 'string' || !raw) return 'help';
  return raw.startsWith('/') ? raw.slice(1) : raw;
}

/**
 * @param {string[]} argv
 */
export function parseArgs(argv) {
  const args = argv.slice(2);
  const cmd = normalizeCmd(args[0] || 'help');
  const positionals = [];
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('-')) continue;
    positionals.push(a);
  }
  return {
    cmd,
    text: ['ask', 'agent'].includes(cmd) ? positionals.join(' ') : '',
  };
}

async function cmdAsk(text) {
  if (!text.trim()) {
    process.stderr.write('usage: dottie-local ask|/ask <text>\n');
    process.exit(1);
  }
  await ensureEngineRunning();
  const result = await complete({ message: text });
  if (result.error) {
    process.stderr.write(`${result.error}\n`);
    process.exit(1);
  }
  process.stdout.write(`${result.text}\n`);
}

async function cmdAgent(text) {
  if (!text.trim()) {
    process.stderr.write('usage: dottie-local agent <text>\n');
    process.exit(1);
  }
  await ensureEngineRunning();
  const result = await agentChat({ message: text });
  if (result.error) {
    process.stderr.write(`${result.error}\n`);
    process.exit(1);
  }
  process.stdout.write(`${result.text}\n`);
}

async function cmdHealth() {
  const h = await engineHealthPayload();
  process.stdout.write(`${JSON.stringify({
    service: 'dottie-local',
    httpPort: PORTS.HTTP_PORT,
    ...h,
  }, null, 2)}\n`);
  process.exit(h.ok ? 0 : 1);
}

function cmdStart() {
  const httpJs = path.join(__dirname, 'http.js');
  const child = spawn(process.execPath, [httpJs], {
    stdio: 'inherit',
    env: process.env,
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}

function cmdStop() {
  const stopped = stopEngine();
  process.stdout.write(stopped ? 'stopped\n' : 'nothing to stop\n');
}

/**
 * @param {string[]} argv
 */
export async function main(argv = process.argv) {
  const { cmd, text } = parseArgs(argv);
  switch (cmd) {
    case 'ask':
      await cmdAsk(text);
      break;
    case 'agent':
      await cmdAgent(text);
      break;
    case 'start':
      cmdStart();
      break;
    case 'health':
      await cmdHealth();
      break;
    case 'stop':
      cmdStop();
      break;
    case 'help':
    case '-h':
    case '--help':
      usage(0);
      break;
    default:
      process.stderr.write(`unknown command: ${cmd}\n`);
      usage(1);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  });
}
