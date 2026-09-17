#!/usr/bin/env node
/**
 * Drop-in replacement for local-ai-cli `ask`.
 *
 *   ask "your question"
 *   echo "long text" | ask "summarize this"
 *   LLM_REASON=1 ask "think step by step"
 */

import { pathToFileURL } from 'node:url';
import { main } from './cli.js';

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  await main(['node', 'cli.js', 'ask', ...process.argv.slice(2)]);
}
