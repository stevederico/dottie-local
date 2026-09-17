#!/usr/bin/env node
/**
 * Drop-in replacement for local-ai-cli `llm-server`.
 *
 *   llm-server [start|stop|restart|status|log]
 */

import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { PORTS } from './ports.js';
import {
  ensureEngineRunning,
  engineHealthy,
  engineLogPath,
  stopEngineForce,
} from './engine.js';

function usage(code = 1) {
  process.stderr.write('usage: llm-server [start|stop|restart|status|log]\n');
  process.exit(code);
}

/**
 * @param {string[]} argv
 */
export async function main(argv = process.argv) {
  const cmd = argv[2] || 'start';
  switch (cmd) {
    case 'start': {
      if (await engineHealthy()) {
        process.stdout.write(`already running on :${PORTS.ENGINE_PORT}\n`);
        return;
      }
      process.stderr.write(
        `starting local model server (loads the model once; ~15s for 12B)…\n`,
      );
      await ensureEngineRunning();
      process.stdout.write(`ready on http://127.0.0.1:${PORTS.ENGINE_PORT}\n`);
      break;
    }
    case 'stop': {
      process.stdout.write(`${stopEngineForce()}\n`);
      break;
    }
    case 'restart': {
      stopEngineForce();
      await new Promise((r) => setTimeout(r, 1000));
      process.stderr.write(
        `starting local model server (loads the model once; ~15s for 12B)…\n`,
      );
      await ensureEngineRunning();
      process.stdout.write(`ready on http://127.0.0.1:${PORTS.ENGINE_PORT}\n`);
      break;
    }
    case 'status': {
      const ok = await engineHealthy();
      process.stdout.write(ok ? `running on :${PORTS.ENGINE_PORT}\n` : 'not running\n');
      process.exit(ok ? 0 : 1);
      break;
    }
    case 'log': {
      const logPath = engineLogPath();
      const child = spawn('tail', ['-n', '40', '-f', logPath], { stdio: 'inherit' });
      child.on('exit', (code) => process.exit(code ?? 0));
      break;
    }
    case 'help':
    case '-h':
    case '--help':
      usage(0);
      break;
    default:
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
