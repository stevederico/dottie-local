/**
 * Supervise llama-server (OpenAI-compatible HTTP).
 * Prefer an already-healthy engine on ENGINE_PORT — do not double-load the GGUF.
 */

import { spawn, execSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  createWriteStream,
  readdirSync,
  writeFileSync,
  readFileSync,
  unlinkSync,
} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PORTS } from './ports.js';

const HOME = os.homedir();
const STATE_DIR = process.env.DOTTIE_LOCAL_STATE
  || path.join(HOME, '.local', 'state', 'dottie-local');
const LOG = path.join(STATE_DIR, 'engine.log');
const PIDF = path.join(STATE_DIR, 'engine.pid');

const DEFAULT_MODEL = process.env.DOTTIE_LOCAL_MODEL
  || process.env.LLM_MODEL
  || 'ggml-org/gemma-4-12B-it-GGUF';
const NGL = process.env.DOTTIE_LOCAL_NGL || process.env.LLM_NGL || '999';

/** @type {import('node:child_process').ChildProcess | null} */
let child = null;
/** @type {Promise<void> | null} */
let startPromise = null;

function log(msg) {
  process.stderr.write(`[dottie-local] ${msg}\n`);
}

export function engineBaseUrl() {
  return `http://127.0.0.1:${PORTS.ENGINE_PORT}`;
}

/**
 * @param {typeof fetch} [fetchFn]
 */
export async function engineHealthy(fetchFn = globalThis.fetch) {
  try {
    const res = await fetchFn(`${engineBaseUrl()}/health`, {
      signal: AbortSignal.timeout(2_000),
    });
    if (!res.ok) return false;
    const body = await res.text();
    return /"status"\s*:\s*"ok"/i.test(body) || res.status === 200;
  } catch {
    return false;
  }
}

/**
 * Resolve llama-server argv model flags (-m path or -hf repo).
 * Prefers a cached Q8_0 GGUF (same policy as ~/.dotfiles/llm/llm-server).
 * @param {string} [model]
 * @returns {string[]}
 */
export function resolveModelArgs(model = DEFAULT_MODEL) {
  if (existsSync(model)) return ['-m', model];
  const repo = model.split(':')[0];
  const dir = path.join(HOME, '.cache', 'huggingface', 'hub', `models--${repo.replace(/\//g, '--')}`);
  if (existsSync(dir)) {
    const pats = ['Q8_0.gguf', 'Q5_K', 'Q4_K', '.gguf'];
    for (const pat of pats) {
      const hits = walkFiles(dir).filter((f) => {
        const base = path.basename(f);
        if (/mmproj/i.test(base)) return false;
        if (pat.startsWith('.')) return base.endsWith(pat);
        return base.includes(pat);
      });
      if (hits[0]) return ['-m', hits[0]];
    }
  }
  return ['-hf', model];
}

/**
 * @param {string} dir
 * @returns {string[]}
 */
function walkFiles(dir) {
  /** @type {string[]} */
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkFiles(p));
    else out.push(p);
  }
  return out;
}

function llamaServerPath() {
  try {
    return execSync('sh -c "command -v llama-server"', {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `/opt/homebrew/bin:/usr/local/bin:${HOME}/.local/bin:${process.env.PATH || ''}`,
      },
    }).trim();
  } catch {
    return '';
  }
}

/**
 * Ensure llama-server is healthy. Spawns one if needed.
 * @param {object} [opts]
 * @param {typeof fetch} [opts.fetchFn]
 */
export async function ensureEngineRunning({ fetchFn = globalThis.fetch } = {}) {
  if (await engineHealthy(fetchFn)) return;
  if (startPromise) return startPromise;
  startPromise = spawnEngine(fetchFn).finally(() => {
    startPromise = null;
  });
  return startPromise;
}

/**
 * @param {typeof fetch} fetchFn
 */
