# dottie-local

Local **llama.cpp** inference + optional **[dotbot](https://github.com/stevederico/dotbot)** harness.

**Replaces [local-ai-cli](https://github.com/stevederico/local-ai-cli)** for LLM (`ask` + `llm-server`). Same CLI names on PATH after install. STT/TTS stays **[dottie-talk](https://github.com/stevederico/dottie-talk)** (`transcribe` / `speak`).

Same product shape as dottie-talk: HTTP + MCP + CLI. Talk is voice; this is tokens.

Private for now. Written as if it will be public (MIT, no secrets, clear docs).

## What it is

| Layer | Role |
|---|---|
| **llama-server** | Engine (GGUF → tokens). HTTP only. |
| **dottie-local** | Façade: start/health, OpenAI proxy, MCP, CLI |
| **dotbot** | Optional agent loop + `dot_*` tools on top |

Two processes. Never vendors Metal into the harness.

## Requirements

- Node.js ≥ 22
- [`llama-server`](https://github.com/ggml-org/llama.cpp) on `PATH`
- A GGUF (or let `-hf` download). Default model: `ggml-org/gemma-4-12B-it-GGUF` (prefers cached Q8_0)

## Install

```bash
git clone https://github.com/stevederico/dottie-local.git
cd dottie-local
npm install
npm link          # puts ask, llm-server, dottie-local on PATH
```

Remove or unlink old local-ai-cli `ask` / `llm-server` first so PATH does not shadow.

## Quick start

```bash
ask "hello"                                    # drop-in for local-ai-cli
echo "$(cat article.txt)" | ask "summarize this"
LLM_REASON=1 ask "prove it"

llm-server start|stop|restart|status|log

dottie-local agent "What tools do you have?"   # harness + dot_* tools
dottie-local /ask "…"                          # same as ask
dottie-local start                             # HTTP :1321
dottie-local health
```

## Ports

| Port / env | Service |
|---|---|
| **8080** (`LLM_PORT` / `DOTTIE_LOCAL_ENGINE_PORT`) | `llama-server`. Reuses healthy server. |
| **1321** (`DOTTIE_LOCAL_HTTP_PORT`) | dottie-local HTTP façade |
| `LLM_REASON=1` | enable thinking on `ask` (default off) |
| `LLM_MODEL` / `DOTTIE_LOCAL_MODEL` | GGUF path or HF repo |

## HTTP

| Method | Path | Notes |
|---|---|---|
| `GET` | `/health` | Engine + façade |
| `POST` | `/v1/local/complete` | Buffered `{ message }` → `{ text }` |
| `POST` | `/v1/agent/chat` | Dotbot harness → `{ text, events }` |
| `*` | `/v1/chat/completions` | Proxied to engine (SSE ok) |
| `GET` | `/v1/models` | Proxied |

## MCP tools

| Tool | Does |
|---|---|
| `complete` | One-shot chat, no tools |
| `agent` | Dotbot loop with `dot_*` tools |

```bash
npm run mcp
```

## CLI

| Command | Does |
|---|---|
| `ask <text>` | Stream completion (local-ai-cli drop-in) |
| `llm-server …` | Manage warm engine (local-ai-cli drop-in) |
| `dottie-local ask\|/ask` | Same as `ask` |
| `dottie-local agent\|/agent` | Dotbot tools |
| `dottie-local start\|health\|stop` | HTTP façade / status |

`dottie-local stop` only kills an engine **this package spawned**. `llm-server stop` also matches `llama-server` on the engine port (full drop-in).

## Related

- [dottie-talk](https://github.com/stevederico/dottie-talk) — local STT/TTS (replaces local-ai-cli `transcribe`)
- [local-ai-cli](https://github.com/stevederico/local-ai-cli) — predecessor; LLM half superseded here
- [dotbot](https://github.com/stevederico/dotbot) — agent harness
- [llama.cpp](https://github.com/ggml-org/llama.cpp) — inference engine
- [dottie-desktop](https://github.com/stevederico/dottie-desktop) — desktop app

## License

MIT