async function spawnEngine(fetchFn) {
  if (await engineHealthy(fetchFn)) return;

  const bin = llamaServerPath();
  if (!bin) {
    throw new Error(
      'llama-server not on PATH — install llama.cpp (e.g. ~/.dotfiles/llm/install-llm.sh) or set PATH',
    );
  }

  mkdirSync(STATE_DIR, { recursive: true });
  const modelArgs = resolveModelArgs();
  const args = [
    ...modelArgs,
    '--jinja',
    '-ngl', String(NGL),
    '--host', '127.0.0.1',
    '--port', String(PORTS.ENGINE_PORT),
  ];

  log(`starting llama-server on :${PORTS.ENGINE_PORT} (${modelArgs.join(' ')})`);
  const out = createWriteStream(LOG, { flags: 'a' });
  child = spawn(bin, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  child.stdout?.pipe(out);
  child.stderr?.pipe(out);
  child.on('exit', (code, signal) => {
    log(`llama-server exited code=${code} signal=${signal}`);
    child = null;
  });
  try {
    writeFileSync(PIDF, String(child.pid ?? ''), 'utf8');
  } catch { /* ok */ }

  for (let i = 0; i < 120; i++) {
    if (await engineHealthy(fetchFn)) {
      log(`engine ready on ${engineBaseUrl()}`);
      return;
    }
    if (child && child.exitCode !== null) {
      throw new Error(`llama-server exited during startup — see ${LOG}`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`llama-server did not become ready — see ${LOG}`);
}

/**
 * @param {typeof fetch} [fetchFn]
 */
export async function engineHealthPayload(fetchFn = globalThis.fetch) {
  const ok = await engineHealthy(fetchFn);
  /** @type {{ ok: boolean, engine: string, port: number, model?: string, error?: string }} */
  const payload = {
    ok,
    engine: 'llama-server',
    port: PORTS.ENGINE_PORT,
  };
  if (!ok) {
    payload.error = `llama-server not healthy on :${PORTS.ENGINE_PORT}`;
    return payload;
  }
  try {
    const res = await fetchFn(`${engineBaseUrl()}/v1/models`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (res.ok) {
      const json = await res.json();
      const id = json?.data?.[0]?.id;
      if (typeof id === 'string') payload.model = id;
    }
  } catch { /* ok */ }
  return payload;
}

export function engineLogPath() {
  return LOG;
}

export function enginePidPath() {
  return PIDF;
}

/**
 * Stop only an engine this process spawned (pid file). Never pkill a shared server.
 */
export function stopEngine() {
  if (child && !child.killed) {
    child.kill('SIGTERM');
    child = null;
    try { unlinkSync(PIDF); } catch { /* ok */ }
    log('stopped child llama-server');
    return true;
  }
  if (existsSync(PIDF)) {
    const pid = Number(readFileSync(PIDF, 'utf8').trim());
    if (pid > 0) {
      try {
        process.kill(pid, 'SIGTERM');
        log(`sent SIGTERM to pid ${pid}`);
      } catch { /* already gone */ }
    }
    try { unlinkSync(PIDF); } catch { /* ok */ }
    return true;
  }
  log('no child engine to stop (shared server left running)');
  return false;
}

/**
 * Drop-in llm-server stop: pid file, then match llama-server on ENGINE_PORT.
 * @returns {'stopped' | 'not running'}
 */
export function stopEngineForce() {
  let stopped = false;
  if (child && !child.killed) {
    child.kill('SIGTERM');
    child = null;
    stopped = true;
  }
  if (existsSync(PIDF)) {
    const pid = Number(readFileSync(PIDF, 'utf8').trim());
    if (pid > 0) {
      try {
        process.kill(pid, 'SIGTERM');
        stopped = true;
      } catch { /* already gone */ }
    }
    try { unlinkSync(PIDF); } catch { /* ok */ }
  }
  try {
    execSync(`pkill -f "llama-server .*--port ${PORTS.ENGINE_PORT}"`, { stdio: 'ignore' });
    stopped = true;
  } catch { /* no match */ }
  return stopped ? 'stopped' : 'not running';
}
